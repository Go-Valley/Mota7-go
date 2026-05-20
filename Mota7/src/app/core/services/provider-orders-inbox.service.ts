import { Injectable, inject, EnvironmentInjector, runInInjectionContext, NgZone, signal } from '@angular/core';
import { Auth, onAuthStateChanged, type User } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  Timestamp,
  where,
} from '@angular/fire/firestore';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ToastController } from '@ionic/angular';
import { Haptics } from '@capacitor/haptics';
import { PROVIDER_INBOX_CRITERIA } from '../constants/provider-inbox-criteria';
import { orderNeedsFinalizeAfterArchive } from '../utils/order-lifecycle.util';
import {
  finalizeOrderRemovedFromUi,
  purgeFirestoreOrdersPastExpiresAt,
} from '../utils/order-lifecycle.firestore';
import { buildOrderPreviewForNtfy } from '../utils/order-ntfy.util';
import { resolveProviderPhoneFromAuth } from '../utils/provider-auth-phone.util';
import { isNtfyOrdersPipelineActive } from '../utils/ntfy-orders-policy.util';
import {
  isOrderVisibleInProviderInbox,
  type ProviderInboxMatchContext,
  type ProviderInboxOrder,
} from '../utils/provider-inbox-match.util';
import { ProviderOrderLocalNotificationService } from './provider-order-local-notification.service';

/**
 * طلبات العملاء: يقرأ من orders ويعرض فقط ما يطابق معايير fcm-push-server.
 */
@Injectable({ providedIn: 'root' })
export class ProviderOrdersInboxService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly zone = inject(NgZone);
  private readonly toastCtrl = inject(ToastController);
  private readonly providerOrderLocal = inject(ProviderOrderLocalNotificationService);

  readonly orders = signal<ProviderInboxOrder[]>([]);
  readonly isTracking = signal(false);
  readonly inboxBannerText = signal('');
  /** يُضبط عند فتح الصفحة من إشعار طلب جديد */
  readonly highlightOrderId = signal('');
  readonly userId = signal('');

  private started = false;
  private unsubOrders: (() => void) | null = null;
  private ordersRealtimeReady = false;
  private providerPhone = '';
  private providerAds: Record<string, unknown>[] = [];

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    runInInjectionContext(this.injector, () => {
      onAuthStateChanged(this.auth, (user) => {
        this.detachOrdersListener();
        this.orders.set([]);
        this.isTracking.set(false);
        this.userId.set('');
        this.ordersRealtimeReady = false;
        this.providerPhone = '';
        this.providerAds = [];

        if (!user) {
          return;
        }

        const uid = user.email ? user.email.split('@')[0] : user.uid;
        this.userId.set(uid);
        this.providerPhone = this.phoneFromAuthUser(user, uid);
        void this.reloadAdsAndListen();
      });
    });
  }

  async refreshAdsForCurrentUser(): Promise<void> {
    const user = this.auth.currentUser;
    const uid = this.userId();
    if (!user || !uid) {
      return;
    }
    this.providerPhone = this.phoneFromAuthUser(user, uid);
    await this.loadProviderAds();
    this.attachOrdersListener();
  }

  ignoreLocally(id: string): void {
    this.orders.update((xs) => xs.filter((o) => o.id !== id));
  }

  setHighlightOrderId(orderId: string): void {
    this.highlightOrderId.set(String(orderId || '').trim());
  }

  clearHighlightOrderId(): void {
    this.highlightOrderId.set('');
  }

  async acceptAndStartTracking(id: string): Promise<void> {
    const uid = this.userId();
    if (!uid) {
      return;
    }
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', id), {
          status: 'accepted',
          providerId: uid,
          acceptedAt: Timestamp.now(),
        })
      );
      this.isTracking.set(true);
    } catch (e) {
      console.error(e);
    }
  }

  orderVisibleToProvider(order: ProviderInboxOrder): boolean {
    return isOrderVisibleInProviderInbox(order, this.matchContext());
  }

  private matchContext(): ProviderInboxMatchContext {
    return {
      userId: this.userId(),
      providerPhone: this.providerPhone,
      providerAds: this.providerAds,
    };
  }

  private phoneFromAuthUser(user: User, uid: string): string {
    return resolveProviderPhoneFromAuth(user, uid);
  }

  private detachOrdersListener(): void {
    if (this.unsubOrders) {
      this.unsubOrders();
      this.unsubOrders = null;
    }
  }

  private async reloadAdsAndListen(): Promise<void> {
    await this.loadProviderAds();
    this.attachOrdersListener();
  }

  /** إعلانات المزود المتاحة — نفس شروط fcm-push-server (is_available + ad_type لاحقاً في المطابقة) */
  private async loadProviderAds(): Promise<void> {
    this.providerAds = [];
    if (!this.providerPhone) {
      return;
    }

    try {
      const snap = await runInInjectionContext(this.injector, () => {
        const constraints = [where('owner_phone', '==', this.providerPhone)];
        if (PROVIDER_INBOX_CRITERIA.providerAdQuery.requireIsAvailable) {
          constraints.push(where('is_available', '==', true));
        }
        const requiredStatus = PROVIDER_INBOX_CRITERIA.providerAdQuery.requireAdStatus;
        if (typeof requiredStatus === 'string' && requiredStatus.trim()) {
          constraints.push(where('status', '==', requiredStatus.trim()));
        }
        const adsQuery = query(collection(this.firestore, 'ads'), ...constraints);
        return getDocs(adsQuery);
      });
      this.providerAds = snap.docs.map((d) => d.data() as Record<string, unknown>);
    } catch (e) {
      console.error('[ProviderOrdersInbox] loadProviderAds', e);
    }
  }

  private attachOrdersListener(): void {
    this.detachOrdersListener();
    this.ordersRealtimeReady = false;

    this.unsubOrders = runInInjectionContext(this.injector, () => {
      const q = query(collection(this.firestore, 'orders'), orderBy('createdAt', 'desc'), limit(50));

      return onSnapshot(q, (snapshot) => {
        this.zone.run(() => {
          const ctx = this.matchContext();
          const allOrders: ProviderInboxOrder[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));

          for (const o of allOrders) {
            if (orderNeedsFinalizeAfterArchive(o)) {
              void finalizeOrderRemovedFromUi(this.injector, this.firestore, o.id);
            }
          }

          const filtered = allOrders.filter((order) => isOrderVisibleInProviderInbox(order, ctx));
          this.orders.set(filtered);

          this.isTracking.set(
            filtered.some((o) => o['status'] === 'accepted' && o['providerId'] === ctx.userId)
          );

          if (!snapshot.metadata.hasPendingWrites && this.ordersRealtimeReady) {
            for (const c of snapshot.docChanges()) {
              const data = c.doc.data();
              if (data['status'] !== 'pending') {
                continue;
              }
              const ord: ProviderInboxOrder = { id: c.doc.id, ...data };
              if (!isOrderVisibleInProviderInbox(ord, ctx)) {
                continue;
              }
              if (c.type === 'added' || c.type === 'modified') {
                void this.onProviderInboxNewOrderSignal(ord);
              }
            }
          }
          this.ordersRealtimeReady = true;

          void purgeFirestoreOrdersPastExpiresAt(this.injector, this.firestore);
        });
      });
    });
  }

  private async onProviderInboxNewOrderSignal(ord: ProviderInboxOrder): Promise<void> {
    const serviceType = String(ord['serviceType'] ?? 'other').trim().toLowerCase() || 'other';
    const preview = buildOrderPreviewForNtfy(ord);

    if (Capacitor.isNativePlatform()) {
      await this.providerOrderLocal.schedule({
        serviceType,
        preview,
        orderId: ord.id,
        scheduleDelayMs: 350,
      });
    }

    if (!isNtfyOrdersPipelineActive()) {
      this.playAlert();
      void this.showInboxNewOrderNotice();
      return;
    }

    this.setInboxNewOrderBanner();
    this.playAlert();

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const st = await App.getState();
      if (st?.isActive) {
        void this.presentNewOrderToast();
      }
    } catch {
      /* ignore */
    }
  }

  private setInboxNewOrderBanner(): void {
    this.inboxBannerText.set('طلب جديد يطابق تخصصك — اضغط على البطاقة للاطلاع والقبول');
    window.setTimeout(() => {
      this.inboxBannerText.set('');
    }, 8000);
  }

  private async showInboxNewOrderNotice(): Promise<void> {
    this.setInboxNewOrderBanner();
    await this.presentNewOrderToast();
  }

  private async presentNewOrderToast(): Promise<void> {
    try {
      const t = await this.toastCtrl.create({
        message: 'طلب جديد يطابق خدماتك — اطلع من «طلبات العملاء»',
        duration: 4000,
        position: 'top',
        color: 'primary',
        mode: 'ios',
      });
      await t.present();
    } catch {
      /* ignore */
    }
  }

  private playAlert(): void {
    const audio = new Audio('assets/talap.mp3');
    audio.play().catch(() => {});
    Haptics.vibrate({ duration: 500 }).catch(() => {});
  }
}

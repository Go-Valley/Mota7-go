import { Injectable, inject, EnvironmentInjector, runInInjectionContext, NgZone, signal } from '@angular/core';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  getDoc,
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
import { deliveryOrderMatches, educationOrderMatches, otherOrderMatches } from '../utils/service-order-coverage-match.util';
import { normalizeAdTypeValue } from '../utils/duplicate-ad.util';
import { orderHiddenFromProviderInbox, orderNeedsFinalizeAfterArchive } from '../utils/order-lifecycle.util';
import {
  finalizeOrderRemovedFromUi,
  purgeFirestoreOrdersPastExpiresAt,
} from '../utils/order-lifecycle.firestore';
import { isNtfyOrdersPipelineActive } from '../utils/ntfy-orders-policy.util';

/**
 * صندوق «طلبات العملاء» عبر الاستماع المستمر لـ Firestore أثناء الجلسة —
 * لا يعتمد على فتح صفحة cus-order حتى يصل التحديث فوراً في الواجهة عند وصول المستند.
 */
@Injectable({ providedIn: 'root' })
export class ProviderOrdersInboxService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly zone = inject(NgZone);
  private readonly toastCtrl = inject(ToastController);

  readonly orders = signal<any[]>([]);
  readonly isTracking = signal(false);
  readonly inboxBannerText = signal('');
  readonly userId = signal('');

  private started = false;
  private unsubOrders: (() => void) | null = null;
  private ordersRealtimeReady = false;
  private providerPhone = '';
  private providerAdsDelivery: Record<string, unknown>[] = [];
  private providerAdsEducation: Record<string, unknown>[] = [];
  private providerAdsOther: Record<string, unknown>[] = [];

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
        this.providerAdsDelivery = [];
        this.providerAdsEducation = [];
        this.providerAdsOther = [];

        if (!user) {
          return;
        }

        const uid = user.email ? user.email.split('@')[0] : user.uid;
        this.userId.set(uid);
        void this.reloadProviderAdsAndAttach(uid);
      });
    });
  }

  /** عند فتح صفحة «طلبات العملاء»: تحديث إعلانات المزود وإعادة ربط الاستماع لتطبيق الفلتر فوراً */
  async refreshAdsForCurrentUser(): Promise<void> {
    const uid = this.userId();
    if (!uid) {
      return;
    }
    await this.loadProviderAds(uid);
    this.attachOrdersListener();
  }

  ignoreLocally(id: string): void {
    this.orders.update((xs) => xs.filter((o) => o.id !== id));
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

  private detachOrdersListener(): void {
    if (this.unsubOrders) {
      this.unsubOrders();
      this.unsubOrders = null;
    }
  }

  private async reloadProviderAdsAndAttach(uid: string): Promise<void> {
    await this.loadProviderAds(uid);
    this.attachOrdersListener();
  }

  private async loadProviderAds(uid: string): Promise<void> {
    this.providerAdsDelivery = [];
    this.providerAdsEducation = [];
    this.providerAdsOther = [];
    this.providerPhone = '';

    try {
      const userDoc = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', uid))
      );
      if (!userDoc.exists()) {
        return;
      }
      const data = userDoc.data();
      this.providerPhone = data['phone'] || '';

      const adsSnap = await runInInjectionContext(this.injector, () =>
        getDocs(
          query(
            collection(this.firestore, 'ads'),
            where('owner_phone', '==', this.providerPhone),
            where('is_available', '==', true)
          )
        )
      );

      adsSnap.forEach((d) => {
        const ad = d.data() as Record<string, unknown>;
        const rawType = String(ad['ad_type'] ?? '').trim();
        const t = normalizeAdTypeValue(rawType);
        if (t === 'delivery') {
          this.providerAdsDelivery.push(ad);
        } else if (t === 'education') {
          this.providerAdsEducation.push(ad);
        } else if (t === 'other') {
          this.providerAdsOther.push(ad);
        }
      });
    } catch (e) {
      console.error('[ProviderOrdersInbox] loadProviderAds', e);
    }
  }

  private pendingMatchesProvider(order: any): boolean {
    const st = String(order.serviceType || '').trim();
    if (st === 'delivery') {
      return this.providerAdsDelivery.some((ad) => deliveryOrderMatches(order, ad));
    }
    if (st === 'education') {
      return this.providerAdsEducation.some((ad) => educationOrderMatches(order, ad));
    }
    if (st === 'other') {
      return this.providerAdsOther.some((ad) => otherOrderMatches(order, ad));
    }
    return false;
  }

  private passesInboxFilter(order: any): boolean {
    if (orderHiddenFromProviderInbox(order)) {
      return false;
    }

    const uid = this.userId();
    if (order.providerId === uid) {
      return true;
    }

    const ignoredAt = order.ignoredBy?.[uid];
    if (ignoredAt) {
      const ignoredTime = ignoredAt.toMillis ? ignoredAt.toMillis() : ignoredAt;
      const elapsed = Date.now() - ignoredTime;
      return elapsed < 10 * 60 * 1000;
    }

    if (order.status === 'pending') {
      return this.pendingMatchesProvider(order);
    }
    return false;
  }

  orderVisibleToProvider(order: any): boolean {
    return this.passesInboxFilter(order);
  }

  private attachOrdersListener(): void {
    this.detachOrdersListener();
    this.ordersRealtimeReady = false;

    this.unsubOrders = runInInjectionContext(this.injector, () => {
      const ordersRef = collection(this.firestore, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'), limit(30));

      return onSnapshot(q, (snapshot) => {
        this.zone.run(() => {
          // Firestore `data()` spread is not widened here; without a cast TS infers `{ id: string }` only.
          const allOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string } & Record<string, unknown>));

          for (const o of allOrders) {
            if (orderNeedsFinalizeAfterArchive(o)) {
              void finalizeOrderRemovedFromUi(this.injector, this.firestore, o.id);
            }
          }

          const filtered = allOrders.filter((order) => this.passesInboxFilter(order));
          this.orders.set(filtered);

          this.isTracking.set(
            filtered.some((o) => o['status'] === 'accepted' && o['providerId'] === this.userId())
          );

          if (!snapshot.metadata.hasPendingWrites && this.ordersRealtimeReady) {
            for (const c of snapshot.docChanges()) {
              const data = c.doc.data() as any;
              if (data.status !== 'pending') {
                continue;
              }
              const ord = { id: c.doc.id, ...data };
              if (!this.orderVisibleToProvider(ord)) {
                continue;
              }
              if (c.type === 'added' || c.type === 'modified') {
                void this.onProviderInboxNewOrderSignal();
              }
            }
          }
          this.ordersRealtimeReady = true;

          void purgeFirestoreOrdersPastExpiresAt(this.injector, this.firestore);
        });
      });
    });
  }

  /**
   * طلب جديد للمزود: مع مسار ntfy/FCM يكون الصوت (talap) من قناة الإشعارات فقط — لا playAlert.
   * في المقدّمة (native): Toast نصّي فقط؛ في الخلفية لا Toast (يكفي FCM/الشريط عند العودة).
   */
  private async onProviderInboxNewOrderSignal(): Promise<void> {
    if (!isNtfyOrdersPipelineActive()) {
      this.playAlert();
      void this.showInboxNewOrderNotice();
      return;
    }

    this.setInboxNewOrderBanner();

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
    this.inboxBannerText.set('طلب جديد يطابق تخصصك — اطلع على التفاصيل في «طلبات العملاء»');
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
        message: 'طلب جديد يطابق خدماتك — «طلبات العملاء»',
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

import { Component, OnInit, OnDestroy, inject, CUSTOM_ELEMENTS_SCHEMA, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, Platform, ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { subscribeHardwareBackToMyAccount } from '../../core/utils/hardware-back-my-account.util';
import { Firestore, collection, query, where, onSnapshot, doc, updateDoc, Timestamp, getDoc, getDocs, limit, orderBy } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { addIcons } from 'ionicons';
import { Haptics } from '@capacitor/haptics';
import { Mota7HeaderComponent } from '../../top_header/header';
import {
  locationOutline, checkmarkCircleOutline, bicycleOutline, chevronBack,
  callOutline, logoWhatsapp, mapOutline, cashOutline, personCircleOutline, timeOutline, warningOutline,
  chatbubbleEllipsesOutline, chevronForwardOutline, appsOutline
} from 'ionicons/icons';

import { DeliveryCardComponent } from 'src/app/my-account/cus_order/cus-order.card/delivery-card/delivery-card.component';
import { EducationalCardComponent } from 'src/app/my-account/cus_order/cus-order.card/educational-card/educational-card.component';
import { OtherServicesCardComponent } from 'src/app/my-account/cus_order/cus-order.card/other-services-card/other-services-card.component';
import { normalizeMatchKeyForOrders } from 'src/app/core/utils/match-key-normalize';
import {
  orderHiddenFromProviderInbox,
  orderNeedsFinalizeAfterArchive
} from 'src/app/core/utils/order-lifecycle.util';
import {
  finalizeOrderRemovedFromUi,
  purgeFirestoreOrdersPastExpiresAt
} from 'src/app/core/utils/order-lifecycle.firestore';
import { UserAccountStatusService } from '../user-account-status.service';

@Component({
  selector: 'app-cus-order',
  templateUrl: './cus-order.page.html',
  styleUrls: ['./cus-order.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    Mota7HeaderComponent,
    DeliveryCardComponent,
    EducationalCardComponent,
    OtherServicesCardComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CusOrderPage implements OnInit, OnDestroy {
  orders: any[] = [];
  userId: string = '';
  providerPhone: string = '';
  deliveryKeys: string[] = [];
  educationKeys: string[] = [];
  otherKeys: string[] = [];
  isTracking: boolean = false;
  /** تنبيه داخلي في أعلى صندوق الوارد */
  inboxBannerText = '';
  private unsubscribe: any;
  /** تجنب تشغيل الصوت/التوست عند أول تحميل لقائمة الطلبات */
  private ordersRealtimeReady = false;

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private navCtrl = inject(NavController);
  private platform = inject(Platform);
  private injector = inject(EnvironmentInjector);
  private toastCtrl = inject(ToastController);
  private hardwareBackSub?: Subscription;
  private acct = inject(UserAccountStatusService);

  constructor() {
    addIcons({
      'location-outline': locationOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'bicycle-outline': bicycleOutline,
      'chevron-back': chevronBack,
      'chevron-forward-outline': chevronForwardOutline,
      'call-outline': callOutline,
      'logo-whatsapp': logoWhatsapp,
      'map-outline': mapOutline,
      'cash-outline': cashOutline,
      'person-circle-outline': personCircleOutline,
      'time-outline': timeOutline,
      'warning-outline': warningOutline,
      'chatbubble-ellipses-outline': chatbubbleEllipsesOutline,
      'apps-outline': appsOutline
    });
  }

  async ngOnInit() {
    this.hardwareBackSub = subscribeHardwareBackToMyAccount(this.platform, this.navCtrl);
    if (!this.acct.accountUsable()) {
      await this.navCtrl.navigateRoot('/login');
      return;
    }
    const user = this.auth.currentUser;
    if (user) {
      this.userId = user.email ? user.email.split('@')[0] : user.uid;
      await this.loadProviderConfig();
      this.initRealtimeOrders();
    }
  }

  async loadProviderConfig() {
    try {
      const userDoc = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', this.userId))
      );
      if (userDoc.exists()) {
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

        this.educationKeys = [];
        this.deliveryKeys = [];
        this.otherKeys = [];

        adsSnap.forEach(d => {
          const ad = d.data();
          if (ad['education_match_key']) this.educationKeys.push(ad['education_match_key']);
          if (ad['delivery_match_key']) this.deliveryKeys.push(ad['delivery_match_key']);
          if (ad['other_match_key']) this.otherKeys.push(ad['other_match_key']);
        });
      }
    } catch (e) { console.error('Error loading config:', e); }
  }

  /** نفس منطق فلترة القائمة لطلب واحد */
  orderVisibleToProvider(order: any): boolean {
    if (orderHiddenFromProviderInbox(order)) return false;

    if (order.providerId === this.userId) return true;

    const ignoredAt = order.ignoredBy?.[this.userId];
    if (ignoredAt) {
      const ignoredTime = ignoredAt.toMillis ? ignoredAt.toMillis() : ignoredAt;
      const elapsed = Date.now() - ignoredTime;
      return elapsed < 10 * 60 * 1000;
    }

    if (order.status === 'pending') {
      const orderEduKey = normalizeMatchKeyForOrders(order.education_match_key);
      const orderDelKey = normalizeMatchKeyForOrders(order.delivery_match_key);
      const orderOthKey = normalizeMatchKeyForOrders(order.other_match_key);

      const cleanEduKeys = this.educationKeys.map(k => normalizeMatchKeyForOrders(k));
      const cleanDelKeys = this.deliveryKeys.map(k => normalizeMatchKeyForOrders(k));
      const cleanOthKeys = this.otherKeys.map(k => normalizeMatchKeyForOrders(k));

      const isEdu = orderEduKey && cleanEduKeys.includes(orderEduKey);
      const isDel = orderDelKey && cleanDelKeys.includes(orderDelKey);
      const isOth = orderOthKey && cleanOthKeys.includes(orderOthKey);

      if (isEdu || isDel || isOth) return true;
    }
    return false;
  }

  initRealtimeOrders() {
    const ordersRef = collection(this.firestore, 'orders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'), limit(30));

    this.unsubscribe = runInInjectionContext(this.injector, () =>
      onSnapshot(q, (snapshot) => {
        const allOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));

        for (const o of allOrders) {
          if (orderNeedsFinalizeAfterArchive(o)) {
            void finalizeOrderRemovedFromUi(this.injector, this.firestore, o.id);
          }
        }

        const cleanEduKeys = this.educationKeys.map(k => normalizeMatchKeyForOrders(k));
        const cleanDelKeys = this.deliveryKeys.map(k => normalizeMatchKeyForOrders(k));
        const cleanOthKeys = this.otherKeys.map(k => normalizeMatchKeyForOrders(k));

        this.orders = allOrders.filter(order => {
          if (orderHiddenFromProviderInbox(order)) return false;

          if (order.providerId === this.userId) return true;

          const ignoredAt = order.ignoredBy?.[this.userId];
          if (ignoredAt) {
            const ignoredTime = ignoredAt.toMillis ? ignoredAt.toMillis() : ignoredAt;
            const elapsed = Date.now() - ignoredTime;
            return elapsed < 10 * 60 * 1000;
          }

          if (order.status === 'pending') {
            const orderEduKey = normalizeMatchKeyForOrders(order.education_match_key);
            const orderDelKey = normalizeMatchKeyForOrders(order.delivery_match_key);
            const orderOthKey = normalizeMatchKeyForOrders(order.other_match_key);

            const isEdu = orderEduKey && cleanEduKeys.includes(orderEduKey);
            const isDel = orderDelKey && cleanDelKeys.includes(orderDelKey);
            const isOth = orderOthKey && cleanOthKeys.includes(orderOthKey);

            if (isEdu || isDel || isOth) return true;
          }
          return false;
        });

        this.isTracking = this.orders.some(o => o.status === 'accepted' && o.providerId === this.userId);

        if (!snapshot.metadata.hasPendingWrites && this.ordersRealtimeReady) {
          for (const c of snapshot.docChanges()) {
            const data = c.doc.data() as any;
            if (data.status !== 'pending') continue;
            const ord = { id: c.doc.id, ...data };
            if (!this.orderVisibleToProvider(ord)) continue;
            if (c.type === 'added' || c.type === 'modified') {
              this.playAlert();
              void this.showInboxNewOrderNotice();
            }
          }
        }
        this.ordersRealtimeReady = true;

        void purgeFirestoreOrdersPastExpiresAt(this.injector, this.firestore);
      })
    );
  }

  async acceptAndStartTracking(id: string) {
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', id), {
          status: 'accepted',
          providerId: this.userId,
          acceptedAt: Timestamp.now()
        })
      );
      this.isTracking = true;
    } catch (e) { console.error(e); }
  }

  ignoreLocally(id: string) {
    this.orders = this.orders.filter(o => o.id !== id);
  }

  async finishFromCard(id: string) {
    // ملاحظة: كل كروت الخدمة تقوم بالفعل بتحديث المستند إلى "completed" وبدء مؤقت الأرشفة
    // ثم تستدعي emit هنا لإيقاف حالة التتبع فقط. منعنا updateDoc المكرر لتفادي تكرار مودال التقييم.
    void id;
    this.isTracking = false;
  }

  private async showInboxNewOrderNotice(): Promise<void> {
    this.inboxBannerText = 'طلب جديد يطابق تخصصك — اطلع على التفاصيل أدناه';
    window.setTimeout(() => {
      this.inboxBannerText = '';
    }, 8000);

    try {
      const t = await this.toastCtrl.create({
        message: 'طلب جديد في صندوق الوارد يطابق خدماتك',
        duration: 4000,
        position: 'top',
        color: 'primary',
        mode: 'ios'
      });
      await t.present();
    } catch {
      /* ignore */
    }
  }

  playAlert() {
    const audio = new Audio('assets/mota7.mp3');
    audio.play().catch(() => {});
    Haptics.vibrate({ duration: 500 }).catch(() => {});
  }

  goBack(): void {
    void this.navCtrl.navigateRoot('/tabs/my-account', { animated: true });
  }

  trackByOrderId(index: number, order: any) {
    return order.id;
  }

  ngOnDestroy() {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = undefined;
    if (this.unsubscribe) this.unsubscribe();
  }
}

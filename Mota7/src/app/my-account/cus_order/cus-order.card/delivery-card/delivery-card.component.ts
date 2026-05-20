import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  CUSTOM_ELEMENTS_SCHEMA,
  EnvironmentInjector,
  ChangeDetectorRef,
  runInInjectionContext
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonicModule, ToastController, ModalController } from '@ionic/angular';
import { Firestore, doc, updateDoc, Timestamp, getDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  carSportOutline,
  businessOutline,
  cashOutline,
  callOutline,
  logoWhatsapp,
  navigateOutline,
  refreshOutline,
  timeOutline,
  eyeOffOutline,
  pin,
  location,
  map,
  locationOutline
} from 'ionicons/icons';
import {
  ORDER_ACCEPTED_WINDOW_MS,
  ORDER_ARCHIVE_UI_MS,
  ORDER_DB_RETENTION_AFTER_UI_MS,
  orderFieldToMs,
  timestampPlusMs,
} from 'src/app/core/utils/order-lifecycle.util';
import {
  openDeliveryTrackingMap,
  refreshDeliveryOrderDoc,
} from 'src/app/core/utils/order-delivery-tracking.util';
import {
  finalizeOrderRemovedFromUi,
  completeAcceptedOrderWhenWindowElapsed
} from 'src/app/core/utils/order-lifecycle.firestore';
import { attachProviderAdIdToOrder } from 'src/app/core/utils/order-provider-rating.firestore';
import {
  presentProviderRatesCustomerModal,
  releaseProviderRatesCustomerRatingPromptReservation,
  reserveProviderRatesCustomerRatingPrompt,
} from '../../provider-completion-notice-modal/provider-rates-customer-modal.presenter';
import { resolveOrderOriginLocationDisplay } from 'src/app/core/utils/mota7-reverse-geocode.util';
import { encodeWhatsappText } from 'src/app/core/utils/whatsapp-open.util';
import {
  getMota7CurrentPosition,
  mota7GeolocationFailureMessage,
} from 'src/app/core/utils/mota7-geolocation-position.util';

@Component({
  selector: 'app-delivery-card',
  templateUrl: './delivery-card.component.html',
  styleUrls: ['./delivery-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DeliveryCardComponent implements OnInit, OnDestroy, OnChanges {
  @Input() order: any;
  @Output() ignoreOrder = new EventEmitter<string>();
  @Output() acceptOrder = new EventEmitter<string>();
  @Output() finishOrder = new EventEmitter<string>();

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private toastController = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);

  private watchId: any;
  providerId: string = '';
  isIgnoredView: boolean = false;
  showConfirmIgnore: boolean = false;
  isVisible: boolean = true;
  isUpdatingLocation: boolean = false;
  remainingTime: string = '--:--';
  acceptedRemainingTime: string = '--:--';
  timerInterval: ReturnType<typeof setInterval> | null = null;
  acceptedTimerInterval: ReturnType<typeof setInterval> | null = null;
  private endTime: number = 0;
  private acceptedEndTime: number = 0;
  private onCountdownDone: (() => void) | null = null;
  private presentingRateCustomer = false;
  fromLocationDisplay = '';

  constructor() {
    addIcons({
      checkmarkCircle,
      carSportOutline,
      businessOutline,
      cashOutline,
      callOutline,
      logoWhatsapp,
      navigateOutline,
      refreshOutline,
      timeOutline,
      eyeOffOutline,
      pin,
      location,
      map,
      locationOutline
    });
  }

  ngOnInit() {
    const user = this.auth.currentUser;
    this.providerId = user?.phoneNumber
      ? user.phoneNumber.replace('+2', '')
      : user?.email
        ? user.email.split('@')[0]
        : '';
    this.checkInitialStatus();
    document.addEventListener('visibilitychange', this.handleVisibility);

    if (
      this.order?.status === 'accepted' &&
      (this.order?.providerId === this.providerId || this.order?.providerId === user?.uid)
    ) {
      this.startLiveTracking();
      this.startAcceptedWindowTimer();
    }
    void this.refreshFromLocationDisplay();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['order']) {
      void this.refreshFromLocationDisplay();
    }
    if (
      changes['order'] &&
      !changes['order'].firstChange &&
      this.order?.status === 'completed'
    ) {
      void this.maybePresentProviderRatesCustomerModal();
    }
  }

  private async refreshFromLocationDisplay(): Promise<void> {
    if (!this.order) {
      this.fromLocationDisplay = '';
      return;
    }
    this.fromLocationDisplay = await resolveOrderOriginLocationDisplay(this.order);
    this.cdr.markForCheck();
  }

  private isAssignedProviderForOrder(): boolean {
    const user = this.auth.currentUser;
    if (!user || !this.order) return false;
    return (
      this.order.providerId === this.providerId ||
      this.order.providerId === user.uid ||
      this.order.providerPhone === this.providerId
    );
  }

  private async maybePresentProviderRatesCustomerModal(): Promise<void> {
    if (this.presentingRateCustomer) return;
    const o = this.order;
    if (!o?.id || o.status !== 'completed' || !this.isAssignedProviderForOrder()) return;
    if (typeof o.providerCustomerRating === 'number' && o.providerCustomerRating >= 1) return;
    if (o.providerRatedCustomerAt) return;
    let skip = false;
    let prompted = false;
    try {
      skip = !!localStorage.getItem(`mota7_prov_cust_rating_skip_${o.id}`);
      prompted = !!sessionStorage.getItem(`mota7_prov_cust_rating_prompted_${o.id}`);
    } catch {
      /* ignore */
    }
    if (skip || prompted) return;

    this.presentingRateCustomer = true;
    try {
      await presentProviderRatesCustomerModal(this.modalCtrl, o.id, { ...o });
    } catch (e) {
      console.error('maybePresentProviderRatesCustomerModal', e);
    } finally {
      this.presentingRateCustomer = false;
    }
  }

  private checkInitialStatus() {
    if (this.order?.status === 'completed') {
      const now = Date.now();
      const completedAt = orderFieldToMs(this.order?.completedAt, now);
      const until = this.order?.uiArchiveUntil
        ? orderFieldToMs(this.order.uiArchiveUntil, completedAt + ORDER_ARCHIVE_UI_MS)
        : completedAt + ORDER_ARCHIVE_UI_MS;
      const remaining = until - now;
      if (remaining > 0) {
        this.isVisible = true;
        this.startCountdown(remaining, () => void this.afterArchiveDone());
        void this.maybePresentProviderRatesCustomerModal();
      } else {
        this.isVisible = false;
      }
      return;
    }

    const ignoredAt = this.order?.ignoredBy?.[this.providerId];
    if (ignoredAt && this.order.status === 'pending') {
      const ignoredTime = orderFieldToMs(ignoredAt, Date.now());
      const remaining = 10 * 60 * 1000 - (Date.now() - ignoredTime);

      if (remaining > 0) {
        this.isIgnoredView = true;
        this.isVisible = true;
        this.startCountdown(remaining, () => this.afterIgnoreTimerDone());
      } else {
        this.isVisible = false;
      }
    }
  }

  private afterIgnoreTimerDone() {
    this.isVisible = false;
    this.ignoreOrder.emit(this.order.id);
  }

  private async afterArchiveDone() {
    await finalizeOrderRemovedFromUi(this.injector, this.firestore, this.order.id);
    this.isVisible = false;
  }

  startLiveTracking() {
    if ('geolocation' in navigator) {
      this.watchId = navigator.geolocation.watchPosition(
        async (position) => {
          try {
            await runInInjectionContext(this.injector, () =>
              updateDoc(doc(this.firestore, 'orders', this.order.id), {
                providerLat: position.coords.latitude,
                providerLng: position.coords.longitude,
                lastUpdate: Timestamp.now()
              })
            );
          } catch (e) {
            console.error(e);
          }
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
    }
  }

  stopLiveTracking() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  startCountdown(durationMs: number, onDone: () => void) {
    this.stopTimer();
    this.endTime = Date.now() + durationMs;
    this.onCountdownDone = onDone;
    this.timerInterval = setInterval(() => {
      const diff = this.endTime - Date.now();
      if (diff <= 0) {
        this.stopTimer();
        const fn = this.onCountdownDone;
        this.onCountdownDone = null;
        fn?.();
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      this.remainingTime = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }, 1000);
    const d0 = this.endTime - Date.now();
    const m0 = Math.floor(d0 / 60000);
    const s0 = Math.floor((d0 % 60000) / 1000);
    this.remainingTime = `${m0}:${s0 < 10 ? '0' : ''}${s0}`;
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private startAcceptedWindowTimer() {
    const acc = orderFieldToMs(this.order.acceptedAt, Date.now());
    this.acceptedEndTime = acc + ORDER_ACCEPTED_WINDOW_MS;
    let remaining = this.acceptedEndTime - Date.now();
    if (remaining <= 0) {
      void this.fireAcceptedExpired();
      return;
    }
    this.stopAcceptedTimer();
    this.acceptedTimerInterval = setInterval(() => {
      remaining = this.acceptedEndTime - Date.now();
      if (remaining <= 0) {
        this.stopAcceptedTimer();
        void this.fireAcceptedExpired();
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      this.acceptedRemainingTime = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }, 1000);
    const m0 = Math.floor(remaining / 60000);
    const s0 = Math.floor((remaining % 60000) / 1000);
    this.acceptedRemainingTime = `${m0}:${s0 < 10 ? '0' : ''}${s0}`;
  }

  private stopAcceptedTimer() {
    if (this.acceptedTimerInterval) {
      clearInterval(this.acceptedTimerInterval);
      this.acceptedTimerInterval = null;
    }
  }

  private async fireAcceptedExpired() {
    this.stopLiveTracking();
    this.stopAcceptedTimer();
    const id = this.order?.id;
    if (!id) return;
    let weSetPresentingFlag = false;
    try {
      reserveProviderRatesCustomerRatingPrompt(id);
      if (!this.presentingRateCustomer) {
        this.presentingRateCustomer = true;
        weSetPresentingFlag = true;
      }
      await completeAcceptedOrderWhenWindowElapsed(this.injector, this.firestore, id);
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'orders', id))
      );
      const d = snap.data();
      if (!d || d['status'] !== 'completed') {
        releaseProviderRatesCustomerRatingPromptReservation(id);
        if (weSetPresentingFlag) this.presentingRateCustomer = false;
        return;
      }
      Object.assign(this.order, d);
      this.order.id = id;
      this.isVisible = true;
      const now = Date.now();
      const completedAt = orderFieldToMs(this.order.completedAt, now);
      const until = this.order.uiArchiveUntil
        ? orderFieldToMs(this.order.uiArchiveUntil, completedAt + ORDER_ARCHIVE_UI_MS)
        : completedAt + ORDER_ARCHIVE_UI_MS;
      const remaining = until - now;
      if (remaining > 0) {
        this.startCountdown(remaining, () => void this.afterArchiveDone());
      } else {
        void this.afterArchiveDone();
      }
      this.finishOrder.emit(this.order.id);

      try {
        await presentProviderRatesCustomerModal(this.modalCtrl, id, { ...this.order });
      } finally {
        if (weSetPresentingFlag) this.presentingRateCustomer = false;
      }
    } catch (e) {
      console.error('fireAcceptedExpired delivery', e);
      releaseProviderRatesCustomerRatingPromptReservation(id);
      if (weSetPresentingFlag) this.presentingRateCustomer = false;
    }
  }

  private async syncOrderAndOpenTracking(): Promise<void> {
    this.order = await refreshDeliveryOrderDoc(
      this.injector,
      this.firestore,
      this.order
    );
    await openDeliveryTrackingMap(
      this.modalCtrl,
      this.order,
      'provider',
      this.toastController
    );
  }

  async openMap(): Promise<void> {
    await this.syncOrderAndOpenTracking();
  }

  /** قبل القبول: خريطة ثلاثية (عميل + وجهة + مندوب إن وُجد) */
  async openCustomerCurrentLocationMap(): Promise<void> {
    await this.syncOrderAndOpenTracking();
  }

  /** جلب آخر إحداثيات من Firestore ثم فتح الخريطة (تحديث لحظي داخل المودال) */
  async refreshRouteOpenMap(): Promise<void> {
    await this.syncOrderAndOpenTracking();
  }

  makeCall(phone: string) {
    if (phone) window.open(`tel:${phone}`, '_system');
  }

  openWhatsApp(phone: string) {
    if (phone) {
      const msg = encodeWhatsappText(
        `السلام عليكم.. بتواصل مع حضرتك بخصوص طلبك: ${this.order?.subService || 'طلب خدمة'}`
      );
      window.open(`whatsapp://send?phone=2${phone}&text=${msg}`, '_system');
    }
  }

  /**
   * تفعيل الموقع لمقدم الخدمة وتحديث إحداثياته الحالية في Firestore
   */
  async activateProviderLocation() {
    if (this.isUpdatingLocation) return;
    this.isUpdatingLocation = true;
    try {
      const pos = await getMota7CurrentPosition();
      const { latitude, longitude } = pos.coords;
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', this.order.id), {
          providerLat: latitude,
          providerLng: longitude,
          lastUpdate: Timestamp.now(),
        })
      );
      this.order.providerLat = latitude;
      this.order.providerLng = longitude;

      if (!this.watchId) {
        this.startLiveTracking();
      }

      const toast = await this.toastController.create({
        message: 'تم تفعيل موقعك وإرساله للعميل',
        duration: 2500,
        color: 'success',
      });
      await toast.present();
    } catch (e) {
      console.warn('activateProviderLocation:', e);
      const toast = await this.toastController.create({
        message: mota7GeolocationFailureMessage(e),
        duration: 3200,
        color: 'warning',
      });
      await toast.present();
    } finally {
      this.isUpdatingLocation = false;
    }
  }

  async onIgnoreClick() {
    try {
      this.showConfirmIgnore = false;
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', this.order.id), {
          [`ignoredBy.${this.providerId}`]: Timestamp.now()
        })
      );
      this.isIgnoredView = true;
      this.isVisible = true;
      this.startCountdown(10 * 60 * 1000, () => this.afterIgnoreTimerDone());

      const toast = await this.toastController.create({
        message: 'تم تجاهل الطلب.. سيختفي بعد 10 دقائق.',
        duration: 2500,
        position: 'bottom',
        color: 'dark'
      });
      await toast.present();
    } catch (e) {
      console.error(e);
    }
  }

  async onAcceptClick() {
    try {
      this.showConfirmIgnore = false;
      this.isIgnoredView = false;
      this.stopTimer();
      let finalName = 'مزود خدمة';
      const user = this.auth.currentUser;
      if (this.providerId) {
        const userSnap = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', this.providerId))
        );
        if (userSnap.exists()) {
          finalName = userSnap.data()['fullName'] || 'مزود خدمة';
        } else if (user?.uid) {
          const altSnap = await runInInjectionContext(this.injector, () =>
            getDoc(doc(this.firestore, 'users', user.uid))
          );
          if (altSnap.exists()) {
            finalName = altSnap.data()['fullName'] || 'مزود خدمة';
          }
        }
      }
      const acceptPatch: Record<string, unknown> = {
        status: 'accepted',
        acceptedAt: Timestamp.now(),
        providerId: this.providerId,
        providerName: finalName,
        providerPhone: this.providerId,
        providerUID: user?.uid,
      };
      try {
        const pos = await getMota7CurrentPosition();
        acceptPatch['providerLat'] = pos.coords.latitude;
        acceptPatch['providerLng'] = pos.coords.longitude;
        acceptPatch['lastUpdate'] = Timestamp.now();
      } catch {
        /* يُحدَّث لاحقاً عبر تفعيل موقعي أو التتبع الحي */
      }
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', this.order.id), acceptPatch)
      );
      if (acceptPatch['providerLat'] != null) {
        this.order.providerLat = acceptPatch['providerLat'];
        this.order.providerLng = acceptPatch['providerLng'];
      }
      void attachProviderAdIdToOrder(this.injector, this.firestore, this.order.id, {
        ...this.order,
        providerId: this.providerId,
        providerPhone: this.providerId,
        serviceType: 'delivery',
        status: 'accepted',
      });
      this.order.status = 'accepted';
      this.order.acceptedAt = Timestamp.now();
      this.order.providerName = finalName;
      this.acceptOrder.emit(this.order.id);
      this.startLiveTracking();
      this.startAcceptedWindowTimer();
    } catch (e) {
      console.error(e);
    }
  }

  private async finishOrderNow(): Promise<void> {
    let weSetPresentingFlag = false;
    const id = this.order?.id;
    if (!id) return;
    try {
      this.stopLiveTracking();
      this.stopAcceptedTimer();
      reserveProviderRatesCustomerRatingPrompt(id);
      if (!this.presentingRateCustomer) {
        this.presentingRateCustomer = true;
        weSetPresentingFlag = true;
      }

      const now = Timestamp.now();
      const uiArchiveUntil = timestampPlusMs(now, ORDER_ARCHIVE_UI_MS);
      const createdAtMs = orderFieldToMs(this.order.createdAt, now.toMillis());
      const expiresAt = Timestamp.fromMillis(createdAtMs + ORDER_DB_RETENTION_AFTER_UI_MS);

      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', id), {
          status: 'completed',
          completedAt: now,
          expiresAt,
          isArchiving: true,
          uiArchiveUntil,
        })
      );

      this.order.status = 'completed';
      this.order.completedAt = now;
      this.order.expiresAt = expiresAt;
      this.order.uiArchiveUntil = uiArchiveUntil;

      this.startCountdown(ORDER_ARCHIVE_UI_MS, () => void this.afterArchiveDone());

      this.finishOrder.emit(id);
      try {
        await presentProviderRatesCustomerModal(this.modalCtrl, id, { ...this.order });
      } finally {
        if (weSetPresentingFlag) this.presentingRateCustomer = false;
      }
    } catch (e) {
      console.error(e);
      releaseProviderRatesCustomerRatingPromptReservation(id);
      if (weSetPresentingFlag) this.presentingRateCustomer = false;
    }
  }

  async onFinishClick() {
    const alert = await this.alertCtrl.create({
      header: 'إنهاء المهمة',
      message: 'هل انت متأكد من انهاء المهمة؟',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تأكيد',
          cssClass: 'confirm-button',
          handler: async () => {
            await this.finishOrderNow();
          },
        },
      ],
    });
    await alert.present();
  }

  async reRateCustomer(orderId: string): Promise<void> {
    if (!orderId) return;
    if (this.presentingRateCustomer) return;

    let weSetPresentingFlag = false;
    if (!this.presentingRateCustomer) {
      this.presentingRateCustomer = true;
      weSetPresentingFlag = true;
    }

    try {
      await presentProviderRatesCustomerModal(this.modalCtrl, orderId, { ...this.order });
    } finally {
      if (weSetPresentingFlag) this.presentingRateCustomer = false;
    }
  }

  private handleVisibility = () => {
    if (!document.hidden && this.endTime !== 0 && this.onCountdownDone) {
      const rem = this.endTime - Date.now();
      if (rem > 1000) {
        const cb = this.onCountdownDone;
        this.startCountdown(rem, cb);
      } else {
        const fn = this.onCountdownDone;
        this.onCountdownDone = null;
        fn?.();
      }
    } else if (document.hidden) {
      this.stopTimer();
      this.stopAcceptedTimer();
    }
    if (!document.hidden && this.acceptedEndTime > 0) {
      /* استئناف عداد القبول عند العودة للتبويب */
      const rem = this.acceptedEndTime - Date.now();
      if (rem > 1000) {
        this.startAcceptedWindowTimer();
      } else if (rem <= 0 && this.order?.status === 'accepted') {
        void this.fireAcceptedExpired();
      }
    }
  };

  ngOnDestroy() {
    this.stopTimer();
    this.stopAcceptedTimer();
    this.stopLiveTracking();
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }
}

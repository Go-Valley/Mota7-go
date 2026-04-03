import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  inject,
  Output,
  EventEmitter,
  EnvironmentInjector,
  runInInjectionContext
} from '@angular/core';
import { Firestore, doc, deleteDoc, getDoc, Timestamp, updateDoc } from '@angular/fire/firestore';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { addIcons } from 'ionicons';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import {
  presentProviderRatingModal,
  releaseCustomerProviderRatingPromptReservation,
  reserveCustomerProviderRatingPrompt,
} from '../provider-rating-modal/provider-rating-modal.presenter';
import { checkmarkCircle, carSportOutline, businessOutline, cashOutline, callOutline, logoWhatsapp, navigateOutline, refreshOutline, locationOutline } from 'ionicons/icons';
import {
  ORDER_ACCEPTED_WINDOW_MS,
  ORDER_ARCHIVE_UI_MS,
  ORDER_DB_RETENTION_AFTER_UI_MS,
  orderFieldToMs,
  timestampPlusMs,
  openMapsUrlWithFallback,
  buildGoogleMapsDirectionsUrl
} from '../../core/utils/order-lifecycle.util';
import { hasOrderLocationCoordinates } from '../../core/utils/order-form-fields.util';
import {
  finalizeOrderRemovedFromUi,
  completeAcceptedOrderWhenWindowElapsed
} from '../../core/utils/order-lifecycle.firestore';

@Component({
  selector: 'app-my-order-card-delivery',
  templateUrl: './my-order.card-delivery.html',
  styleUrls: ['./my-order.card-delivery.scss'],
  standalone: false
})
export class MyOrderCardDeliveryComponent implements OnInit, OnDestroy, OnChanges {
  @Input() order: any;
  @Output() orderDeleted = new EventEmitter<void>();

  remainingTime: string = '00:00';
  isVisible: boolean = true;
  isUpdatingLocation: boolean = false;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  private firestore = inject(Firestore);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private toastController = inject(ToastController);
  private injector = inject(EnvironmentInjector);
  private presentingReRateProvider = false;
  private presentingCustomerProviderRatingModal = false;
  private suppressCustomerProviderRatingModal = false;

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
      locationOutline
    });
  }

  ngOnInit() {
    this.checkStatusAndTimer();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['order'] && this.order && !changes['order'].firstChange) {
      this.checkStatusAndTimer();
    }
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  checkStatusAndTimer() {
    this.stopTimer();
    const now = Date.now();
    const order = this.order;
    if (!order) return;

    if (order.status === 'completed') {
      const completedAt = orderFieldToMs(order.completedAt, now);
      const until = order.uiArchiveUntil
        ? orderFieldToMs(order.uiArchiveUntil, completedAt + ORDER_ARCHIVE_UI_MS)
        : completedAt + ORDER_ARCHIVE_UI_MS;
      const diff = until - now;

      // إذا الطلب اكتمل من جهة مقدم الخدمة ولم يتم تقييمه بعد،
      // نعرض مودال تقييم مقدم الخدمة من داخل الكرت نفسها (مع نفس حمايات التكرار).
      void this.maybePresentCustomerProviderRatingModal();

      if (diff > 0) {
        this.startTimer(diff, () => {
          void this.afterArchiveUiElapsed();
        });
      } else {
        void this.afterArchiveUiElapsed();
      }
      return;
    }

    if (order.status === 'pending') {
      const createdAt = orderFieldToMs(order.createdAt, now);
      const diff = ORDER_ACCEPTED_WINDOW_MS - (now - createdAt);
      if (diff > 0) {
        this.startTimer(diff, () => this.expirePendingHardDelete());
      } else {
        // إذا انتهى الوقت بالفعل عند تحميل الكارت (مثلاً بعد فتح التطبيق)
        void this.expirePendingHardDelete();
      }
      return;
    }

    if (order.status === 'accepted') {
      const acceptedAt = orderFieldToMs(order.acceptedAt, now);
      const diff = ORDER_ACCEPTED_WINDOW_MS - (now - acceptedAt);
      if (diff > 0) {
        this.startTimer(diff, () => void this.expireAcceptedSoftRemove());
      } else {
        void this.expireAcceptedSoftRemove();
      }
    }
  }

  private startTimer(durationMs: number, onDone: () => void) {
    let remaining = durationMs;
    const updateDisplay = () => {
      if (remaining <= 0) {
        this.stopTimer();
        onDone();
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      this.remainingTime = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      remaining -= 1000;
    };
    updateDisplay();
    this.timerInterval = setInterval(updateDisplay, 1000);
  }

  /** انتهاء مهلة الطلب المعلّق: حذف نهائي من الفايربيز */
  private async expirePendingHardDelete() {
    const id = this.order?.id;
    if (!id) return;
    try {
      await runInInjectionContext(this.injector, () =>
        deleteDoc(doc(this.firestore, 'orders', id))
      );
      this.orderDeleted.emit();
    } catch (e) {
      console.error('expirePendingHardDelete delivery:', e);
    }
    this.isVisible = false;
    this.stopTimer();
  }

  /** انتهاء مهلة الطلب المقبول: إكمال تلقائي كطلب مكتمل + مودال تقييم مقدم الخدمة */
  private async expireAcceptedSoftRemove() {
    const id = this.order?.id;
    if (!id) return;
    try {
      reserveCustomerProviderRatingPrompt(id);
      this.suppressCustomerProviderRatingModal = true;
      await completeAcceptedOrderWhenWindowElapsed(this.injector, this.firestore, id);
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'orders', id))
      );
      const d = snap.data();
      if (!d || d['status'] !== 'completed') {
        releaseCustomerProviderRatingPromptReservation(id);
        return;
      }
      Object.assign(this.order, d);
      this.order.id = id;
      this.checkStatusAndTimer();
      await presentProviderRatingModal(this.modalCtrl, id, { ...this.order });
    } catch (e) {
      console.error('expireAcceptedSoftRemove delivery:', e);
      releaseCustomerProviderRatingPromptReservation(id);
    } finally {
      this.suppressCustomerProviderRatingModal = false;
    }
    this.stopTimer();
  }

  private async afterArchiveUiElapsed() {
    const id = this.order?.id;
    if (!id) return;
    try {
      await finalizeOrderRemovedFromUi(this.injector, this.firestore, id);
      this.orderDeleted.emit();
    } catch (e) {
      console.error('afterArchiveUiElapsed delivery:', e);
    }
    this.isVisible = false;
    this.stopTimer();
  }

  async deleteOrder(orderId: string) {
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: 'سيتم حذف طلبكم بشكل نهائي\n\nهل أنت متأكد؟',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تأكيد',
          cssClass: 'mota7-alert-confirm-delete',
          handler: async () => {
            try {
              await runInInjectionContext(this.injector, () =>
                deleteDoc(doc(this.firestore, 'orders', orderId))
              );
              this.orderDeleted.emit();
            } catch (e) {
              console.error(e);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async finishTask(orderId: string) {
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
            try {
              reserveCustomerProviderRatingPrompt(orderId);
              const now = Timestamp.now();
              const uiArchiveUntil = timestampPlusMs(now, ORDER_ARCHIVE_UI_MS);
              const createdAtMs = orderFieldToMs(this.order.createdAt, now.toMillis());
              const expiresAt = Timestamp.fromMillis(createdAtMs + ORDER_DB_RETENTION_AFTER_UI_MS);
              this.order.status = 'completed';
              this.order.completedAt = now;
              this.order.expiresAt = expiresAt;
              this.order.uiArchiveUntil = uiArchiveUntil;
              this.suppressCustomerProviderRatingModal = true;
              this.checkStatusAndTimer();

              await runInInjectionContext(this.injector, () =>
                updateDoc(doc(this.firestore, 'orders', orderId), {
                  status: 'completed',
                  completedAt: now,
                  expiresAt,
                  isArchiving: true,
                  uiArchiveUntil
                })
              );

              await presentProviderRatingModal(this.modalCtrl, orderId, { ...this.order });
            } catch (e) {
              console.error('Error finishing delivery task:', e);
              releaseCustomerProviderRatingPromptReservation(orderId);
              this.presentToast('عذراً، حدث خطأ أثناء إنهاء الطلب');
            } finally {
              this.suppressCustomerProviderRatingModal = false;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async reRateProvider(orderId: string): Promise<void> {
    if (!orderId || this.presentingReRateProvider) return;
    this.presentingReRateProvider = true;
    try {
      await presentProviderRatingModal(this.modalCtrl, orderId, { ...this.order });
    } catch (e) {
      console.error('reRateProvider delivery:', e);
    } finally {
      this.presentingReRateProvider = false;
    }
  }

  private async maybePresentCustomerProviderRatingModal(): Promise<void> {
    if (
      this.presentingCustomerProviderRatingModal ||
      this.suppressCustomerProviderRatingModal ||
      !this.order?.id
    ) return;
    const o = this.order;
    if (o.status !== 'completed') return;
    if (o.customerRatedAt) return;
    const prevRating = o.customerProviderRating;
    if (typeof prevRating === 'number' && prevRating >= 1) return;
    if (!o.providerName && !o.providerId && !o.providerPhone) return;

    let skipped = false;
    let alreadyPrompted = false;
    try {
      skipped = !!localStorage.getItem(`mota7_rating_skip_${o.id}`);
      alreadyPrompted = !!sessionStorage.getItem(`mota7_rating_prompted_${o.id}`);
    } catch {
      /* ignore */
    }
    if (skipped || alreadyPrompted) return;

    this.presentingCustomerProviderRatingModal = true;
    try {
      await presentProviderRatingModal(this.modalCtrl, o.id, { ...o });
    } finally {
      this.presentingCustomerProviderRatingModal = false;
    }
  }

  callProvider() {
    const phone = this.order?.providerPhone || this.order?.providerId;
    if (phone) {
      window.open(`tel:${phone}`, '_system');
    } else {
      this.presentToast('رقم هاتف المندوب غير متاح حالياً');
    }
  }

  openWhatsApp() {
    const phone = this.order?.providerPhone || this.order?.providerId;
    const descriptor = this.order?.subService || 'طلب خدمة';
    if (phone) {
      const msg = `السلام عليكم.. بتواصل مع حضرتك بخصوص طلب: ${descriptor}`;
      const url = `whatsapp://send?phone=2${phone}&text=${encodeURIComponent(msg)}`;
      window.open(url, '_system');
    }
  }

  /**
   * تتبع من موقع طالب الخدمة (GPS حالياً، أو «من» المحفوظ) إلى موقع المندوب المحدّث من جهازه.
   */
  async navigateToProvider() {
    const pLat = this.order?.providerLat;
    const pLng = this.order?.providerLng;
    const destOk =
      pLat != null &&
      pLng != null &&
      Number.isFinite(Number(pLat)) &&
      Number.isFinite(Number(pLng));
    if (!destOk) {
      await this.presentToast(
        'موقع المندوب غير متاح بعد — انتظر قليلاً حتى يُحدَّث من تطبيقه بعد القبول'
      );
      return;
    }

    let originLat: number | undefined;
    let originLng: number | undefined;
    try {
      if (Capacitor.isNativePlatform()) {
        let perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted') {
          perm = await Geolocation.requestPermissions();
        }
        if (perm.location === 'granted') {
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30_000
          });
          originLat = pos.coords.latitude;
          originLng = pos.coords.longitude;
        }
      } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
        const o = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            reject,
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30_000 }
          );
        });
        originLat = o.lat;
        originLng = o.lng;
      }
    } catch {
      /* احتياطي أدناه */
    }

    if (
      (originLat == null || originLng == null) &&
      hasOrderLocationCoordinates(this.order?.lat, this.order?.lng)
    ) {
      originLat = Number(this.order.lat);
      originLng = Number(this.order.lng);
    }

    const url = buildGoogleMapsDirectionsUrl(
      originLat,
      originLng,
      Number(pLat),
      Number(pLng)
    );
    await openMapsUrlWithFallback(url);
  }

  /** جلب آخر providerLat/providerLng من الفايربيز ثم إعادة فتح رابط الخرائط */
  async refreshRouteToProvider() {
    const id = this.order?.id;
    if (!id) {
      await this.presentToast('تعذّر تحديث المسار');
      return;
    }
    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'orders', id))
      );
      if (!snap.exists()) {
        await this.presentToast('الطلب غير موجود');
        return;
      }
      const d = snap.data();
      this.order = { ...this.order, ...d, id };
    } catch (e) {
      console.error('refreshRouteToProvider:', e);
      await this.presentToast('تعذّر جلب أحدث موقع المندوب');
      return;
    }
    await this.navigateToProvider();
  }

  /**
   * تفعيل الموقع لطالب الخدمة وتحديثه في Firestore ليراه مقدم الخدمة
   */
  async activateCustomerLocation() {
    if (this.isUpdatingLocation) return;
    this.isUpdatingLocation = true;
    try {
      let pos: any;
      if (Capacitor.isNativePlatform()) {
        let perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted') {
          perm = await Geolocation.requestPermissions();
        }
        if (perm.location === 'granted') {
          pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000
          });
        }
      } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
        pos = await new Promise<any>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            reject,
            { enableHighAccuracy: true, timeout: 15000 }
          );
        });
      }

      if (pos) {
        const { latitude, longitude } = pos.coords;
        await runInInjectionContext(this.injector, () =>
          updateDoc(doc(this.firestore, 'orders', this.order.id), {
            lat: latitude,
            lng: longitude,
            location_name: 'تم التحديد عبر GPS'
          })
        );
        this.order.lat = latitude;
        this.order.lng = longitude;
        await this.presentToast('تم تفعيل موقعك بنجاح');
      } else {
        await this.presentToast('فشل الحصول على الموقع، تأكد من تفعيل الـ GPS');
      }
    } catch (e) {
      console.error('activateCustomerLocation error:', e);
      await this.presentToast('حدث خطأ أثناء تفعيل الموقع');
    } finally {
      this.isUpdatingLocation = false;
    }
  }

  async presentToast(msg: string) {
    const toast = await this.toastController.create({
      message: msg,
      duration: 2500,
      color: 'dark',
      position: 'bottom',
      cssClass: 'mota7-toast'
    });
    await toast.present();
  }
}

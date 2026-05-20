import { encodeWhatsappText } from 'src/app/core/utils/whatsapp-open.util';
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
import { AlertController, ModalController } from '@ionic/angular';
import {
  presentProviderRatingModal,
  releaseCustomerProviderRatingPromptReservation,
  reserveCustomerProviderRatingPrompt,
} from '../provider-rating-modal/provider-rating-modal.presenter';
import {
  ORDER_ACCEPTED_WINDOW_MS,
  ORDER_ARCHIVE_UI_MS,
  ORDER_DB_RETENTION_AFTER_UI_MS,
  orderFieldToMs,
  timestampPlusMs
} from '../../core/utils/order-lifecycle.util';
import {
  finalizeOrderRemovedFromUi,
  completeAcceptedOrderWhenWindowElapsed
} from '../../core/utils/order-lifecycle.firestore';

@Component({
  selector: 'app-my-order-card-educational',
  templateUrl: './my-order.card-educational.html',
  styleUrls: ['./my-order.card-educational.scss'],
  standalone: false
})
export class MyOrderCardEducationalComponent implements OnInit, OnDestroy, OnChanges {
  @Input() order: any;
  @Output() orderDeleted = new EventEmitter<void>();
  @Output() archivingStarted = new EventEmitter<void>();

  remainingTime: string = '00:00';
  archiveTimer: string = '10:00';
  providerFullName: string = '';
  isArchiving: boolean = false;
  private presentingReRateProvider = false;
  private presentingCustomerProviderRatingModal = false;

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private archiveInterval: ReturnType<typeof setInterval> | null = null;
  private firestore = inject(Firestore);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private injector = inject(EnvironmentInjector);

  ngOnInit() {
    if (this.order?.status === 'completed' && this.order?.isArchiving) {
      this.isArchiving = true;
      this.startArchiveTimerFromServer();
    }
    this.startCountdown();
    this.fetchProviderName();
    void this.maybePresentCustomerProviderRatingModal();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['order']?.currentValue || changes['order'].firstChange) return;

    // إذا وصلنا إلى completed من جهة مقدم الخدمة يجب تفعيل وضع الأرشفة داخل الكرت أيضاً.
    if (this.order?.status === 'completed' && this.order?.isArchiving && !this.isArchiving) {
      this.isArchiving = true;
      this.archivingStarted.emit();
      this.startArchiveTimerFromServer();
      void this.maybePresentCustomerProviderRatingModal();
      return;
    }

    if (!this.isArchiving) {
      this.startCountdown();
    }

    // عند تغيّر بيانات الطلب أثناء الأرشفة (أو لو isArchiving كان مفعل مسبقاً)
    // نراجع إذا كانت هناك حاجة لفتح مودال التقييم.
    if (this.order?.status === 'completed') {
      void this.maybePresentCustomerProviderRatingModal();
    }
  }

  private startArchiveTimerFromServer() {
    if (this.archiveInterval) clearInterval(this.archiveInterval);
    const now = Date.now();
    const completedAt = orderFieldToMs(this.order?.completedAt, now);
    const untilMs = this.order?.uiArchiveUntil
      ? orderFieldToMs(this.order.uiArchiveUntil, completedAt + ORDER_ARCHIVE_UI_MS)
      : completedAt + ORDER_ARCHIVE_UI_MS;
    let timeLeft = Math.max(0, Math.floor((untilMs - now) / 1000));
    if (timeLeft <= 0) {
      void this.finalizeAfterArchive();
      return;
    }
    const tick = () => {
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      this.archiveTimer = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      if (timeLeft <= 0) {
        if (this.archiveInterval) clearInterval(this.archiveInterval);
        void this.finalizeAfterArchive();
        return;
      }
      timeLeft--;
    };
    tick();
    this.archiveInterval = setInterval(tick, 1000);
  }

  async fetchProviderName() {
    if (this.order.fullName || this.order.providerName) {
      this.providerFullName = this.order.fullName || this.order.providerName;
      return;
    }

    const pId = this.order?.providerId;
    if (pId) {
      try {
        const userSnap = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', pId.toString()))
        );
        if (userSnap.exists()) {
          const userData = userSnap.data();
          this.providerFullName = userData['fullName'] || userData['teacher_name'];
        }
      } catch (e) {
        console.error('Error fetching provider name:', e);
      }
    }
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.archiveInterval) clearInterval(this.archiveInterval);
  }

  private clearMainCountdown() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  startCountdown() {
    this.clearMainCountdown();
    if (this.isArchiving || this.order?.status === 'completed') {
      return;
    }

    const tick = () => {
      if (this.isArchiving) return;
      const now = Date.now();
      const st = this.order?.status;

      if (st === 'pending') {
        const created = orderFieldToMs(this.order.createdAt, now);
        const expiresAt = created + ORDER_ACCEPTED_WINDOW_MS;
        const diff = expiresAt - now;
        if (diff <= 0) {
          this.remainingTime = '00:00';
          this.clearMainCountdown();
          void this.expirePendingHardDelete();
          return;
        }
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        this.remainingTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        return;
      }

      if (st === 'accepted') {
        const acc = orderFieldToMs(this.order.acceptedAt, now);
        const expiresAt = acc + ORDER_ACCEPTED_WINDOW_MS;
        const diff = expiresAt - now;
        if (diff <= 0) {
          this.remainingTime = '00:00';
          this.clearMainCountdown();
          void this.expireAcceptedSoftRemove();
          return;
        }
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        this.remainingTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        return;
      }
    };

    tick();
    this.timerInterval = setInterval(tick, 1000);
  }

  startArchiveTimer() {
    if (this.archiveInterval) clearInterval(this.archiveInterval);
    let timeLeft = ORDER_ARCHIVE_UI_MS / 1000;
    this.archiveInterval = setInterval(() => {
      timeLeft--;
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      this.archiveTimer = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      if (timeLeft <= 0) {
        if (this.archiveInterval) clearInterval(this.archiveInterval);
        void this.finalizeAfterArchive();
      }
    }, 1000);
  }

  private async expirePendingHardDelete() {
    const id = this.order?.id;
    if (!id || this.isArchiving) return;
    try {
      await runInInjectionContext(this.injector, () =>
        deleteDoc(doc(this.firestore, 'orders', id))
      );
      this.orderDeleted.emit();
    } catch (e) {
      console.error('expirePendingHardDelete educational:', e);
    }
  }

  private async expireAcceptedSoftRemove() {
    const id = this.order?.id;
    if (!id || this.isArchiving) return;
    try {
      reserveCustomerProviderRatingPrompt(id);
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
      this.clearMainCountdown();
      this.archivingStarted.emit();
      this.isArchiving = true;
      this.startArchiveTimer();
      await presentProviderRatingModal(this.modalCtrl, id, { ...this.order });
    } catch (e) {
      console.error('expireAcceptedSoftRemove educational:', e);
      releaseCustomerProviderRatingPromptReservation(id);
    }
  }

  private async finalizeAfterArchive() {
    const id = this.order?.id;
    if (!id) return;
    try {
      await finalizeOrderRemovedFromUi(this.injector, this.firestore, id);
      this.orderDeleted.emit();
    } catch (e) {
      console.error('finalizeAfterArchive educational:', e);
    }
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
            } catch (error) {
              console.error('Error deleting order:', error);
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
              this.clearMainCountdown();
              const now = Timestamp.now();
              const uiArchiveUntil = timestampPlusMs(now, ORDER_ARCHIVE_UI_MS);
              const createdAtMs = orderFieldToMs(this.order.createdAt, now.toMillis());
              const expiresAt = Timestamp.fromMillis(createdAtMs + ORDER_DB_RETENTION_AFTER_UI_MS);

              this.archivingStarted.emit();
              this.isArchiving = true;
              this.order.status = 'completed';
              this.order.completedAt = now;
              this.order.expiresAt = expiresAt;
              this.order.uiArchiveUntil = uiArchiveUntil;
              this.startArchiveTimer();

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
              console.error('Error finishing task:', e);
              releaseCustomerProviderRatingPromptReservation(orderId);
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
      console.error('reRateProvider educational:', e);
    } finally {
      this.presentingReRateProvider = false;
    }
  }

  private async maybePresentCustomerProviderRatingModal(): Promise<void> {
    if (this.presentingCustomerProviderRatingModal) return;
    if (!this.order?.id || this.order?.status !== 'completed') return;
    if (this.order?.customerRatedAt) return;
    const prevRating = this.order?.customerProviderRating;
    if (typeof prevRating === 'number' && prevRating >= 1) return;
    if (!this.order?.providerName && !this.order?.providerId && !this.order?.providerPhone) return;

    let skipped = false;
    let alreadyPrompted = false;
    try {
      skipped = !!localStorage.getItem(`mota7_rating_skip_${this.order.id}`);
      alreadyPrompted = !!sessionStorage.getItem(`mota7_rating_prompted_${this.order.id}`);
    } catch {
      /* ignore */
    }
    if (skipped || alreadyPrompted) return;

    this.presentingCustomerProviderRatingModal = true;
    try {
      await presentProviderRatingModal(this.modalCtrl, this.order.id, { ...this.order });
    } finally {
      this.presentingCustomerProviderRatingModal = false;
    }
  }

  callProvider() {
    const phone = this.order?.providerId || this.order?.providerPhone || this.order?.acceptedByPhone;
    if (phone) {
      const cleanPhone = phone.toString().trim();
      window.open(`tel:${cleanPhone}`, '_system');
    }
  }

  openWhatsApp() {
    const phone = this.order?.providerId || this.order?.providerPhone || this.order?.acceptedByPhone;
    const subject = this.order?.subjectName || '';
    const stage = this.order?.stageName || '';
    if (phone) {
      let cleanedPhone = phone.toString().replace(/\D/g, '');
      if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '2' + cleanedPhone;
      } else if (!cleanedPhone.startsWith('2')) {
        cleanedPhone = '2' + cleanedPhone;
      }
      const message = `السلام عليكم.. بتواصل مع حضرتك بخصوص طلب خدمة تعليمية : مادة ${subject} - ${stage}`;
      const url = `whatsapp://send?phone=${cleanedPhone}&text=${encodeWhatsappText(message)}`;
      window.open(url, '_system');
    }
  }
}

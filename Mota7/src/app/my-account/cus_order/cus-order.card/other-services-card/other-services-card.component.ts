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
  runInInjectionContext
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { Firestore, doc, updateDoc, Timestamp, getDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { addIcons } from 'ionicons';
import {
  gridOutline,
  flashOutline,
  locationOutline,
  sparklesOutline,
  timeOutline,
  callOutline,
  logoWhatsapp
} from 'ionicons/icons';
import {
  ORDER_ACCEPTED_WINDOW_MS,
  ORDER_ARCHIVE_UI_MS,
  orderFieldToMs,
  timestampPlusMs
} from 'src/app/core/utils/order-lifecycle.util';
import {
  finalizeOrderRemovedFromUi,
  completeAcceptedOrderWhenWindowElapsed
} from 'src/app/core/utils/order-lifecycle.firestore';
import { presentProviderRatesCustomerModal } from '../../provider-completion-notice-modal/provider-rates-customer-modal.presenter';

@Component({
  selector: 'app-other-services-card',
  templateUrl: './other-services-card.component.html',
  styleUrls: ['./other-services-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class OtherServicesCardComponent implements OnInit, OnDestroy, OnChanges {
  get isArchiving(): boolean {
    return this.order?.status === 'completed';
  }

  @Input() order: any;
  @Output() ignoreOrder = new EventEmitter<string>();
  @Output() acceptOrder = new EventEmitter<string>();
  @Output() finishOrder = new EventEmitter<string>();

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private modalCtrl = inject(ModalController);
  private injector = inject(EnvironmentInjector);

  providerId: string = '';
  isIgnoredView: boolean = false;
  isVisible: boolean = true;
  remainingTime: string = '--:--';
  acceptedRemainingTime: string = '--:--';
  timerInterval: ReturnType<typeof setInterval> | null = null;
  acceptedTimerInterval: ReturnType<typeof setInterval> | null = null;
  showConfirmIgnore: boolean = false;
  private endTime: number = 0;
  private acceptedEndTime: number = 0;
  private onCountdownDone: (() => void) | null = null;
  private presentingRateCustomer = false;

  ngOnInit() {
    addIcons({
      gridOutline,
      flashOutline,
      locationOutline,
      sparklesOutline,
      timeOutline,
      callOutline,
      logoWhatsapp
    });
    const user = this.auth.currentUser;
    this.providerId = user?.email ? user.email.split('@')[0] : user?.uid || '';
    this.checkInitialStatus();
    document.addEventListener('visibilitychange', this.handleVisibility);

    if (this.order?.status === 'accepted' && this.order?.providerId === this.providerId) {
      this.startAcceptedWindowTimer();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['order'] &&
      !changes['order'].firstChange &&
      this.order?.status === 'completed'
    ) {
      void this.maybePresentProviderRatesCustomerModal();
    }
  }

  private isAssignedProviderForOrder(): boolean {
    return !!this.order && this.order.providerId === this.providerId;
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
    if (!this.order) return;

    const ignoredAt = this.order?.ignoredBy?.[this.providerId];
    if (ignoredAt && this.order.status === 'pending') {
      this.isIgnoredView = true;
      const ignoredTime = orderFieldToMs(ignoredAt, Date.now());
      const remaining = 10 * 60 * 1000 - (Date.now() - ignoredTime);
      if (remaining > 0) {
        this.isVisible = true;
        this.startCountdown(remaining, () => this.afterIgnoreTimerDone());
      } else {
        this.isVisible = false;
      }
      return;
    }

    if (this.order?.status === 'completed') {
      const now = Date.now();
      const completedAt = orderFieldToMs(this.order.completedAt, now);
      const until = this.order.uiArchiveUntil
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

    this.isVisible = true;
  }

  private afterIgnoreTimerDone() {
    this.isVisible = false;
    this.ignoreOrder.emit(this.order.id);
  }

  private async afterArchiveDone() {
    await finalizeOrderRemovedFromUi(this.injector, this.firestore, this.order.id);
    this.isVisible = false;
  }

  private handleVisibility = () => {
    if (!document.hidden && this.endTime !== 0 && this.onCountdownDone) {
      const remaining = this.endTime - Date.now();
      if (remaining > 1000) {
        const cb = this.onCountdownDone;
        this.startCountdown(remaining, cb);
      } else {
        this.stopTimer();
        const fn = this.onCountdownDone;
        this.onCountdownDone = null;
        fn?.();
      }
    } else if (document.hidden) {
      this.stopTimer();
    }
  };

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
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
    this.stopAcceptedTimer();
    const id = this.order?.id;
    if (!id) return;
    try {
      await completeAcceptedOrderWhenWindowElapsed(this.injector, this.firestore, id);
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'orders', id))
      );
      const d = snap.data();
      if (!d || d['status'] !== 'completed') return;
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
      await presentProviderRatesCustomerModal(this.modalCtrl, id, { ...this.order });
    } catch (e) {
      console.error('fireAcceptedExpired other', e);
    }
  }

  makeCall(phone: string) {
    if (phone) window.open(`tel:${phone}`, '_system');
  }

  openWhatsApp(phone: string, serviceName: string) {
    if (phone) {
      const message = encodeURIComponent(
        `السلام عليكم.. بتواصل مع حضرتك بخصوص طلبك (${serviceName})`
      );
      window.open(`whatsapp://send?phone=2${phone}&text=${message}`, '_system');
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
    } catch (e) {
      console.error(e);
    }
  }

  async onAcceptClick() {
    try {
      this.showConfirmIgnore = false;
      const user = this.auth.currentUser;
      let finalName = 'مزود خدمة';

      const userSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', this.providerId))
      );

      if (userSnap.exists()) {
        finalName = userSnap.data()['fullName'] || 'مزود خدمة';
      }

      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', this.order.id), {
          status: 'accepted',
          acceptedAt: Timestamp.now(),
          providerId: this.providerId,
          providerName: finalName,
          providerPhone: this.providerId,
          providerUID: user?.uid
        })
      );

      this.isIgnoredView = false;
      this.stopTimer();
      this.order.status = 'accepted';
      this.order.acceptedAt = Timestamp.now();
      this.order.providerName = finalName;
      this.acceptOrder.emit(this.order.id);
      this.startAcceptedWindowTimer();
    } catch (e) {
      console.error('Error accepting order:', e);
    }
  }

  async onFinishClick() {
    try {
      this.stopAcceptedTimer();
      const now = Timestamp.now();
      const uiArchiveUntil = timestampPlusMs(now, ORDER_ARCHIVE_UI_MS);
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', this.order.id), {
          status: 'completed',
          completedAt: now,
          isArchiving: true,
          uiArchiveUntil
        })
      );
      this.order.status = 'completed';
      this.order.completedAt = now;
      this.order.uiArchiveUntil = uiArchiveUntil;
      this.isVisible = true;
      this.startCountdown(ORDER_ARCHIVE_UI_MS, () => void this.afterArchiveDone());
      this.finishOrder.emit(this.order.id);
      await presentProviderRatesCustomerModal(
        this.modalCtrl,
        this.order.id,
        { ...this.order }
      );
    } catch (e) {
      console.error(e);
    }
  }

  ngOnDestroy() {
    this.stopTimer();
    this.stopAcceptedTimer();
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }
}

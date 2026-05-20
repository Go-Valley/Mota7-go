import {
  Component,
  EnvironmentInjector,
  EventEmitter,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  runInInjectionContext,
} from '@angular/core';
import { ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  briefcaseOutline,
  listOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { Firestore, collection, onSnapshot, query, where } from '@angular/fire/firestore';
import {
  orderNeedsFinalizeAfterArchive,
  orderVisibleForCustomer,
} from '../../core/utils/order-lifecycle.util';
import {
  finalizeOrderRemovedFromUi,
  purgeFirestoreOrdersPastExpiresAt,
} from '../../core/utils/order-lifecycle.firestore';
import { presentProviderRatingModal } from '../provider-rating-modal/provider-rating-modal.presenter';

export type MyOrdersPanelMode = 'page' | 'sheet';

@Component({
  selector: 'app-my-orders-panel',
  templateUrl: './my-orders-panel.component.html',
  styleUrls: ['./my-orders-panel.component.scss'],
  standalone: false,
})
export class MyOrdersPanelComponent implements OnInit, OnDestroy {
  @Input() mode: MyOrdersPanelMode = 'page';
  @Output() requestNewOrder = new EventEmitter<void>();

  hasActiveRequest = false;
  activeOrders: any[] = [];
  customerPhone = '';
  ordersQuerySettled = false;

  private injector = inject(EnvironmentInjector);
  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private pendingCustomerRatingModal = false;
  private unsubscribeOrders?: () => void;

  constructor() {
    addIcons({
      'briefcase-outline': briefcaseOutline,
      'sparkles-outline': sparklesOutline,
      'list-outline': listOutline,
    });
  }

  get isSheetMode(): boolean {
    return this.mode === 'sheet';
  }

  ngOnInit(): void {
    this.refreshPhoneAndListen();
  }

  ngOnDestroy(): void {
    this.unsubscribeOrders?.();
  }

  refreshPhoneAndListen(): void {
    const savedPhone = localStorage.getItem('last_customer_phone');
    if (savedPhone) {
      this.customerPhone = savedPhone;
      this.ordersQuerySettled = false;
      runInInjectionContext(this.injector, () => {
        this.listenToActiveOrders();
      });
    } else {
      this.ordersQuerySettled = false;
    }
  }

  onOrderDeleted(): void {
    this.hasActiveRequest = this.activeOrders.length > 0;
  }

  onRequestNewOrderClick(): void {
    this.requestNewOrder.emit();
  }

  private listenToActiveOrders(): void {
    if (!this.customerPhone) return;
    this.unsubscribeOrders?.();

    const ordersRef = collection(this.firestore, 'orders');
    const q = query(ordersRef, where('customerPhone', '==', this.customerPhone));

    this.unsubscribeOrders = onSnapshot(
      q,
      (snapshot) => {
        const serverOrders = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const id = docSnap.id;
          return { id, ...data };
        });

        for (const o of serverOrders) {
          if (orderNeedsFinalizeAfterArchive(o)) {
            void finalizeOrderRemovedFromUi(this.injector, this.firestore, o.id);
          }
        }

        this.activeOrders = serverOrders.filter((o) =>
          orderVisibleForCustomer(o, this.customerPhone)
        );
        this.hasActiveRequest = this.activeOrders.length > 0;
        this.ordersQuerySettled = true;

        void purgeFirestoreOrdersPastExpiresAt(this.injector, this.firestore);
        void this.tryPresentCustomerRatingModalForUnratedCompleted();
      },
      (error) => {
        console.error('Snapshot error:', error);
        this.ordersQuerySettled = true;
      }
    );
  }

  private async tryPresentCustomerRatingModalForUnratedCompleted(): Promise<void> {
    if (this.pendingCustomerRatingModal || !this.customerPhone) return;

    for (const o of this.activeOrders) {
      if (o.status !== 'completed') continue;
      if (o.customerRatedAt) continue;
      const prevRating = o.customerProviderRating;
      if (typeof prevRating === 'number' && prevRating >= 1) continue;
      let skipped = false;
      let alreadyPrompted = false;
      try {
        skipped = !!localStorage.getItem(`mota7_rating_skip_${o.id}`);
        alreadyPrompted = !!sessionStorage.getItem(`mota7_rating_prompted_${o.id}`);
      } catch {
        /* ignore */
      }
      if (skipped || alreadyPrompted) continue;
      if (!o.providerName && !o.providerId && !o.providerPhone) continue;

      this.pendingCustomerRatingModal = true;
      try {
        await presentProviderRatingModal(this.modalCtrl, o.id, { ...o });
      } catch (e) {
        console.error('tryPresentCustomerRatingModalForUnratedCompleted', e);
      } finally {
        this.pendingCustomerRatingModal = false;
      }
      break;
    }
  }
}

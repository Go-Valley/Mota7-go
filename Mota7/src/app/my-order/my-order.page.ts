import { Component, OnInit, OnDestroy, EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { NavController, ModalController, AlertController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chevronForwardOutline,
  briefcaseOutline,
  sparklesOutline,
  carOutline,
  schoolOutline,
  constructOutline,
  closeOutline,
  timeOutline,
  locationOutline,
  bookOutline,
  gridOutline,
  trashOutline,
  carSportOutline,
  businessOutline,
  cashOutline,
  callOutline,
  logoWhatsapp,
  navigateOutline,
  closeCircle
} from 'ionicons/icons';
import { Firestore, collection, query, where, onSnapshot } from '@angular/fire/firestore';

import { ServiceSelectionComponent } from './service-selection.component';
import { DeliveryServiceComponent } from './delivery-service/delivery-service.component';
import { EducationalServiceComponent } from './educational-service/educational-service.component';
import { OtherServiceComponent } from './other-service/other-service.component';
import { orderVisibleForCustomer, orderNeedsFinalizeAfterArchive } from '../core/utils/order-lifecycle.util';
import {
  finalizeOrderRemovedFromUi,
  purgeFirestoreOrdersPastExpiresAt
} from '../core/utils/order-lifecycle.firestore';
import { presentProviderRatingModal } from './provider-rating-modal/provider-rating-modal.presenter';

@Component({
  selector: 'app-my-order',
  templateUrl: 'my-order.page.html',
  styleUrls: ['my-order.page.scss'],
  standalone: false
})
export class MyOrderPage implements OnInit, OnDestroy {
  selectedCategory: boolean = true;
  selectedCategoryName: string = 'طلباتي';
  hasActiveRequest: boolean = false;
  activeOrders: any[] = [];
  customerPhone: string = '';
  /** أول استجابة من Firestore لطلبات هذا الرقم — لتفادي عرض «لا توجد طلبات» قبل التحميل */
  ordersQuerySettled: boolean = false;
  unsubscribeOrders: any;

  private injector = inject(EnvironmentInjector);
  private pendingCustomerRatingModal = false;

  constructor(
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private firestore: Firestore
  ) {
    addIcons({
      'chevron-forward-outline': chevronForwardOutline,
      'briefcase-outline': briefcaseOutline,
      'sparkles-outline': sparklesOutline,
      'close-outline': closeOutline,
      'time-outline': timeOutline,
      'location-outline': locationOutline,
      'car-outline': carOutline,
      'school-outline': schoolOutline,
      'construct-outline': constructOutline,
      'book-outline': bookOutline,
      'grid-outline': gridOutline,
      'trash-outline': trashOutline,
      'car-sport-outline': carSportOutline,
      'business-outline': businessOutline,
      'cash-outline': cashOutline,
      'call-outline': callOutline,
      'logo-whatsapp': logoWhatsapp,
      'navigate-outline': navigateOutline,
      'close-circle': closeCircle
    });
  }

  ngOnInit() {
    this.refreshPhoneAndListen();
  }

  refreshPhoneAndListen() {
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

  ngOnDestroy() {
    if (this.unsubscribeOrders) this.unsubscribeOrders();
  }

  listenToActiveOrders() {
    if (!this.customerPhone) return;
    if (this.unsubscribeOrders) this.unsubscribeOrders();

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

  goBack() {
    this.navCtrl.navigateBack('/my-order');
  }

  private blurActiveElement(): void {
    const el = document.activeElement;
    if (el instanceof HTMLElement) {
      el.blur();
    }
  }

  async openServiceSelection() {
    this.blurActiveElement();
    const modal = await this.modalCtrl.create({
      component: ServiceSelectionComponent,
      initialBreakpoint: 0.7,
      breakpoints: [0, 0.7, 0.9],
      handle: true,
      cssClass: 'mota7-modal-style'
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm' && data?.selectedCategory) {
      this.openSpecificServiceModal(data.selectedCategory);
    }
  }

  async openSpecificServiceModal(category: 'delivery' | 'education' | 'other') {
    let componentToOpen: any;
    switch (category) {
      case 'delivery':
        componentToOpen = DeliveryServiceComponent;
        break;
      case 'education':
        componentToOpen = EducationalServiceComponent;
        break;
      case 'other':
        componentToOpen = OtherServiceComponent;
        break;
    }

    this.blurActiveElement();
    const modal = await this.modalCtrl.create({
      component: componentToOpen,
      initialBreakpoint: 1,
      breakpoints: [0, 1],
      handle: true,
      cssClass: 'mota7-modal-style'
    });

    await modal.present();
    const { role: finalRole } = await modal.onDidDismiss();

    if (finalRole === 'confirm') {
      setTimeout(() => {
        this.refreshPhoneAndListen();
      }, 1000);
    }
  }

  onOrderDeleted() {
    this.hasActiveRequest = this.activeOrders.length > 0;
  }

  /**
   * عند اكتمال الطلب من مقدم الخدمة (أو من شاشة أخرى) يظهر مودال التقييم لطالب الخدمة مرة واحدة
   * حتى لا يفوته التقييم.
   */
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

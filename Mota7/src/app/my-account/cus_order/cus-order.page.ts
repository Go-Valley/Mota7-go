import { Component, OnInit, OnDestroy, inject, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { subscribeHardwareBackToMyAccount } from '../../core/utils/hardware-back-my-account.util';
import { Auth } from '@angular/fire/auth';
import { addIcons } from 'ionicons';
import { Mota7HeaderComponent } from '../../top_header/header';
import {
  locationOutline, checkmarkCircleOutline, bicycleOutline, chevronBack,
  callOutline, logoWhatsapp, mapOutline, cashOutline, personCircleOutline, timeOutline, warningOutline,
  chatbubbleEllipsesOutline, chevronForwardOutline, appsOutline
} from 'ionicons/icons';

import { DeliveryCardComponent } from 'src/app/my-account/cus_order/cus-order.card/delivery-card/delivery-card.component';
import { EducationalCardComponent } from 'src/app/my-account/cus_order/cus-order.card/educational-card/educational-card.component';
import { OtherServicesCardComponent } from 'src/app/my-account/cus_order/cus-order.card/other-services-card/other-services-card.component';
import { UserAccountStatusService } from '../user-account-status.service';
import { ProviderOrdersInboxService } from '../../core/services/provider-orders-inbox.service';

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
  /** إخفاء شريط «متاح» فوراً بعد إنهاء المهمة قبل وصول لقطة Firestore التالية */
  trackingBarOff = false;

  readonly inbox = inject(ProviderOrdersInboxService);

  private auth = inject(Auth);
  private navCtrl = inject(NavController);
  private platform = inject(Platform);
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
    this.trackingBarOff = false;
    if (!this.acct.accountUsable()) {
      await this.navCtrl.navigateRoot('/login');
      return;
    }
    if (!this.auth.currentUser) {
      return;
    }
    await this.inbox.refreshAdsForCurrentUser();
  }

  async onAcceptOrder(id: string): Promise<void> {
    await this.inbox.acceptAndStartTracking(id);
    this.trackingBarOff = false;
  }

  finishFromCard(_id: string): void {
    void _id;
    this.trackingBarOff = true;
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
  }
}

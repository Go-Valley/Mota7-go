import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { MyOrdersPanelComponent } from './my-orders-panel/my-orders-panel.component';
import { MyOrderCardDeliveryComponent } from './delivery-service/my-order.card-delivery';
import { MyOrderCardEducationalComponent } from './educational-service/my-order.card-educational';
import { MyOrderCardOtherComponent } from './other-service/my-order.card-other';
import { ThankYouModalComponent } from './thank-you-modal/thank-you-modal.component';
import { ProviderRatingModalComponent } from './provider-rating-modal/provider-rating-modal.component';

/** لوحة طلبات العميل — للاستخدام في التبويبات ومودال «عرض طلباتي» دون استيراد مسارات my-order. */
@NgModule({
  imports: [CommonModule, FormsModule, IonicModule],
  declarations: [
    MyOrdersPanelComponent,
    MyOrderCardDeliveryComponent,
    MyOrderCardEducationalComponent,
    MyOrderCardOtherComponent,
    ThankYouModalComponent,
    ProviderRatingModalComponent,
  ],
  exports: [MyOrdersPanelComponent],
})
export class MyOrdersPanelModule {}

import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MyOrderPage } from './my-order.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { MyOrderPageRoutingModule } from './my-order-routing.module';

// استيراد المكونات الرئيسية (النماذج)
import { ServiceSelectionComponent } from './service-selection.component';
import { DeliveryServiceComponent } from './delivery-service/delivery-service.component';
import { EducationalServiceComponent } from './educational-service/educational-service.component';
import { OtherServiceComponent } from './other-service/other-service.component';

// استيراد مكونات الكروت المستقلة (التي صممناها للعرض)
import { MyOrderCardDeliveryComponent } from './delivery-service/my-order.card-delivery';
import { MyOrderCardEducationalComponent } from './educational-service/my-order.card-educational';
import { MyOrderCardOtherComponent } from './other-service/my-order.card-other';
import { ThankYouModalComponent } from './thank-you-modal/thank-you-modal.component';
import { ProviderRatingModalComponent } from './provider-rating-modal/provider-rating-modal.component';
import { Mota7HeaderComponent } from '../top_header/header';


@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    Mota7HeaderComponent,
    MyOrderPageRoutingModule
  ],
  declarations: [
    MyOrderPage,
    ServiceSelectionComponent,
    DeliveryServiceComponent,
    EducationalServiceComponent,
    OtherServiceComponent,
    // تسجيل الكروت هنا ضروري جداً لتعمل الصفحة
    MyOrderCardDeliveryComponent,
    MyOrderCardEducationalComponent,
    MyOrderCardOtherComponent,
    ThankYouModalComponent,
    ProviderRatingModalComponent
  ]
})
export class MyOrderPageModule {}
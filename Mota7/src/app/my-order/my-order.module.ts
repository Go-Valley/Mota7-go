import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MyOrderPage } from './my-order.page';
import { MyOrdersPanelModule } from './my-orders-panel.module';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { MyOrderPageRoutingModule } from './my-order-routing.module';
import { ServiceRequestModalsModule } from './service-request-modals.module';

import { Mota7HeaderComponent } from '../top_header/header';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    Mota7HeaderComponent,
    MyOrderPageRoutingModule,
    ServiceRequestModalsModule,
    MyOrdersPanelModule,
  ],
  declarations: [MyOrderPage],
})
export class MyOrderPageModule {}

import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TabsPageRoutingModule } from './tabs-routing.module';
import { TabsPage } from './tabs.page';
import { ServiceRequestModalsModule } from '../my-order/service-request-modals.module';
import { AppTutorialModalComponent } from '../shared/app-tutorial-modal/app-tutorial-modal.component';
import { MyOrdersPanelModule } from '../my-order/my-orders-panel.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TabsPageRoutingModule,
    ServiceRequestModalsModule,
    AppTutorialModalComponent,
    MyOrdersPanelModule,
  ],
  declarations: [TabsPage]
})
export class TabsPageModule {}
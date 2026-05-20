import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ServiceSelectionComponent } from './service-selection.component';
import { DeliveryServiceComponent } from './delivery-service/delivery-service.component';
import { EducationalServiceComponent } from './educational-service/educational-service.component';
import { OtherServiceComponent } from './other-service/other-service.component';
import { GovernorateCitySelectorComponent } from '../shared/governorate-city-selector/governorate-city-selector.component';
import { Mota7DigitsOnlyIonInputDirective } from '../shared/directives/mota7-digits-only-ion-input.directive';

/** Shared modals: service category picker and order forms (tabs + my-order). */
@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    GovernorateCitySelectorComponent,
    Mota7DigitsOnlyIonInputDirective,
  ],
  declarations: [
    ServiceSelectionComponent,
    DeliveryServiceComponent,
    EducationalServiceComponent,
    OtherServiceComponent,
  ],
  exports: [
    ServiceSelectionComponent,
    DeliveryServiceComponent,
    EducationalServiceComponent,
    OtherServiceComponent,
  ],
})
export class ServiceRequestModalsModule {}

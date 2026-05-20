import { Component, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  briefcaseOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { ServiceSelectionComponent } from './service-selection.component';
import { DeliveryServiceComponent } from './delivery-service/delivery-service.component';
import { EducationalServiceComponent } from './educational-service/educational-service.component';
import { OtherServiceComponent } from './other-service/other-service.component';

@Component({
  selector: 'app-my-order',
  templateUrl: 'my-order.page.html',
  styleUrls: ['my-order.page.scss'],
  standalone: false,
})
export class MyOrderPage {
  selectedCategoryName = 'طلباتي';

  private modalCtrl = inject(ModalController);

  constructor() {
    addIcons({
      'briefcase-outline': briefcaseOutline,
      'sparkles-outline': sparklesOutline,
    });
  }

  private blurActiveElement(): void {
    const el = document.activeElement;
    if (el instanceof HTMLElement) {
      el.blur();
    }
  }

  async openServiceSelection(): Promise<void> {
    this.blurActiveElement();
    const modal = await this.modalCtrl.create({
      component: ServiceSelectionComponent,
      initialBreakpoint: 0.7,
      breakpoints: [0, 0.7, 0.9],
      handle: true,
      cssClass: 'mota7-modal-style',
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm' && data?.selectedCategory) {
      await this.openSpecificServiceModal(data.selectedCategory);
    }
  }

  private async openSpecificServiceModal(
    category: 'delivery' | 'education' | 'other'
  ): Promise<void> {
    let componentToOpen:
      | typeof DeliveryServiceComponent
      | typeof EducationalServiceComponent
      | typeof OtherServiceComponent;
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
      cssClass: 'mota7-modal-style',
    });
    await modal.present();
    await modal.onDidDismiss();
  }
}

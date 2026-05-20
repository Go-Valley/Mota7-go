import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AlertController,
  IonicModule,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  storefrontOutline,
  cartOutline,
  carOutline,
  schoolOutline,
  constructOutline,
  chevronBackOutline,
  closeOutline,
  personOutline,
} from 'ionicons/icons';
import type { AdminAdOwnerContext } from '@mota7-app/core/utils/admin-ad-owner-context.util';
import { AD_FORM_DISMISS_FOR_SUBSCRIPTION_PLANS_ROLE } from '@mota7-app/core/utils/user-ad-quota.util';
import { getDeliveryAdCurrentLocation } from '@mota7-app/core/utils/delivery-ad-geolocation.util';
import { StoreFormComponent } from '@mota7-app/my-account/my_adv/components/store-form/store-form.component';
import { ProductFormComponent } from '@mota7-app/my-account/my_adv/components/product-form/product-form.component';
import { OtherServicesFormComponent } from '@mota7-app/my-account/my_adv/components/other-services-form/other-services-form.component';
import { EducationFormComponent } from '@mota7-app/my-account/my_adv/components/education-form/education-form.component';
import { DeliveryFormComponent } from '@mota7-app/my-account/my_adv/components/delivery-form/delivery-form.component';

@Component({
  selector: 'app-admin-add-ad-type-modal',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './admin-add-ad-type-modal.component.html',
  styleUrls: ['./admin-add-ad-type-modal.component.scss'],
})
export class AdminAddAdTypeModalComponent {
  @Input({ required: true }) adminOwnerContext!: AdminAdOwnerContext;

  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);

  constructor() {
    addIcons({
      'storefront-outline': storefrontOutline,
      'cart-outline': cartOutline,
      'car-outline': carOutline,
      'school-outline': schoolOutline,
      'construct-outline': constructOutline,
      'chevron-back-outline': chevronBackOutline,
      'close-outline': closeOutline,
      'person-outline': personOutline,
    });
  }

  get ownerLabel(): string {
    const name = String(this.adminOwnerContext?.ownerFullName ?? '').trim();
    const phone = String(this.adminOwnerContext?.ownerPhone ?? '').trim();
    if (name && phone) {
      return `${name} — ${phone}`;
    }
    return phone || name || '—';
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }

  async selectType(type: string): Promise<void> {
    let component: unknown;
    switch (type) {
      case 'store':
        component = StoreFormComponent;
        break;
      case 'product':
        component = ProductFormComponent;
        break;
      case 'other':
        component = OtherServicesFormComponent;
        break;
      case 'education':
        component = EducationFormComponent;
        break;
      case 'delivery':
        component = DeliveryFormComponent;
        break;
      default:
        return;
    }

    let exitConfirmPending: Promise<boolean> | null = null;
    const componentProps: Record<string, unknown> = {
      adminOwnerContext: this.adminOwnerContext,
    };
    if (type === 'delivery') {
      componentProps['locationFunc'] = () => getDeliveryAdCurrentLocation();
    }

    const formModal = await this.modalCtrl.create({
      component: component as never,
      initialBreakpoint: 0.95,
      breakpoints: [0, 0.95],
      handle: true,
      componentProps,
      cssClass: 'mota7-admin-ad-form-modal',
      mode: 'ios',
      canDismiss: async (_data, role) => {
        if (
          role === 'confirm' ||
          role === AD_FORM_DISMISS_FOR_SUBSCRIPTION_PLANS_ROLE
        ) {
          return true;
        }
        if (exitConfirmPending) {
          return exitConfirmPending;
        }
        exitConfirmPending = (async () => {
          try {
            const alert = await this.alertCtrl.create({
              header: 'تأكيد الخروج',
              message: 'هل أنت متأكد؟ سيتم فقدان جميع البيانات المدخلة.',
              mode: 'ios',
              buttons: [
                { text: 'بقاء', role: 'cancel' },
                { text: 'خروج', role: 'confirm' },
              ],
            });
            await alert.present();
            const { role: alertRole } = await alert.onDidDismiss();
            return alertRole === 'confirm';
          } finally {
            exitConfirmPending = null;
          }
        })();
        return exitConfirmPending;
      },
    });

    await formModal.present();
    const { role } = await formModal.onDidDismiss();
    if (role === 'confirm') {
      await this.modalCtrl.dismiss({ saved: true }, 'confirm');
    }
  }
}

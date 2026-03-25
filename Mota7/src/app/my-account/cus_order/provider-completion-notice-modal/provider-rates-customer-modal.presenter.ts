import { ModalController } from '@ionic/angular';
import { ProviderRatesCustomerModalComponent } from './provider-rates-customer-modal.component';

export async function presentProviderRatesCustomerModal(
  modalCtrl: ModalController,
  orderId: string,
  order: any
): Promise<void> {
  const promptedKey = `mota7_prov_cust_rating_prompted_${orderId}`;
  try {
    sessionStorage.setItem(promptedKey, '1');
  } catch {
    /* ignore */
  }
  const modal = await modalCtrl.create({
    component: ProviderRatesCustomerModalComponent,
    componentProps: { orderId, order },
    cssClass: 'mota7-provider-rates-customer-modal',
    backdropDismiss: false,
    showBackdrop: true,
  });
  await modal.present();
  const dismissal = await modal.onDidDismiss();
  if (dismissal?.role !== 'confirm') {
    try {
      sessionStorage.removeItem(promptedKey);
    } catch {
      /* ignore */
    }
  }
}

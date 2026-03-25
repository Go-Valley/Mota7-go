import { ModalController } from '@ionic/angular';
import { ProviderRatesCustomerModalComponent } from './provider-rates-customer-modal.component';

export async function presentProviderRatesCustomerModal(
  modalCtrl: ModalController,
  orderId: string,
  order: any
): Promise<void> {
  try {
    sessionStorage.setItem(`mota7_prov_cust_rating_prompted_${orderId}`, '1');
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
  await modal.onDidDismiss();
}

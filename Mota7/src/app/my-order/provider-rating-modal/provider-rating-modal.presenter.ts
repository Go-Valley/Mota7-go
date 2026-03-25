import { ModalController } from '@ionic/angular';
import { ProviderRatingModalComponent } from './provider-rating-modal.component';

export async function presentProviderRatingModal(
  modalCtrl: ModalController,
  orderId: string,
  order: any
): Promise<void> {
  try {
    sessionStorage.setItem(`mota7_rating_prompted_${orderId}`, '1');
  } catch {
    /* storage غير متاح */
  }
  const modal = await modalCtrl.create({
    component: ProviderRatingModalComponent,
    componentProps: { orderId, order },
    cssClass: 'mota7-provider-rating-modal',
    backdropDismiss: false,
    showBackdrop: true,
  });
  await modal.present();
  await modal.onDidDismiss();
}

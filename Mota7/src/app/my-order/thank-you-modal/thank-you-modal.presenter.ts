import { ModalController } from '@ionic/angular';
import { ThankYouModalComponent } from './thank-you-modal.component';

export async function presentMota7ThankYouModal(modalCtrl: ModalController): Promise<void> {
  const modal = await modalCtrl.create({
    component: ThankYouModalComponent,
    cssClass: 'mota7-thank-you-modal',
    backdropDismiss: true,
    showBackdrop: true
  });
  await modal.present();
}

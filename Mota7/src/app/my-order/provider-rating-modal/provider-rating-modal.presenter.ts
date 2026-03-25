import { ModalController } from '@ionic/angular';
import { ProviderRatingModalComponent } from './provider-rating-modal.component';

export async function presentProviderRatingModal(
  modalCtrl: ModalController,
  orderId: string,
  order: any
): Promise<void> {
  const promptedKey = `mota7_rating_prompted_${orderId}`;
  try {
    sessionStorage.setItem(promptedKey, '1');
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
  const dismissal = await modal.onDidDismiss();
  // إذا لم يتم إرسال التقييم (cancel / dismiss) نسمح بظهور المودال مرة أخرى لاحقاً
  // (لكن إذا كان التقييم تم بنجاح role = 'confirm' سنحتفظ بالمفتاح لمنع التكرار الفوري).
  if (dismissal?.role !== 'confirm') {
    try {
      sessionStorage.removeItem(promptedKey);
    } catch {
      /* ignore */
    }
  }
}

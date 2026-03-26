import { ModalController } from '@ionic/angular';
import { ProviderRatesCustomerModalComponent } from './provider-rates-customer-modal.component';

function providerRatesCustomerPromptedStorageKey(orderId: string): string {
  return `mota7_prov_cust_rating_prompted_${orderId}`;
}

/** قبل `updateDoc` أو إكمال الطلب إلى مكتمل — يمنع `ngOnChanges` من فتح مودال ثانٍ قبل الأول. */
export function reserveProviderRatesCustomerRatingPrompt(orderId: string): void {
  if (!orderId) return;
  try {
    sessionStorage.setItem(providerRatesCustomerPromptedStorageKey(orderId), '1');
  } catch {
    /* ignore */
  }
}

export function releaseProviderRatesCustomerRatingPromptReservation(orderId: string): void {
  if (!orderId) return;
  try {
    sessionStorage.removeItem(providerRatesCustomerPromptedStorageKey(orderId));
  } catch {
    /* ignore */
  }
}

export async function presentProviderRatesCustomerModal(
  modalCtrl: ModalController,
  orderId: string,
  order: any
): Promise<void> {
  const promptedKey = providerRatesCustomerPromptedStorageKey(orderId);
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

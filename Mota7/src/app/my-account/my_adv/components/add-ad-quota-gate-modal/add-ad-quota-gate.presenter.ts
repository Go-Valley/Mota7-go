import { ModalController } from '@ionic/angular';
import type { OwnerAdQuotaGateState } from '../../../../core/utils/user-ad-quota.util';
import {
  AddAdQuotaGateModalComponent,
  type AddAdQuotaGateModalResult,
} from './add-ad-quota-gate-modal.component';

export type PresentAddAdQuotaGateModalOptions = {
  onOpenSubscriptionPlans?: () => void | Promise<void>;
};

/** مودال تحذيري/إرشادي عند فتح «إضافة إعلان جديد» */
export async function presentAddAdQuotaGateModal(
  modalCtrl: ModalController,
  gate: OwnerAdQuotaGateState,
  options?: PresentAddAdQuotaGateModalOptions
): Promise<AddAdQuotaGateModalResult> {
  const modal = await modalCtrl.create({
    component: AddAdQuotaGateModalComponent,
    componentProps: { gate },
    cssClass: 'add-ad-quota-gate-sheet',
    breakpoints:
      gate.variant === 'within_limit' ? [0, 0.72, 0.92] : [0, 0.78, 0.94],
    initialBreakpoint: gate.variant === 'within_limit' ? 0.72 : 0.78,
    handle: true,
    backdropDismiss: true,
  });
  await modal.present();
  const { data } = await modal.onDidDismiss<AddAdQuotaGateModalResult>();
  const role = data ?? 'close';

  if (role === 'subscriptions') {
    const go = options?.onOpenSubscriptionPlans;
    if (go) {
      await Promise.resolve(go()).catch(() => {});
    }
  }

  return role;
}

import type { ModalController, NavController, Platform } from '@ionic/angular';
import type { Subscription } from 'rxjs';

/** أعلى من home.page (10) حتى يُعالج الرجوع من صفحات الحساب قبل حوار الخروج */
export const HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY = 9999;

/**
 * زر الرجوع بالجهاز (أندرويد):
 * - إن وُجد `modalCtrl` وفُتح مودال (مثل تفاصيل المنتج)، يُغلق أعلى مودال فقط.
 * - وإلا الانتقال إلى تبويب «حسابي».
 * لا يستدعي processNextHandler عند التعامل هنا — يستهلك الحدث.
 */
export function subscribeHardwareBackToMyAccount(
  platform: Platform,
  navCtrl: NavController,
  modalCtrl?: ModalController
): Subscription {
  return platform.backButton.subscribeWithPriority(
    HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY,
    () => {
      if (!modalCtrl) {
        void navCtrl.navigateRoot('/tabs/my-account', { animated: true });
        return;
      }
      void (async () => {
        try {
          const top = await modalCtrl.getTop();
          if (top) {
            await top.dismiss();
            return;
          }
        } catch {
          /* تجاهل — نكمل للتنقل */
        }
        void navCtrl.navigateRoot('/tabs/my-account', { animated: true });
      })();
    }
  );
}

import type { ModalController, NavController, Platform } from '@ionic/angular';
import type { Subscription } from 'rxjs';

/**
 * يجب أن تكون أولوية الرجوع هنا **أقل** من معالج الطبقات في Ionic (`OVERLAY_BACK_BUTTON_PRIORITY` = 100)
 * ومن القائمة الجانبية (99). Ionic يختار معالجاً واحداً ذا أعلى أولوية لكل ضغطة؛
 * إذا كانت الأولوية أعلى من 100 كان زر الرجوع يغلق مودال النموذج مباشرة ويتجاهل
 * ion-action-sheet / ion-popover / التنبيهات فوقه.
 * نضع 50: فوق home.page (10) وتحت القائمة والطبقات حتى يُغلق الاختيار أولاً ثم المودال.
 */
export const HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY = 50;

/**
 * زر الرجوع بالجهاز (أندرويد):
 * - طبقات Ionic (قوائم اختيار، تنبيهات، أعلى مودال) تُغلق أولاً تلقائياً لأن أولويتها أعلى.
 * - إن وُجد `modalCtrl` ولم تبقَ طبقة، يُغلق أعلى مودال (مثل نموذج الإعلان).
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

import { Injectable } from '@angular/core';

/**
 * فتح مودال «باقات الاشتراكات» من نماذج الإعلانات بعد الانتقال إلى تبويب حسابي.
 * تسجّله `MyAccountPage`؛ حتى تُحمَّل الصفحة نُعيد المحاولة قصيرة.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionsModalBridgeService {
  private opener: (() => void | Promise<void>) | null = null;

  register(opener: () => void | Promise<void>): void {
    this.opener = opener;
  }

  unregister(): void {
    this.opener = null;
  }

  /** استدعاء بعد التوجيه إلى `/tabs/my-account` */
  requestOpen(): void {
    const run = (): void => {
      const fn = this.opener;
      if (fn) {
        void Promise.resolve(fn()).catch(() => {});
        return;
      }
      let attempts = 0;
      const id = window.setInterval(() => {
        attempts++;
        const f = this.opener;
        if (f) {
          window.clearInterval(id);
          void Promise.resolve(f()).catch(() => {});
        } else if (attempts >= 40) {
          window.clearInterval(id);
        }
      }, 50);
    };
    queueMicrotask(run);
  }
}

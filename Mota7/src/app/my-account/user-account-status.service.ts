import {
  Injectable,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
  NgZone,
  signal,
} from '@angular/core';
import { Auth, onAuthStateChanged, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDocFromServer, onSnapshot } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * يتابع مستند users/{معرّف} أثناء الجلسة:
 * عند isActive === false → تسجيل خروج + توجيه لصفحة الدخول.
 *
 * على WebView أندرويد قد لا يصل تحديث onSnapshot فوراً؛ لذلك على الأصلي:
 * - فحص من الخادم عند App resume
 * - استطلاع خفيف كل 45 ثانية أثناء وجود جلسة
 */
@Injectable({ providedIn: 'root' })
export class UserAccountStatusService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private injector = inject(EnvironmentInjector);
  private zone = inject(NgZone);

  private unsubUserDoc?: () => void;
  private started = false;
  private inactiveLogoutStarted = false;
  private nativeResumeListener?: { remove: () => Promise<void> };
  private nativePollTimer?: ReturnType<typeof setInterval>;

  /** false عندما يكون الحساب معطّلاً (isActive === false) */
  readonly accountUsable = signal(true);

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    void this.setupNativeLifecycleHooks();

    runInInjectionContext(this.injector, () => {
      onAuthStateChanged(this.auth, (user) => {
        this.cleanupUserDocListener();
        this.stopNativePoll();

        if (!user) {
          this.inactiveLogoutStarted = false;
          this.zone.run(() => this.accountUsable.set(true));
          return;
        }

        if (Capacitor.isNativePlatform()) {
          this.startNativePoll();
          void this.verifyAccountStatusFromServer('post-login');
        }

        const id = user.email?.includes('@') ? user.email.split('@')[0] : user.uid;
        const ref = doc(this.firestore, 'users', id);

        this.unsubUserDoc = onSnapshot(
          ref,
          (snap) => {
            this.zone.run(() => {
              if (!snap.exists()) {
                this.applyUserDocSnapshot(null, false);
                return;
              }
              this.applyUserDocSnapshot(snap.data() as Record<string, unknown>, true);
            });
          },
          () => {
            void this.verifyAccountStatusFromServer('snapshot-error');
          }
        );
      });
    });
  }

  private async setupNativeLifecycleHooks(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      this.nativeResumeListener = await App.addListener('resume', () => {
        void this.verifyAccountStatusFromServer('resume');
      });
    } catch {
      /* ignore */
    }
  }

  private startNativePoll(): void {
    this.stopNativePoll();
    this.nativePollTimer = setInterval(() => {
      void this.verifyAccountStatusFromServer('poll');
    }, 45_000);
  }

  private stopNativePoll(): void {
    if (this.nativePollTimer != null) {
      clearInterval(this.nativePollTimer);
      this.nativePollTimer = undefined;
    }
  }

  /**
   * قراءة من الخادم (تتجاوز كاش الويب في WebView عند الحاجة).
   */
  private async verifyAccountStatusFromServer(_source: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return;
    }
    const id = user.email?.includes('@') ? user.email.split('@')[0] : user.uid;
    const ref = doc(this.firestore, 'users', id);

    try {
      const snap = await runInInjectionContext(this.injector, () => getDocFromServer(ref));
      this.zone.run(() => {
        this.applyUserDocSnapshot(snap.exists() ? snap.data() : null, snap.exists());
      });
    } catch {
      /* غير متصل أو رفض الشبكة — يُترك للـ onSnapshot أو المحاولة التالية */
    }
  }

  private applyUserDocSnapshot(data: Record<string, unknown> | null, exists: boolean): void {
    if (!exists || !data) {
      this.accountUsable.set(true);
      this.inactiveLogoutStarted = false;
      return;
    }
    const disabled = data['isActive'] === false;
    this.accountUsable.set(!disabled);

    if (disabled) {
      if (!this.inactiveLogoutStarted) {
        this.inactiveLogoutStarted = true;
        void this.forceLogoutDisabled();
      }
    } else {
      this.inactiveLogoutStarted = false;
    }
  }

  private cleanupUserDocListener(): void {
    if (this.unsubUserDoc) {
      this.unsubUserDoc();
      this.unsubUserDoc = undefined;
    }
  }

  private async forceLogoutDisabled(): Promise<void> {
    this.zone.run(() => {
      void (async () => {
        try {
          const t = await this.toastCtrl.create({
            message: 'تم تعطيل حسابك من الإدارة. سيتم تسجيل خروجك.',
            duration: 4000,
            position: 'top',
            color: 'danger',
          });
          await t.present();
        } catch {
          /* ignore */
        }
        try {
          await signOut(this.auth);
        } catch {
          /* ignore */
        }
        try {
          await this.router.navigateByUrl('/login', { replaceUrl: true });
        } catch {
          /* ignore */
        }
      })();
    });
  }
}

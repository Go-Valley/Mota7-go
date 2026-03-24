import { Component, inject, Injector, OnInit, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, Platform } from '@ionic/angular';
import { NavigationStart, Router } from '@angular/router'; 
import { addIcons } from 'ionicons';
import { locationOutline, location, globeOutline } from 'ionicons/icons';

import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NtfyListenerService } from './core/services/ntfy-listener.service';
import { Mota7Notifications } from './plugins/mota7-notifications.plugin';
import { UserAccountStatusService } from './my-account/user-account-status.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class AppComponent implements OnInit {
  selectedCityLabel = 'الكل';
  showCityPopover = false;

  // تعريف خدمات الفيربيز والـ Ionic
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private alertCtrl = inject(AlertController);
  private platform = inject(Platform);
  private ntfyListener = inject(NtfyListenerService);
  private userAccountStatus = inject(UserAccountStatusService);

  /** منع ازدواجية نافذة التأكيد عند التشغيل ثم resume */
  private lastNotifPromptAt = 0;

  constructor(public router: Router) {
    addIcons({ locationOutline, location, globeOutline });
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }
    });
    this.initializeApp();
    this.configureWhatsappDeepLinkHandling();
  }

  ngOnInit() {}

  async initializeApp() {
    await this.platform.ready();

    /**
     * لا تستدعِ SplashScreen.hide() هنا فور platform.ready().
     * على أندرويد 12+ ذلك يزيل مستمع الإقلاع فوراً فيسبق انتهاء launchShowDuration
     * فيظهر وميض أسود/أبيض دون صورة الـ splash. الإخفاء يتم عبر launchAutoHide في capacitor.config.
     * لإخفاء مبكر عند جاهزية الواجهة: استدعِ hide() بعد تحميل الصفحة الأولى (مثلاً من ionViewDidEnter).
     */

    if (Capacitor.isNativePlatform()) {
      try {
        // Keep status bar readable in all app themes.
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#000000' });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch (_) {}
    }

    this.checkAuthState();
    this.userAccountStatus.start();

    if (this.platform.is('hybrid')) {
      void this.checkForUpdate();
      this.ntfyListener.start();
      void this.showNotificationPermissionReminder();
      void App.addListener('resume', () => {
        void this.showNotificationPermissionReminder();
      });
    }
  }

  /**
   * عند فتح/عودة التطبيق: يظهر التنبيه فقط إذا لم تُمنَح بعد صلاحية الإشعارات (نظام + محلية).
   */
  private async showNotificationPermissionReminder(): Promise<void> {
    if (!this.platform.is('hybrid')) {
      return;
    }

    let systemNotificationsOk = false;
    try {
      const n = await Mota7Notifications.getNotificationAccessState();
      systemNotificationsOk = !!n?.granted;
    } catch {
      systemNotificationsOk = false;
    }

    let localDisplayOk = false;
    try {
      const p = await LocalNotifications.checkPermissions();
      localDisplayOk = p.display === 'granted';
    } catch {
      localDisplayOk = false;
    }

    if (systemNotificationsOk && localDisplayOk) {
      return;
    }

    /**
     * أندرويد: حوار منح إذن الإشعارات يظهر من النظام عند الطلب (مثلاً من التهيئة أو أول إشعار).
     * لا نعرض نافذة تطبيق ثانية لتفادي التكرار مع شاشة أندرويد.
     */
    if (Capacitor.getPlatform() === 'android') {
      return;
    }

    const now = Date.now();
    if (now - this.lastNotifPromptAt < 900) {
      return;
    }
    this.lastNotifPromptAt = now;

    const alert = await this.alertCtrl.create({
      header: 'تفعيل الإشعارات',
      message:
        'لتصلك تنبيهات طلبات العملاء الجديدة وإعلانات مُتاح، يُرجى منح التطبيق صلاحية الإشعارات.',
      mode: 'ios',
      buttons: [
        { text: 'لاحقاً', role: 'cancel' },
        {
          text: 'تفعيل الآن',
          handler: () => {
            void (async () => {
              try {
                await Mota7Notifications.requestNotificationAccess().catch(() => {});
              } catch {
                /* ignore */
              }
              try {
                const p = await LocalNotifications.checkPermissions();
                if (p.display !== 'granted') {
                  await LocalNotifications.requestPermissions();
                }
              } catch {
                /* ignore */
              }
            })();
          },
        },
      ],
    });
    await alert.present();
  }

  private configureWhatsappDeepLinkHandling() {
    const originalOpen = window.open.bind(window);

    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const urlString = typeof url === 'string' ? url : url?.toString() ?? '';

      if (!urlString.startsWith('whatsapp://send?')) {
        return originalOpen(url as any, target as any, features as any);
      }

      const parsed = new URL(urlString);
      const rawPhone = parsed.searchParams.get('phone') ?? '';
      const phone = this.normalizeWhatsappPhone(rawPhone);
      const text = parsed.searchParams.get('text') ?? '';
      const whatsappUrl = `whatsapp://send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}`;

      if (Capacitor.isNativePlatform()) {
        void AppLauncher.openUrl({ url: whatsappUrl }).catch(() => {
          if (phone) {
            const fallbackUrl = `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}`;
            originalOpen(fallbackUrl, '_system');
          }
        });
        return null;
      }

      // Browser has no whatsapp:// handler; use web endpoint to avoid console error.
      const webUrl = `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}`;
      return originalOpen(webUrl, target ?? '_blank', features);
    }) as typeof window.open;
  }

  private normalizeWhatsappPhone(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('00')) return digits.slice(2);
    if (digits.startsWith('20')) return digits;
    if (digits.startsWith('2') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length >= 10) return `20${digits.slice(1)}`;
    if (digits.startsWith('1') && digits.length === 10) return `20${digits}`;
    return digits;
  }

  async checkForUpdate() {
    try {
      const configDoc = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'settings/app_config'))
      );
      
      if (configDoc.exists()) {
        const data = configDoc.data();
        const minVersion = data['min_version'] || 0;
        const updateUrl = data['update_url'];

        // جلب معلومات الإصدار الحالي
        const appInfo = await App.getInfo();
        const currentVersionCode = parseInt(appInfo.build);

        if (currentVersionCode < minVersion) {
          this.showUpdateAlert(updateUrl);
        }
      }
    } catch (error) {
      console.error('فشل جلب بيانات التحديث من الفايربيز:', error);
    }
  }

  async showUpdateAlert(url: string) {
    const alert = await this.alertCtrl.create({
      header: 'تحديث جديد متوفر',
      backdropDismiss: false,
      message: 'يتوفر إصدار جديد من تطبيق "مُتاح". يرجى التحديث الآن للاستمرار في استخدام التطبيق والحصول على آخر الميزات.',
      buttons: [
        {
          text: 'تحديث الآن',
          handler: () => {
            window.open(url, '_system');
            return false; 
          }
        }
      ]
    });

    await alert.present();
  }

  checkAuthState() {
    runInInjectionContext(this.injector, () =>
      onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        console.log('المستخدم مسجل دخول:', user.uid);
      } else {
        console.log('لا يوجد مستخدم مسجل');
      }
      })
    );
  }

  toggleCityPopover(): void { this.showCityPopover = !this.showCityPopover; }
  selectCity(label: string): void { this.selectedCityLabel = label; this.showCityPopover = false; }
  closeCityPopover(): void { this.showCityPopover = false; }
}
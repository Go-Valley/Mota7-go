import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Platform, IonicModule } from '@ionic/angular'; // أضفنا IonicModule هنا
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { NativeBiometric, BiometricAuthError } from 'capacitor-native-biometric';
import { CommonModule } from '@angular/common';
import { AdminNtfyListenerService } from './core/services/admin-ntfy-listener.service';
import { AdminNtfySetupService } from './core/services/admin-ntfy-setup.service';
import { ShoppingFirestoreSeedService } from './core/services/shopping-firestore-seed.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true, // تأكد أنها standalone
  imports: [IonicModule, CommonModule], // استيراد موديلات Ionic ضروري جداً هنا
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppComponent {
  private platform = inject(Platform);
  private adminNtfyListener = inject(AdminNtfyListenerService);
  private adminNtfySetup = inject(AdminNtfySetupService);
  private shoppingSeed = inject(ShoppingFirestoreSeedService);

  constructor() {
    this.initializeApp();
  }

  async initializeApp() {
    await this.platform.ready();

    void this.shoppingSeed.ensureShoppingDeliveryChargesDoc();

    if (Capacitor.isNativePlatform()) {
      try {
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#000000' });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        /* تجاهل على أجهزة لا تدعم الواجهة */
      }
    }

    if (this.platform.is('hybrid')) {
      void this.adminNtfySetup.prepareLocalNotifications();
      this.adminNtfyListener.start();
      void App.addListener('resume', () => {
        void this.adminNtfySetup.prepareLocalNotifications();
      });
    }

    this.checkFingerprint();
  }

  async checkFingerprint() {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const result = await NativeBiometric.isAvailable({ useFallback: false });
      if (result.isAvailable) {
        await NativeBiometric.verifyIdentity({
          reason: 'لوحة تحكم مُتاح برو محمية، يرجى تأكيد هويتك',
          title: 'تسجيل الدخول الآمن',
          subtitle: 'استخدم بصمة الإصبع للمتابعة',
          description: 'يتم التحقق من هويتك للوصول لبيانات الإعلانات والمستخدمين',
        });
      }
    } catch (error: unknown) {
      if (this.shouldLogBiometricFailure(error)) {
        console.error('فشل التحقق من الهوية', error);
      }
    }
  }

  /** لا نطبع في الكونسول عند الإلغاء أو عدم توفر البصمة أو فشل محاولة عادية */
  private shouldLogBiometricFailure(error: unknown): boolean {
    const code = this.getBiometricErrorCode(error);
    if (code === null) {
      return false;
    }
    const silent = new Set<number>([
      BiometricAuthError.USER_CANCEL,
      BiometricAuthError.APP_CANCEL,
      BiometricAuthError.SYSTEM_CANCEL,
      BiometricAuthError.USER_FALLBACK,
      BiometricAuthError.BIOMETRICS_UNAVAILABLE,
      BiometricAuthError.BIOMETRICS_NOT_ENROLLED,
      BiometricAuthError.NOT_INTERACTIVE,
      BiometricAuthError.AUTHENTICATION_FAILED,
      BiometricAuthError.INVALID_CONTEXT,
    ]);
    return !silent.has(code);
  }

  private getBiometricErrorCode(error: unknown): number | null {
    if (error == null) {
      return null;
    }
    const e = error as { code?: string | number; message?: string };
    if (e.code !== undefined && e.code !== null && e.code !== '') {
      const n = typeof e.code === 'string' ? parseInt(String(e.code), 10) : Number(e.code);
      if (!Number.isNaN(n)) {
        return n;
      }
    }
    const msg = (e.message ?? String(error)).toLowerCase();
    if (msg.includes('method not implemented') || msg.includes('not implemented')) {
      return BiometricAuthError.BIOMETRICS_UNAVAILABLE;
    }
    if (msg.includes('cancel') || msg.includes('canceled') || msg.includes('cancelled')) {
      return BiometricAuthError.USER_CANCEL;
    }
    return null;
  }
}
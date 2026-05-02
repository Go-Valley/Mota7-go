import type { CapacitorConfig } from '@capacitor/cli';

/**
 * إعداد أندرويد مطابق لفكرة مشروع Mota7:
 * webDir = مجلد مخرجات Angular (www) لضمان نفس CSS/الخطوط/الأصول كالويب.
 */
const config: CapacitorConfig = {
  appId: 'com.mota7.admin',
  appName: 'Mota7 Admin',
  webDir: 'www',
  server: {
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: ['*'],
  },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#ffffffff',
      androidScaleType: 'FIT_XY',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#000000',
      overlaysWebView: false,
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    backgroundColor: '#ffffff',
    buildOptions: {
      releaseType: 'APK',
    },
  },
};

export default config;

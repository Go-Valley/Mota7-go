import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mota7.app',
  appName: 'Mota7',
  webDir: 'www', // خليها 'www' زي ما هي لأن ده المجلد اللي الأنجولار بيبني فيه
  server: {
    // مهم للـ Live Reload على أندرويد عبر الشبكة المحلية
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: ['*']
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true, // مهم للـ Live Reload على أندرويد عبر الشبكة المحلية (بدون هيك يظهر شاشة البداية ويغلقها بعد 3 ثوان)   
      backgroundColor: "#ffffffff",
      // FIT_XY يشوّه نسبة الصورة على أحجام/أبعاد مختلفة (يتمدد بشكل كامل).
      // FIT_CENTER يحافظ على aspect ratio ويُقلل مشاكل الأجهزة ذات نسبة أبعاد مختلفة.
      androidScaleType: "FIT_CENTER",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#000000",
      overlaysWebView: false
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    backgroundColor: "#ffe1c0",
    // إضافة هذا السطر لضمان أن Capacitor لا يخطئ في المسارات
    buildOptions: {
      releaseType: 'APK'
    }
  }
};

export default config;
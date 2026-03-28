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
      /** 0 يخفض طبقة Capacitor فوراً؛ اللوجو يُعرض من MainActivity + شاشة Angular */
      launchShowDuration: 0,
      launchAutoHide: true,
      androidSplashResourceName: 'capacitor_splash',
      backgroundColor: '#ffe1c0',
      androidScaleType: 'CENTER_INSIDE',
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
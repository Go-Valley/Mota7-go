import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mota7.app',
  /** اسم العرض على iOS / App Store (عربي) */
  appName: 'مُتاح',
  webDir: 'www', // خليها 'www' زي ما هي لأن ده المجلد اللي الأنجولار بيبني فيه
  server: {
    // Live Reload على أندرويد عبر الشبكة المحلية
    androidScheme: 'http',
    // iOS: مخطّط افتراضي آمن لتقليل تحذيرات ATS
    iosScheme: 'ionic',
    cleartext: true,
    allowNavigation: ['*']
  },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      /** 0 يخفض طبقة Capacitor فوراً؛ اللوجو من شاشة Angular app-launch-shell فقط */
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
    Keyboard: {
      resizeOnFullScreen: true,
      resize: 'ionic',
      style: 'DARK',
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    backgroundColor: "#ffe1c0",
    buildOptions: {
      releaseType: 'APK'
    }
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    preferredContentMode: 'mobile',
    allowsLinkPreview: false,
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#ffe1c0',
    handleApplicationNotifications: false,
    /**
     * CFBundleShortVersionString من package.json؛ رقم البناء CURRENT_PROJECT_VERSION في Xcode / Codemagic
     * وزامنه مع Android versionCode عند كل إصدار (حالياً 26 على أندرويد).
     */
  },
};

export default config;
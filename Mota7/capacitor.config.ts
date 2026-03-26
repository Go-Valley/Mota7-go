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
      androidSplashResourceName: 'splash',
      // نفس لون ثيم الإقلاع الأصلي (ic_launcher_background / android.backgroundColor) لتفادي وميض لون مختلف
      backgroundColor: '#ffe1c0',
      // مواءمة مع splash_launch.xml (bitmap gravity=fill): ملء الشاشة مثل الطبقة الأصلية
      androidScaleType: 'FIT_XY',
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
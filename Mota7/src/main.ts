import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withHashLocation, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  home,
  person,
  addCircle,
  location,
  locationOutline,
  close,
  closeOutline,
  chevronDownCircleOutline,
  chevronDownOutline,
  chevronBackOutline,
  flashOutline,
  closeCircle,
  timeOutline,
  appsOutline,
  checkmarkDoneCircle,
  radioButtonOn
} from 'ionicons/icons';

// استيرادات الفيربيز
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { provideAnalytics, getAnalytics } from '@angular/fire/analytics';
import { provideRemoteConfig } from '@angular/fire/remote-config';

import { environment } from './environments/environment';
import { getApp, getApps, initializeApp as initializeSecondaryFirebaseApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getRemoteConfig } from 'firebase/remote-config';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

import { Capacitor } from '@capacitor/core';
import { resolvePrimaryFirebaseConfig } from './environments/firebase-app-options.util';

// Analytics يعمل فقط في المتصفح الحقيقي (ليس Native WebView) لتجنب فشل التهيئة على الأجهزة الأصلية
const isWebBrowser = Capacitor.getPlatform() === 'web' && !Capacitor.isNativePlatform();

// تسجيل الأيقونات الأساسية (قبل bootstrapApplication)
addIcons({
  home,
  person,
  addCircle,
  location,
  'location-outline': locationOutline,
  close,
  'close-outline': closeOutline,
  'chevron-down-circle-outline': chevronDownCircleOutline,
  'chevron-down-outline': chevronDownOutline,
  'chevron-back-outline': chevronBackOutline,
  'flash-outline': flashOutline,
  'close-circle': closeCircle,
  'time': timeOutline,
  'time-outline': timeOutline,
  'apps': appsOutline,
  'apps-outline': appsOutline,
  'checkmark-done': checkmarkDoneCircle,
  'checkmark-done-circle': checkmarkDoneCircle,
  'radio-button-on': radioButtonOn
});

/** تطبيق Firebase ثانٍ للمصادقة على المشروع القديم فقط (قبل أي شاشة تستخدمه) */
function ensureLegacyFirebaseApp(): void {
  const legacy = environment.legacyFirebaseConfig;
  if (!legacy?.apiKey) {
    return;
  }
  if (getApps().some((a) => a.name === 'legacy')) {
    return;
  }
  initializeSecondaryFirebaseApp(legacy, 'legacy');
}

ensureLegacyFirebaseApp();

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withHashLocation(), withPreloading(PreloadAllModules)),

    // Firebase
    provideFirebaseApp(() => initializeApp(resolvePrimaryFirebaseConfig(environment))),
    provideRemoteConfig(() => {
      const rc = getRemoteConfig(getApp());
      rc.settings.minimumFetchIntervalMillis = environment.production ? 12 * 60 * 60 * 1000 : 0;
      return rc;
    }),
    provideAuth(() => getAuth()),
    /**
     * تجنّب أخطاء net::ERR_QUIC_PROTOCOL_ERROR / WebChannel على Chrome وبعض الشبكات
     * (تظهر أحياناً في الكونسول عند Listen/Write رغم إعادة اتصال الـ SDK).
     */
    provideFirestore(() =>
      initializeFirestore(getApp(), {
        experimentalForceLongPolling: true,
      })
    ),

    // Analytics يعمل فقط على الويب لتجنب Crash في Android
    ...(isWebBrowser ? [provideAnalytics(() => getAnalytics())] : [])
  ],
});
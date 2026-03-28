import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withHashLocation, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  home,
  person,
  addCircle,
  location,
  close,
  closeOutline,
  chevronDownCircleOutline,
  chevronDownOutline,
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
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAnalytics, getAnalytics } from '@angular/fire/analytics';
import { provideRemoteConfig } from '@angular/fire/remote-config';

import { environment } from './environments/environment';
import { getApp, getApps, initializeApp as initializeSecondaryFirebaseApp } from 'firebase/app';
import { getRemoteConfig } from 'firebase/remote-config';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

import { Capacitor } from '@capacitor/core';

// Analytics يعمل فقط في المتصفح الحقيقي (ليس Native WebView) لتجنب فشل التهيئة على Android
const isWebBrowser = Capacitor.getPlatform() === 'web' && !Capacitor.isNativePlatform();

// تسجيل الأيقونات الأساسية (قبل bootstrapApplication)
addIcons({
  home,
  person,
  addCircle,
  location,
  close,
  'close-outline': closeOutline,
  'chevron-down-circle-outline': chevronDownCircleOutline,
  'chevron-down-outline': chevronDownOutline,
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
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideRemoteConfig(() => {
      const rc = getRemoteConfig(getApp());
      rc.settings.minimumFetchIntervalMillis = environment.production ? 12 * 60 * 60 * 1000 : 0;
      return rc;
    }),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),

    // Analytics يعمل فقط على الويب لتجنب Crash في Android
    ...(isWebBrowser ? [provideAnalytics(() => getAnalytics())] : [])
  ],
});
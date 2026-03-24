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

import { environment } from './environments/environment';

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

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withHashLocation(), withPreloading(PreloadAllModules)),

    // Firebase
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),

    // Analytics يعمل فقط على الويب لتجنب Crash في Android
    ...(isWebBrowser ? [provideAnalytics(() => getAnalytics())] : [])
  ],
});
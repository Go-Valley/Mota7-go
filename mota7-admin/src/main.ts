import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http'; // الإضافة المطلوبة هنا
import { addIcons } from 'ionicons';
import {
  shieldCheckmarkOutline,
  mailUnreadOutline,
  fingerPrintOutline,
  keyOutline,
} from 'ionicons/icons';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// استيرادات الفايربيز
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { environment } from './environments/environment';

addIcons({
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'mail-unread-outline': mailUnreadOutline,
  'finger-print-outline': fingerPrintOutline,
  'key-outline': keyOutline,
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(), // تفعيل خدمة الـ HTTP للرفع على كلاوديناري
    
    // ربط الفايربيز داخل الـ Providers
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
  ],
});
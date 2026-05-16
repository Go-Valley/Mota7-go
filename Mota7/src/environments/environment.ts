import { LEGACY_MOTA7_APP_FIREBASE_CONFIG } from './firebase-legacy-mota7-app.config';

export const environment = {
  production: false,
  /** نفس applicationId في android/app/build.gradle — لرابط Play و market:// */
  androidApplicationId: 'com.mota7.app',
  /** رابط صفحة التطبيق على Google Play (للتحديث الإجباري) */
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.mota7.app',
  /**
   * بعد نشر iOS، ضع الرابط الكامل لصفحة App Store (مثلاً https://apps.apple.com/app/id123456789).
   * يُستخدم مع التحديث الإجباري واختبارات TestFlight عند الحاجة.
   */
  appStoreUrl: '',
  /**
   * ntfy: غيّر `topic` إلى سلسلة طويلة عشوائية سرية؛ أي من يعرفها يمكنه الإرسال/الاستقبال.
   * عطّل `enabled` إن لم تستخدم الإشعارات العامة.
   */
  /**
   * وسيط حذف Cloudinary — بدون /delete. محلي مع npm start في cloudinary-delete-proxy.
   * للإنتاج: ضع رابط HTTPS بعد النشر (Render إلخ) في environment.prod.ts.
   */
  cloudinaryDeleteProxyUrl: 'http://127.0.0.1:8787',
  fcmPushServerUrl: 'http://127.0.0.1:8790',
  fcmPushApiKey: '',
  ntfy: {
    enabled: true,
    baseUrl: 'https://ntfy.sh',
    topic: 'mota7-go-ads-change-this-secret-topic',
    /** نفس الموضوع ما لم تضع ordersTopic منفصلاً */
    ordersEnabled: true,
    ordersTopic: '',
  },
  firebaseConfig: {
  apiKey: "AIzaSyDdr8tdhseQ8HYxMAJbzZpBX9lm8zaZOv4",
  authDomain: "mota7-go.firebaseapp.com",
  projectId: "mota7-go",
  storageBucket: "mota7-go.firebasestorage.app",
  messagingSenderId: "1078959492808",
  appId: "1:1078959492808:web:1c0013dfeec7ca53551ffd",
  measurementId: "G-G8V3F6XHNT"
  },
  /** نفس الحقول مع appId الأندرويد — يُستخدم على الجهاز الأصلي Android فقط */
  firebaseConfigAndroid: {
    apiKey: "AIzaSyDdr8tdhseQ8HYxMAJbzZpBX9lm8zaZOv4",
    authDomain: "mota7-go.firebaseapp.com",
    projectId: "mota7-go",
    storageBucket: "mota7-go.firebasestorage.app",
    messagingSenderId: "1078959492808",
    appId: "1:1078959492808:android:ab1d62cc15ee9da3551ffd"
  },
  /** تطبيق Firebase iOS — يطابق `ios/App/App/GoogleService-Info.plist` (GOOGLE_APP_ID، API_KEY). */
  firebaseConfigIos: {
    apiKey: "AIzaSyC3WPEzRRfFp3sl3jBK1_Oo5thDNN3Vq_g",
    authDomain: "mota7-go.firebaseapp.com",
    projectId: "mota7-go",
    storageBucket: "mota7-go.firebasestorage.app",
    messagingSenderId: "1078959492808",
    appId: "1:1078959492808:ios:763364b8ccb51000551ffd"
  },
  /** مشروع mota7-app — راجع `firebase-legacy-mota7-app.config.ts` وألصق apiKey */
  legacyFirebaseConfig: LEGACY_MOTA7_APP_FIREBASE_CONFIG,
};
import { LEGACY_MOTA7_APP_FIREBASE_CONFIG } from './firebase-legacy-mota7-app.config';

export const environment = {
  production: false,
  androidApplicationId: 'com.mota7.app',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.mota7.app',
  /**
   * ntfy: غيّر `topic` إلى سلسلة طويلة عشوائية سرية؛ أي من يعرفها يمكنه الإرسال/الاستقبال.
   * عطّل `enabled` إن لم تستخدم الإشعارات العامة.
   */
  /**
   * على الموبايل الحقيقي استخدم رابط HTTPS المنشور للبروكسي.
   * هذا يمنع مشاكل 10.0.2.2 (الخاص بالمحاكي فقط) ويجعل الحذف يعمل في APK التجريبي.
   */
  cloudinaryDeleteProxyUrl: 'https://mota7-go.onrender.com',
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
  legacyFirebaseConfig: LEGACY_MOTA7_APP_FIREBASE_CONFIG,
};

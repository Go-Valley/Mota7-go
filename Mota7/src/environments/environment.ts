import { LEGACY_MOTA7_APP_FIREBASE_CONFIG } from './firebase-legacy-mota7-app.config';

export const environment = {
  production: false,
  /**
   * ntfy: غيّر `topic` إلى سلسلة طويلة عشوائية سرية؛ أي من يعرفها يمكنه الإرسال/الاستقبال.
   * عطّل `enabled` إن لم تستخدم الإشعارات العامة.
   */
  /**
   * وسيط حذف Cloudinary — بدون /delete. محلي مع npm start في cloudinary-delete-proxy.
   * للإنتاج: ضع رابط HTTPS بعد النشر (Render إلخ) في environment.prod.ts.
   */
  cloudinaryDeleteProxyUrl: 'http://127.0.0.1:8787',
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
  /** مشروع mota7-app — راجع `firebase-legacy-mota7-app.config.ts` وألصق apiKey */
  legacyFirebaseConfig: LEGACY_MOTA7_APP_FIREBASE_CONFIG,
};
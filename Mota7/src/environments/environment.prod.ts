import { LEGACY_MOTA7_APP_FIREBASE_CONFIG } from './firebase-legacy-mota7-app.config';

export const environment = {
  production: true, // لاحظ هنا true
  androidApplicationId: 'com.mota7.app',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.mota7.app',
  /** رابط صفحة App Store بعد الإصدار العام؛ يستخدم في التحديث الإجباري على iOS */
  appStoreUrl: '',
  /** وسيط حذف Cloudinary (HTTPS فقط للمتاجر). مثال: https://اسم-الخدمة.onrender.com */
  cloudinaryDeleteProxyUrl: 'https://mota7-go.onrender.com',
  ntfy: {
    enabled: true,
    baseUrl: 'https://ntfy.sh',
    topic: 'mota7-go-ads-change-this-secret-topic',
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
  firebaseConfigAndroid: {
    apiKey: "AIzaSyDdr8tdhseQ8HYxMAJbzZpBX9lm8zaZOv4",
    authDomain: "mota7-go.firebaseapp.com",
    projectId: "mota7-go",
    storageBucket: "mota7-go.firebasestorage.app",
    messagingSenderId: "1078959492808",
    appId: "1:1078959492808:android:ab1d62cc15ee9da3551ffd"
  },
  firebaseConfigIos: {
    apiKey: "AIzaSyDdr8tdhseQ8HYxMAJbzZpBX9lm8zaZOv4",
    authDomain: "mota7-go.firebaseapp.com",
    projectId: "mota7-go",
    storageBucket: "mota7-go.firebasestorage.app",
    messagingSenderId: "1078959492808",
    appId: "1:1078959492808:ios:REPLACE_WITH_FIREBASE_IOS_APP_ID"
  },
  legacyFirebaseConfig: LEGACY_MOTA7_APP_FIREBASE_CONFIG,
};
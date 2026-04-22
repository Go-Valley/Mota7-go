export const environment = {
  production: false,
  /**
   * يجب أن يطابق إعدادات تطبيق Mota7 (نفس topic) لاستقبال إشعارات ntfy للإعلانات والطلبات.
   */
  /** وسيط حذف Cloudinary (نفس Mota7) — بدون /delete */
  cloudinaryDeleteProxyUrl: 'https://mota7-go.onrender.com',
  ntfy: {
    enabled: true,
    baseUrl: 'https://ntfy.sh',
    topic: 'mota7-go-ads-change-this-secret-topic',
    ordersEnabled: true,
    ordersTopic: '',
  },
  /** نفس تطبيق الويب في Firebase (مشروع mota7-go) — الـ SDK داخل WebView/Capacitor وليس الـ Native Android SDK */
  firebaseConfig: {
    apiKey: "AIzaSyDdr8tdhseQ8HYxMAJbzZpBX9lm8zaZOv4",
    authDomain: "mota7-go.firebaseapp.com",
    projectId: "mota7-go",
    storageBucket: "mota7-go.firebasestorage.app",
    messagingSenderId: "1078959492808",
    appId: "1:1078959492808:web:1c0013dfeec7ca53551ffd",
    measurementId: "G-G8V3F6XHNT"
  }
};
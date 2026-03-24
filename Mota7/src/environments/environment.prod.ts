export const environment = {
  production: true, // لاحظ هنا true
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
    appId: "1:1078959492808:android:ab1d62cc15ee9da3551ffd"
  }
};
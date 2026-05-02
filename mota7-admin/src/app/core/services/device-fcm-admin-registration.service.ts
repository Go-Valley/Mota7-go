import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Firestore, doc, serverTimestamp, setDoc } from '@angular/fire/firestore';

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** نفس عنوان topic الذي تُرسِله Cloud Functions لمشرفي اللوحة */
export const ADMIN_FCM_TOPIC = 'admin_all';

/**
 * تطبيق لوحة الإدارة: اشتراك `admin_all` + حفظ الرمز تحت device_tokens لمطابقة قواعد Firestore.
 */
@Injectable({ providedIn: 'root' })
export class DeviceFcmAdminRegistrationService {
  private firestore = inject(Firestore);

  /** يُستدعى بعد نجاح Firebase signIn للبريد المصرّح (قائمة isAdmin بالقواعد) */
  async registerAfterFirebaseLogin(adminEmailTrimmed: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const perm = await FirebaseMessaging.checkPermissions();
      if (perm.receive !== 'granted') {
        await FirebaseMessaging.requestPermissions();
      }
    } catch (e) {
      console.warn('[DeviceFcm Admin] permissions', e);
    }

    try {
      await FirebaseMessaging.subscribeToTopic({ topic: ADMIN_FCM_TOPIC });
    } catch (e) {
      console.warn('[DeviceFcm Admin] subscribe topic', e);
    }

    try {
      const { token } = await FirebaseMessaging.getToken();
      if (!token) return;
      const id = await sha256Hex(`${token}:${adminEmailTrimmed}`);
      await setDoc(
        doc(this.firestore, 'device_tokens', id),
        {
          token,
          admin_email: adminEmailTrimmed,
          app: 'mota7_admin',
          platform: Capacitor.getPlatform(),
          updatedAt: serverTimestamp(),
          disabled: false,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('[DeviceFcm Admin] persist', e);
    }
  }
}

import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Auth, type User } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { normalizeProviderPhoneForLookup } from '../utils/provider-phone-normalize.util';

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * تسجيل FCM لتطبيق Mota7 لمقدّمي الخدمة (حساب {phone}@mota7.com).
 * المرآة الخلفية: `firebase/functions/resolve-provider-phones.cjs` + مجموعة device_tokens.
 */
@Injectable({ providedIn: 'root' })
export class DeviceFcmMota7RegistrationService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private tokenListenerAttached = false;

  /** يُستدعى بعد onAuthStateChanged على المنصّة الهجينة */
  async registerIfEligible(user: User | null): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (!user?.email?.endsWith('@mota7.com')) return;

    try {
      const perm = await FirebaseMessaging.checkPermissions();
      if (perm.receive !== 'granted') await FirebaseMessaging.requestPermissions();
    } catch (e) {
      console.warn('[FCM mota7] permissions', e);
    }

    if (!this.tokenListenerAttached) {
      try {
        await FirebaseMessaging.addListener('tokenReceived', (ev: { token: string }) => {
          const u = this.auth.currentUser;
          if (!u?.email?.endsWith('@mota7.com')) return;
          const phone = normalizeProviderPhoneForLookup(u.email.replace('@mota7.com', ''));
          if (!phone) return;
          void this.writeTokenDoc(ev.token, phone);
        });
      } catch (e) {
        console.warn('[FCM mota7] listener', e);
      }
      this.tokenListenerAttached = true;
    }

    const ownerPhone = normalizeProviderPhoneForLookup(user.email.replace('@mota7.com', ''));
    if (!ownerPhone) {
      return;
    }
    try {
      const { token } = await FirebaseMessaging.getToken();
      if (token) await this.writeTokenDoc(token, ownerPhone);
    } catch (e) {
      console.warn('[FCM mota7] getToken', e);
    }
  }

  private async writeTokenDoc(token: string, ownerPhone: string): Promise<void> {
    try {
      const id = await sha256Hex(token);
      await setDoc(
        doc(this.firestore, 'device_tokens', id),
        {
          token,
          owner_phone: ownerPhone,
          app: 'mota7',
          platform: Capacitor.getPlatform(),
          updatedAt: serverTimestamp(),
          disabled: false,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('[FCM mota7] Firestore save', e);
    }
  }
}

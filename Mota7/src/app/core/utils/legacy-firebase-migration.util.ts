import { getApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { orderPhoneToEnglishDigits } from './egyptian-phone-order.util';
import { defaultMaxAdsForTier } from './verification-tiers.util';

/** Firestore للمشروع المسمى `legacy` */
export function getLegacyFirestore(): Firestore | null {
  try {
    return getFirestore(getApp('legacy'));
  } catch {
    return null;
  }
}

/**
 * تحويل phoneNumber القديم (+2012… أو 01…) إلى صيغة الطلب 11 رقماً تبدأ بـ 01
 */
export function legacyPhoneNumberToOrderPhone(phoneNumber: string): string | null {
  const d = orderPhoneToEnglishDigits(String(phoneNumber ?? '')).replace(/\D/g, '');
  if (/^01\d{9}$/.test(d)) {
    return d;
  }
  if (d.startsWith('20')) {
    const national = d.slice(2);
    if (/^01\d{9}$/.test(national)) {
      return national;
    }
    if (national.length === 10 && national.startsWith('1')) {
      return `0${national}`;
    }
  }
  if (d.length === 10 && d.startsWith('1')) {
    return `0${d}`;
  }
  return null;
}

export interface MigratedUserFirestorePayload {
  uid: string;
  fullName: string;
  phone: string;
  city: string;
  systemEmail: string;
  personalEmail: string;
  createdAt: string;
  role: string;
  isActive: boolean;
  verification_level: string;
  verifiedStatus: string;
  max_active_ads: number;
}

/** بناء مستند users/{phone} الجديد من بروفايل Firestore القديم (مفتاح المستند هناك: uid) */
export function buildMigratedUserFirestoreDoc(
  phone: string,
  systemEmail: string,
  newUid: string,
  legacy: Record<string, unknown> | null
): MigratedUserFirestorePayload {
  const displayName =
    typeof legacy?.['displayName'] === 'string' ? legacy['displayName'].trim() : '';
  const fullName = (displayName.length > 0 ? displayName : 'مستخدم').slice(0, 20);
  const personalEmail = typeof legacy?.['email'] === 'string' ? legacy['email'].trim() : '';
  const loc = typeof legacy?.['location'] === 'string' ? legacy['location'].trim() : '';
  const city = loc.length > 0 ? loc.slice(0, 40) : 'الخارجة';
  const createdAt =
    typeof legacy?.['createdAt'] === 'string' && legacy['createdAt'].length > 0
      ? legacy['createdAt']
      : new Date().toISOString();

  return {
    uid: newUid,
    fullName,
    phone,
    city,
    systemEmail,
    personalEmail,
    createdAt,
    role: 'user',
    isActive: true,
    verification_level: 'free',
    verifiedStatus: 'free',
    max_active_ads: defaultMaxAdsForTier('free'),
  };
}

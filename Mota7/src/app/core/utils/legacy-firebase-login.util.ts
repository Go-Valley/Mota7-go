import { getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/**
 * بريد الدخول في مشروع Firebase القديم: +20 + 9 أرقام بعد الصفر الأول + @phone.local
 * (مثال: 01002288812 → +201002288812@phone.local)
 */
export function toLegacyLoginEmail(phone11: string): string {
  const p = phone11.trim();
  if (p.length === 11 && p.startsWith('0')) {
    return `+20${p.slice(1)}@phone.local`;
  }
  return `+20${p.replace(/^0+/, '')}@phone.local`;
}

/** يعيد Auth للتطبيق المسمى `legacy` إن وُجد، وإلا null */
export function getLegacyFirebaseAuth(): Auth | null {
  try {
    return getAuth(getApp('legacy'));
  } catch {
    return null;
  }
}

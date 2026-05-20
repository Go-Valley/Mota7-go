import type { User } from '@angular/fire/auth';
import { normalizeProviderPhoneForLookup } from './provider-phone-normalize.util';

/**
 * رقم مقدم الخدمة للاستعلام عن الإعلانات و device_tokens —
 * نفس ترتيب «طلبات العملاء» و fcm-push-server.
 */
export function resolveProviderPhoneFromAuth(
  user: User | null | undefined,
  uid?: string
): string {
  if (!user) {
    return '';
  }
  if (user.email?.endsWith('@mota7.com')) {
    const fromEmail = normalizeProviderPhoneForLookup(user.email.replace('@mota7.com', ''));
    if (fromEmail) {
      return fromEmail;
    }
  }
  const id = uid ?? (user.email ? user.email.split('@')[0] : user.uid);
  return normalizeProviderPhoneForLookup(id);
}

import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { formatWhatsappMessageWithGreeting } from './whatsapp-message-format.util';

export {
  WHATSAPP_GREETING_LINE,
  WHATSAPP_GREETING_PREFIX,
  formatWhatsappMessageWithGreeting,
  encodeWhatsappText,
} from './whatsapp-message-format.util';

/**
 * رقم دولي بأرقام فقط (بدون +) — مناسب لـ whatsapp:// و wa.me
 */
export function normalizeWhatsappPhoneDigits(phone: string): string {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('20') && d.length >= 11) return d;
  if (d.startsWith('0') && d.length >= 10) return `20${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('1')) return `20${d}`;
  return d;
}

/**
 * على التطبيق الأصلي (Capacitor): فتح واتساب عبر AppLauncher مع احتياطي لـ location.assign.
 * على المتصفح: رابط wa.me لتفادي أخطاء الكونسول عند عدم تسجيل مخطط whatsapp://.
 */
export function openWhatsappNative(phone: string, message: string = ''): void {
  const digits = normalizeWhatsappPhoneDigits(phone);
  if (!digits || typeof window === 'undefined') {
    return;
  }
  const formatted = message.trim()
    ? formatWhatsappMessageWithGreeting(message)
    : '';
  const appUrl = formatted
    ? `whatsapp://send?phone=${digits}&text=${encodeURIComponent(formatted)}`
    : `whatsapp://send?phone=${digits}`;

  if (Capacitor.isNativePlatform()) {
    void AppLauncher.openUrl({ url: appUrl }).catch(() => {
      window.location.assign(appUrl);
    });
    return;
  }

  const webUrl = formatted
    ? `https://wa.me/${digits}?text=${encodeURIComponent(formatted)}`
    : `https://wa.me/${digits}`;
  window.open(webUrl, '_blank', 'noopener,noreferrer');
}

import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

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
 * على الأصلي: فتح تطبيق واتساب (whatsapp:// عبر AppLauncher مع احتياطي).
 * على الويب/سطح المكتب: wa.me لتفادي خطأ «scheme does not have a registered handler».
 */
export function openWhatsappNative(phone: string, message: string = ''): void {
  const digits = normalizeWhatsappPhoneDigits(phone);
  if (!digits || typeof window === 'undefined') {
    return;
  }
  const appUrl = message.trim()
    ? `whatsapp://send?phone=${digits}&text=${encodeURIComponent(message)}`
    : `whatsapp://send?phone=${digits}`;

  if (Capacitor.isNativePlatform()) {
    void AppLauncher.openUrl({ url: appUrl }).catch(() => {
      window.location.assign(appUrl);
    });
    return;
  }

  const webUrl = message.trim()
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${digits}`;
  window.open(webUrl, '_blank', 'noopener,noreferrer');
}

import { Capacitor } from '@capacitor/core';

/**
 * رقم دولي بأرقام فقط (بدون +) — مناسب لـ whatsapp://send
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
 * فتح تطبيق واتساب على الجهاز (بروتوكول whatsapp://) مع الحفاظ على نص الرسالة كما هو.
 * لا يستخدم wa.me داخل WebView حتى لا يُحمَّل الموقع.
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
    window.location.assign(appUrl);
    return;
  }

  /* متصفح سطح المكتب/الويب: نفس البروتوكول يفتح تطبيق واتساب إن وُجد */
  window.location.href = appUrl;
}

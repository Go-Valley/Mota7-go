/** رسالة التحذير الفوري ورسالة الإرسال عند عدم مطابقة الرقم */
export const ORDER_PHONE_INVALID_MSG = 'الرقم غير صحيح - ابدأ ب 01';

/** عند محاولة إدخال حرف أو رمز (نفس أسلوب حقل المبلغ) */
export const ORDER_PHONE_DIGITS_ONLY_MSG = 'لايمكن قبول حروف - ارقام فقط';

export function orderPhoneToEnglishDigits(value: string): string {
  return String(value ?? '')
    .replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d: string) => String(d.charCodeAt(0) - 1776));
}

/** أي محتوى ليس رقماً إنجليزياً بعد تحويل الأرقام العربية/الفارسية (يشمل الحروف العربية والإنجليزية). */
export function orderPhoneRawHasNonDigitChars(text: string | undefined | null): boolean {
  const n = orderPhoneToEnglishDigits(String(text ?? ''));
  return /[^\d]/.test(n);
}

/** أرقام إنجليزية فقط، بحد أقصى 11 رقم */
export function sanitizeOrderPhoneInput(raw: string | undefined | null): string {
  return orderPhoneToEnglishDigits(String(raw ?? ''))
    .replace(/\D/g, '')
    .slice(0, 11);
}

/** تحذير أثناء الكتابة: أول رقم ليس 0، أو أول رقمين ليسا 01 */
export function getOrderPhoneLiveWarning(digitsOnly: string): string | null {
  const d = digitsOnly || '';
  if (!d.length) {
    return null;
  }
  if (d[0] !== '0') {
    return ORDER_PHONE_INVALID_MSG;
  }
  if (d.length >= 2 && !d.startsWith('01')) {
    return ORDER_PHONE_INVALID_MSG;
  }
  return null;
}

/** 11 رقماً بالضبط ويبدأ بـ 01 */
export function isOrderPhoneValid(digitsOnly: string): boolean {
  return /^01\d{9}$/.test(digitsOnly || '');
}

/**
 * تحذير فوري لحقل الهاتف في التسجيل/النماذج:
 * - أي حرف أو رمز في الإدخال الخام → نفس رسالة الشروط
 * - أرقام فقط لكن لا تطابق بادئة 01 أو الطول 11 → تحذير
 * - بادئة صحيحة أثناء الكتابة (0، 01، 01xxxx… حتى 10 أرقام) → بدون تحذير
 */
export function getOrderPhoneFieldLiveWarning(
  cleanedDigits: string,
  hadNonDigitInRaw: boolean
): string | null {
  if (hadNonDigitInRaw) {
    return ORDER_PHONE_INVALID_MSG;
  }
  const d = cleanedDigits || '';
  if (!d.length) {
    return null;
  }
  if (d.length > 11) {
    return ORDER_PHONE_INVALID_MSG;
  }
  if (d[0] !== '0') {
    return ORDER_PHONE_INVALID_MSG;
  }
  if (d.length >= 2 && !d.startsWith('01')) {
    return ORDER_PHONE_INVALID_MSG;
  }
  if (d.length === 11) {
    return isOrderPhoneValid(d) ? null : ORDER_PHONE_INVALID_MSG;
  }
  return null;
}

/**
 * تنظيف رقم الهاتف في الحقل + تحذير فوري (نمط 01 / أرقام فقط عند وجود حروف في الإدخال).
 * لاستخدامها مع ionInput بنفس منطق delivery-service.
 */
export function applyOrderPhoneInputState(raw: string | undefined | null): {
  cleaned: string;
  warning: string | null;
} {
  const s = String(raw ?? '');
  const englishRaw = orderPhoneToEnglishDigits(s);
  const hadNonDigit = /\D/.test(englishRaw);
  const cleaned = sanitizeOrderPhoneInput(s);
  if (isOrderPhoneValid(cleaned)) {
    return { cleaned, warning: null };
  }
  const patternWarn = getOrderPhoneLiveWarning(cleaned);
  return {
    cleaned,
    warning: patternWarn ?? (hadNonDigit ? ORDER_PHONE_DIGITS_ONLY_MSG : null),
  };
}

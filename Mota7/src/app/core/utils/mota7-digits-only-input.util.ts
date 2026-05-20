import type { IonInput } from '@ionic/angular';
import {
  ORDER_PHONE_DIGITS_ONLY_MSG,
  orderPhoneToEnglishDigits,
} from './egyptian-phone-order.util';

export const DIGITS_ONLY_BLOCKED_MSG = ORDER_PHONE_DIGITS_ONLY_MSG;

export type Mota7DigitsOnlyInputMode = 'phone' | 'amount';

/**
 * يضبط عنصر الإدخال الأصلي داخل ion-input لفتح لوحة أرقام على الموبايل
 * (خصوصاً WebView/Capacitor حيث لا تكفي سمات ion-input وحدها).
 */
export async function applyMota7DigitsOnlyNativeKeyboard(
  ionInput: IonInput | undefined,
  mode: Mota7DigitsOnlyInputMode
): Promise<HTMLInputElement | null> {
  if (!ionInput) {
    return null;
  }
  try {
    const el = await ionInput.getInputElement();
    el.spellcheck = false;
    el.lang = 'en';
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
    if (mode === 'phone') {
      el.type = 'tel';
      el.inputMode = 'numeric';
      el.setAttribute('inputmode', 'numeric');
      el.pattern = '[0-9]*';
      el.autocomplete = 'tel-national';
      el.maxLength = 11;
    } else {
      el.type = 'tel';
      el.inputMode = 'numeric';
      el.setAttribute('inputmode', 'numeric');
      el.pattern = '[0-9]*';
      el.removeAttribute('autocomplete');
      el.dir = 'rtl';
      el.style.textAlign = 'right';
      el.setAttribute('dir', 'rtl');
    }
    return el;
  } catch {
    return null;
  }
}

export function isDigitsOnlyControlKey(ev: KeyboardEvent): boolean {
  return !!ev && (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing);
}

/** مفتاح واحد — رقم إنجليزي أو عربي/فارسي بعد التحويل */
export function isDigitCharacter(key: string): boolean {
  if (!key || key.length !== 1) {
    return false;
  }
  return /^[0-9]$/.test(orderPhoneToEnglishDigits(key));
}

export function rawTextHasNonDigit(text: string | undefined | null): boolean {
  return /\D/.test(orderPhoneToEnglishDigits(String(text ?? '')));
}

/** منع الحروف والرموز أثناء الكتابة — لوحة أرقام + حماية إضافية */
export function blockDigitsOnlyKeyDown(
  ev: KeyboardEvent,
  onBlocked?: () => void
): void {
  if (!ev || isDigitsOnlyControlKey(ev)) {
    return;
  }
  const key = ev.key;
  if (typeof key !== 'string' || key.length !== 1) {
    return;
  }
  if (isDigitCharacter(key)) {
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  onBlocked?.();
}

export function blockDigitsOnlyBeforeInput(
  ev: InputEvent,
  onBlocked?: () => void
): void {
  const t = ev.inputType || '';
  if (t !== 'insertText' && t !== 'insertCompositionText') {
    return;
  }
  const chunk = ev.data ?? '';
  if (!chunk) {
    return;
  }
  if (rawTextHasNonDigit(chunk)) {
    ev.preventDefault();
    onBlocked?.();
  }
}

export function digitsOnlyFromClipboard(ev: ClipboardEvent): string {
  const text = ev.clipboardData?.getData('text') ?? '';
  return orderPhoneToEnglishDigits(text).replace(/\D/g, '');
}

export function blockDigitsOnlyPaste(
  ev: ClipboardEvent,
  applyDigits: (digits: string) => void,
  onBlocked?: () => void
): void {
  const raw = ev.clipboardData?.getData('text') ?? '';
  if (raw && rawTextHasNonDigit(raw)) {
    onBlocked?.();
  }
  const digits = digitsOnlyFromClipboard(ev);
  ev.preventDefault();
  if (digits) {
    applyDigits(digits);
  }
}

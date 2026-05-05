/**
 * يحفظ بيانات مشتري «تأكيد طلب العربة» (زائر غير مسجل) في localStorage
 * لمتابعة Ionic/Capacitor WebView. يحدِّث أيضًا last_customer_phone لتماشي سلوك my-order/guest-contact.
 */
import { sanitizeOrderPhoneInput } from './egyptian-phone-order.util';
import { LAST_CUSTOMER_PHONE_STORAGE_KEY, writeGuestOrderContact } from './guest-order-contact-storage.util';

const STORAGE_KEY = 'mota7_shopping_guest_buyer_v1';

export type ShoppingCheckoutCity = 'الخارجة' | 'الداخلة';

export interface StoredShoppingBuyer {
  name: string;
  phone: string;
  city: ShoppingCheckoutCity;
}

function parseCityStored(v: unknown): ShoppingCheckoutCity | null {
  const s = String(v ?? '').trim();
  if (s === 'الخارجة' || s === 'الداخلة') return s;
  return null;
}

/** يطابق نص المدينة في ملف تعريف المستخدم مع خيارات صفحة التأكيد */
export function normalizeProfileCityToShoppingCheckout(raw: unknown): ShoppingCheckoutCity | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.includes('خارجة') || /kharga/i.test(s)) return 'الخارجة';
  if (s.includes('داخلة') || /dakhla/i.test(s)) return 'الداخلة';
  const exact = parseCityStored(s);
  return exact;
}

/** قراءة بيانات المشتري المحفوظة للشراء بدون حساب؛ null إذا لا شيء صالح */
export function readStoredShoppingBuyer(): StoredShoppingBuyer | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as { name?: unknown; phone?: unknown; city?: unknown };
      const name = typeof o.name === 'string' ? o.name.trim().slice(0, 120) : '';
      const phone = typeof o.phone === 'string' ? sanitizeOrderPhoneInput(o.phone) : '';
      const city = parseCityStored(o.city) ?? ('الخارجة' as ShoppingCheckoutCity);
      if (name || phone || (o.city && parseCityStored(o.city))) {
        return { name, phone, city };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** يحفظ الاسم ورقم الهاتف والمدينة بعد إدخال ناجح أو قبل مغادرة الصفحة (زائر) */
export function writeStoredShoppingBuyer(
  name: string,
  phone: string,
  city: ShoppingCheckoutCity
): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const n = (name ?? '').trim().slice(0, 120);
  const p = sanitizeOrderPhoneInput(phone ?? '');
  const c = parseCityStored(city) ?? 'الخارجة';
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: n, phone: p, city: c }));
    writeGuestOrderContact(n, p);
    if (p) {
      localStorage.setItem(LAST_CUSTOMER_PHONE_STORAGE_KEY, p);
    }
  } catch {
    /* خاصية خاصة / امتلاء التخزين */
  }
}

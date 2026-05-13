/**
 * يحفظ بيانات مشتري «تأكيد طلب العربة» (زائر غير مسجل) في localStorage
 * لمتابعة Ionic/Capacitor WebView. يحدِّث أيضًا last_customer_phone لتماشي سلوك my-order/guest-contact.
 */
import { sanitizeOrderPhoneInput } from './egyptian-phone-order.util';
import { LAST_CUSTOMER_PHONE_STORAGE_KEY, writeGuestOrderContact } from './guest-order-contact-storage.util';

const STORAGE_KEY = 'mota7_shopping_guest_buyer_v1';

/** نص مدينة المشتري كما يُحفظ في الطلب (أي اسم مدينة من القائمة أو قيم قديمة) */
export type ShoppingCheckoutCity = string;

export interface StoredShoppingBuyer {
  name: string;
  phone: string;
  city: string;
  governorateId?: string;
  cityId?: string;
}

function parseStoredCity(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 120) : null;
}

/** يطابق نص المدينة في ملف تعريف المستخدم مع حقل الطلب؛ يحافظ على تطابق الوادي الجديد القديم */
export function normalizeProfileCityToShoppingCheckout(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.includes('خارجة') || /kharga/i.test(s)) return 'الخارجة';
  if (s.includes('داخلة') || /dakhla/i.test(s)) return 'الداخلة';
  return s;
}

/** قراءة بيانات المشتري المحفوظة للشراء بدون حساب؛ null إذا لا شيء صالح */
export function readStoredShoppingBuyer(): StoredShoppingBuyer | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as {
        name?: unknown;
        phone?: unknown;
        city?: unknown;
        governorateId?: unknown;
        cityId?: unknown;
      };
      const name = typeof o.name === 'string' ? o.name.trim().slice(0, 120) : '';
      const phone = typeof o.phone === 'string' ? sanitizeOrderPhoneInput(o.phone) : '';
      const city = parseStoredCity(o.city) ?? 'الخارجة';
      const governorateId =
        typeof o.governorateId === 'string' ? o.governorateId.trim() : '';
      const cityId = typeof o.cityId === 'string' ? o.cityId.trim() : '';
      if (name || phone || parseStoredCity(o.city)) {
        const out: StoredShoppingBuyer = { name, phone, city };
        if (governorateId && cityId) {
          out.governorateId = governorateId;
          out.cityId = cityId;
        }
        return out;
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
  city: string,
  geo?: { governorateId: string; cityId: string } | null
): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const n = (name ?? '').trim().slice(0, 120);
  const p = sanitizeOrderPhoneInput(phone ?? '');
  const c = parseStoredCity(city) ?? 'الخارجة';
  const gid = geo?.governorateId?.trim() ?? '';
  const cid = geo?.cityId?.trim() ?? '';
  const payload: Record<string, unknown> = { name: n, phone: p, city: c };
  if (gid && cid) {
    payload['governorateId'] = gid;
    payload['cityId'] = cid;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    writeGuestOrderContact(n, p, c);
    if (p) {
      localStorage.setItem(LAST_CUSTOMER_PHONE_STORAGE_KEY, p);
    }
  } catch {
    /* خاصية خاصة / امتلاء التخزين */
  }
}

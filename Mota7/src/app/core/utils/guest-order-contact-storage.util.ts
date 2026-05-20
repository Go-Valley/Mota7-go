/**
 * حفظ اسم ورقم هاتف ومدينة «مكان تواجدك» لصاحب طلب الخدمة (زائر غير مسجل) على الجهاز عبر localStorage
 * في WebView/Capacitor. يُبقى مفتاح last_customer_phone متوافقاً مع my-order (الاستماع للطلبات).
 */
const GUEST_ORDER_CONTACT_KEY = 'mota7_guest_order_contact';
/** مفتاح قديم — يُحدَّث مع JSON ليبقى السلوك السابق */
export const LAST_CUSTOMER_PHONE_STORAGE_KEY = 'last_customer_phone';

export interface GuestOrderContactGeo {
  governorateId: string;
  cityId: string;
}

export interface GuestOrderContact {
  name: string;
  phone: string;
  /** نص المدينة المعروض (مثل اختيار المحافظة/المدن) */
  city: string;
  governorateId?: string;
  cityId?: string;
}

function parseGuestGeo(o: Record<string, unknown>): GuestOrderContactGeo | undefined {
  const governorateId = typeof o['governorateId'] === 'string' ? o['governorateId'].trim() : '';
  const cityId = typeof o['cityId'] === 'string' ? o['cityId'].trim() : '';
  if (governorateId && cityId) {
    return { governorateId, cityId };
  }
  return undefined;
}

export function readGuestOrderContact(): GuestOrderContact {
  try {
    const raw = localStorage.getItem(GUEST_ORDER_CONTACT_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>;
      const name = typeof o['name'] === 'string' ? o['name'] : '';
      const phone = typeof o['phone'] === 'string' ? o['phone'] : '';
      const city = typeof o['city'] === 'string' ? o['city'].trim() : '';
      const geo = parseGuestGeo(o);
      if (name.trim() || phone.trim() || city || geo) {
        return {
          name: name.trim(),
          phone: phone.trim(),
          city,
          governorateId: geo?.governorateId,
          cityId: geo?.cityId,
        };
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const phone = (localStorage.getItem(LAST_CUSTOMER_PHONE_STORAGE_KEY) ?? '').trim();
    return { name: '', phone, city: '' };
  } catch {
    return { name: '', phone: '', city: '' };
  }
}

export function writeGuestOrderContact(
  name: string,
  phone: string,
  city?: string,
  geo?: GuestOrderContactGeo | null
): void {
  const trimmedName = (name ?? '').trim();
  const trimmedPhone = (phone ?? '').trim();
  const trimmedCity = (city ?? '').trim();
  const gid = geo?.governorateId?.trim() ?? '';
  const cid = geo?.cityId?.trim() ?? '';
  try {
    const payload: Record<string, string> = {
      name: trimmedName,
      phone: trimmedPhone,
      city: trimmedCity,
    };
    if (gid && cid) {
      payload['governorateId'] = gid;
      payload['cityId'] = cid;
    }
    localStorage.setItem(GUEST_ORDER_CONTACT_KEY, JSON.stringify(payload));
    if (trimmedPhone) {
      localStorage.setItem(LAST_CUSTOMER_PHONE_STORAGE_KEY, trimmedPhone);
    }
  } catch {
    /* خاصية خاصة / امتلاء التخزين */
  }
}

/** بعد loadUserProfile: تعبئة الحقول الفارغة من التخزين المحلي للزائر فقط */
export function mergeGuestStoredContactIntoOrderData(
  orderData: {
    customerName: string;
    customerPhone: string;
    city?: string;
  },
  hasLoggedInEmail: boolean
): void {
  if (hasLoggedInEmail) {
    return;
  }
  const g = readGuestOrderContact();
  if (!orderData.customerName.trim() && g.name) {
    orderData.customerName = g.name;
  }
  if (!orderData.customerPhone.trim() && g.phone) {
    orderData.customerPhone = g.phone;
  }
  const cur = String(orderData.city ?? '').trim();
  if (!cur && g.city) {
    orderData.city = g.city;
  }
}

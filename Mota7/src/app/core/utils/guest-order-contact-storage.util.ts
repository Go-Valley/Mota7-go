/**
 * حفظ اسم ورقم هاتف صاحب طلب الخدمة (زائر غير مسجل) على الجهاز عبر localStorage
 * في WebView/Capacitor. يُبقى مفتاح last_customer_phone متوافقاً مع my-order (الاستماع للطلبات).
 */
const GUEST_ORDER_CONTACT_KEY = 'mota7_guest_order_contact';
/** مفتاح قديم — يُحدَّث مع JSON ليبقى السلوك السابق */
export const LAST_CUSTOMER_PHONE_STORAGE_KEY = 'last_customer_phone';

export interface GuestOrderContact {
  name: string;
  phone: string;
}

export function readGuestOrderContact(): GuestOrderContact {
  try {
    const raw = localStorage.getItem(GUEST_ORDER_CONTACT_KEY);
    if (raw) {
      const o = JSON.parse(raw) as { name?: unknown; phone?: unknown };
      const name = typeof o.name === 'string' ? o.name : '';
      const phone = typeof o.phone === 'string' ? o.phone : '';
      if (name.trim() || phone.trim()) {
        return { name: name.trim(), phone: phone.trim() };
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const phone = (localStorage.getItem(LAST_CUSTOMER_PHONE_STORAGE_KEY) ?? '').trim();
    return { name: '', phone };
  } catch {
    return { name: '', phone: '' };
  }
}

export function writeGuestOrderContact(name: string, phone: string): void {
  const trimmedName = (name ?? '').trim();
  const trimmedPhone = (phone ?? '').trim();
  try {
    localStorage.setItem(
      GUEST_ORDER_CONTACT_KEY,
      JSON.stringify({ name: trimmedName, phone: trimmedPhone })
    );
    if (trimmedPhone) {
      localStorage.setItem(LAST_CUSTOMER_PHONE_STORAGE_KEY, trimmedPhone);
    }
  } catch {
    /* خاصية خاصة / امتلاء التخزين */
  }
}

/** بعد loadUserProfile: تعبئة الحقول الفارغة من التخزين المحلي للزائر فقط */
export function mergeGuestStoredContactIntoOrderData(orderData: {
  customerName: string;
  customerPhone: string;
}, hasLoggedInEmail: boolean): void {
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
}

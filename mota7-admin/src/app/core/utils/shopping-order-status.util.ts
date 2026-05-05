/** قيم `status` المخزَّنة على مستند `shopping/{id}` */
export type ShoppingOrderStatusKey = 'pending' | 'active' | 'shipping' | 'done' | 'reject';

const TITLE: Record<ShoppingOrderStatusKey, string> = {
  pending: 'قيد الانتظار',
  active: 'نشط',
  shipping: 'جاري الشحن',
  done: 'إتمام الطلب',
  reject: 'رفض',
};

const DESCRIPTION: Record<ShoppingOrderStatusKey, string> = {
  pending: 'الطلب قيد المراجعة',
  active: 'تمت الموافقة وجاري تحضير الطلبات للتوصيل',
  shipping: 'تم شحن طلباتك للتوصيل إليك',
  done: 'تم تنفيذ الطلب بنجاح - شكراً لاستخدامك تطبيق «مُتاح»',
  reject: 'الطلب مرفوض — يرجى التواصل مع الإدارة',
};

export function shoppingOrderStatusTitle(key: ShoppingOrderStatusKey): string {
  return TITLE[key];
}

export function shoppingOrderStatusDescription(key: ShoppingOrderStatusKey): string {
  return DESCRIPTION[key];
}

/** نص واحد مختصر لواجهات تعرض جملة واحدة فقط (مثل الشريط ضيق) */
export function shoppingOrderSingleLinePhrase(key: ShoppingOrderStatusKey): string {
  return `${TITLE[key]}: ${DESCRIPTION[key]}`;
}

/** أول حقول معروفة لحالة طلب العربة قد تأتي بتسميات مختلفة من العميل أو الأدوات القديمة */
export function pickShoppingOrderStatusRaw(data: Record<string, unknown>): unknown {
  for (const k of ['status', 'Status', 'orderStatus', 'order_status'] as const) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) {
      return v;
    }
  }
  return data['status'];
}

/**
 * تصنيف أي قيمة قديمة من Firestore أو واجهة قديمة إلى المفتاح الحالي.
 * يدعم تطبيعًا خفيفًا (RTL، شرطات) ومطابقات جزئية آمنة لـ shipping/done.
 */
export function normalizeShoppingOrderStatusKey(raw: unknown): ShoppingOrderStatusKey {
  if (raw == null) {
    return 'pending';
  }
  let str =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'number' || typeof raw === 'boolean'
        ? String(raw)
        : '';
  str = String(str)
    .normalize('NFKC')
    .replace(/[\ufeff\u200c\u200f\u200e\u061c]/g, '')
    .trim();

  if (!str) {
    return 'pending';
  }

  const s = str.toLowerCase().replace(/\s+/g, '-').replace(/_+/g, '-');
  /** جمل قبل التحويل إلى شرطات — للمطابقة بالكلمات */
  const spaced = str.toLowerCase().replace(/[-_/]+/g, ' ');

  /** رفض قبل غيرها */
  if (
    s === 'reject' ||
    s === 'rejected' ||
    s === 'refused' ||
    s === 'denied' ||
    /\breject(ed|ion)?s?\b/u.test(spaced)
  ) {
    return 'reject';
  }

  /** إتمام / done */
  if (
    s === 'done' ||
    s === 'completed' ||
    s === 'complete' ||
    s === 'fulfilled' ||
    /\b(done|completed|complete|fulfilled)\b/u.test(spaced)
  ) {
    return 'done';
  }
  /** عبارات شائعة بالعربي */
  if (/اتمام|إتمام|أتمام|اكتمال|تم\s+(?:التنفيذ|تنفيذ)/u.test(str)) {
    return 'done';
  }

  /** شحن */
  if (
    s === 'shipping' ||
    s === 'shipped' ||
    s === 'ship' ||
    s.startsWith('shipping') ||
    s.startsWith('shipped') ||
    s === 'in-transit' ||
    s === 'in_transit' ||
    /\b(shipping|shipped)\b/u.test(spaced)
  ) {
    return 'shipping';
  }
  if (/جاري\s*الشحن|تم\s+شحن/u.test(str)) {
    return 'shipping';
  }

  /** نشط */
  if (s === 'active' || s === 'approved' || s === 'confirmed') {
    return 'active';
  }

  return 'pending';
}

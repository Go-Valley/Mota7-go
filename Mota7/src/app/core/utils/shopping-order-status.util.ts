/** قيم `status` المخزَّنة على مستند `shopping/{id}` */
export type ShoppingOrderStatusKey = 'pending' | 'active' | 'shipping' | 'done' | 'reject';

const TITLE: Record<ShoppingOrderStatusKey, string> = {
  pending: 'قيد الانتظار',
  active: 'نشط',
  shipping: 'جاري الشحن',
  done: 'اتمام الطلب',
  reject: 'رفض',
};

const DESCRIPTION: Record<ShoppingOrderStatusKey, string> = {
  pending: 'الطلب قيد المراجعة',
  active: 'تمت الموافقة وجاري تحضير الطلبات للتوصيل',
  shipping: 'تم شحن طلباتك للتوصيل اليك',
  done: 'تم تنفيذ الطلب بنجاح - شكراً لأستخدامك تطبيق "مُتاح"',
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

/**
 * يبحث عن أول سلسلة لحالة الطلب مهما كان اسم الحقل المتصل بـ status / state على المستند.
 */
export function pickShoppingOrderStatusRaw(data: Record<string, unknown>): unknown {
  const d = data && typeof data === 'object' ? data : {};

  const isPresent = (v: unknown): boolean => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') {
      return v.normalize('NFKC').replace(/[\ufeff\u200c\u200f\u200e\u061c]/g, '').trim().length > 0;
    }
    return true;
  };

  const orderedKeys = [
    'status',
    'Status',
    'orderStatus',
    'order_status',
    'orderState',
    'order_state',
    'shoppingStatus',
    'shopping_status',
  ];

  for (const k of orderedKeys) {
    const raw = d[k];
    if (isPresent(raw)) {
      return raw;
    }
  }

  const keysSorted = Object.keys(d).sort();
  for (const key of keysSorted) {
    const kl = key.trim().toLowerCase().replace(/[\s_-]/g, '');
    if (kl.includes('statistics')) continue;
    const isKnown =
      kl === 'status' ||
      kl === 'orderstatus' ||
      kl === 'orderstate' ||
      kl === 'shoppingstatus' ||
      kl === 'shoppingstate';
    if (!isKnown) continue;
    const raw = d[key];
    if (isPresent(raw)) {
      return raw;
    }
  }

  return undefined;
}

/**
 * يفتح طبقة أو قديماً { value / stringValue } إن حُملت القيمة هكذا.
 */
function unwrapStatusScalar(raw: unknown): unknown {
  let cur: unknown = raw;
  for (let i = 0; i < 3 && cur != null && typeof cur === 'object' && !Array.isArray(cur); i++) {
    const o = cur as Record<string, unknown>;
    if (typeof o['value'] === 'string') {
      cur = o['value'];
      continue;
    }
    if (typeof o['stringValue'] === 'string') {
      cur = o['stringValue'];
      continue;
    }
    break;
  }
  return cur;
}

/**
 * تصنيف أي قيمة قديمة من Firestore أو واجهة قديمة إلى المفتاح الحالي.
 */
export function normalizeShoppingOrderStatusKey(raw: unknown): ShoppingOrderStatusKey {
  const unwrapped = unwrapStatusScalar(raw);
  if (unwrapped == null) {
    return 'pending';
  }
  let str =
    typeof unwrapped === 'string'
      ? unwrapped
      : typeof unwrapped === 'number' || typeof unwrapped === 'boolean'
        ? String(unwrapped)
        : '';

  str = String(str)
    .normalize('NFKC')
    .replace(/[\ufeff\u200c\u200f\u200e\u061c]/g, '')
    .trim();

  if (!str) {
    return 'pending';
  }

  const s = str.toLowerCase().replace(/\s+/g, '-').replace(/_+/g, '-');
  const spaced = str.toLowerCase().replace(/[-_/]+/g, ' ');

  if (
    s === 'reject' ||
    s === 'rejected' ||
    s === 'refused' ||
    s === 'denied' ||
    /\breject(ed|ion)?s?\b/u.test(spaced)
  ) {
    return 'reject';
  }

  /** إتمام / done — قبل نشط لتفادي تطابق «active» الزائف */
  if (
    s === 'done' ||
    s === 'completed' ||
    s === 'complete' ||
    s === 'fulfilled' ||
    /\b(done|completed|complete|fulfilled)\b/u.test(spaced)
  ) {
    return 'done';
  }
  if (/اتمام|إتمام|أتمام|اكتمال|تم\s+(?:التنفيذ|تنفيذ)/u.test(str)) {
    return 'done';
  }

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

  if (s === 'active' || s === 'approved' || s === 'confirmed') {
    return 'active';
  }

  return 'pending';
}

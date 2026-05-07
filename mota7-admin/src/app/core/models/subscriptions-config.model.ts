/** مستند Firestore: subscriptions/config */

export type SubscriptionPlanSection = 'main' | 'swiper';

/** مستوى الشكل البصري للبطاقة في التطبيق */
export type SubscriptionPlanTier =
  | 'trial'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'diamond'
  | 'slate';

export interface SubscriptionPlan {
  id: string;
  name: string;
  /** سطر السعر المعروض للمستخدم، مثال: «30 جم / شهر» */
  priceLabel: string;
  /** رقم للفرز أو للاستخدام لاحقاً في الدفع */
  price: number;
  subtitle?: string;
  tagline?: string;
  includedFeatures: string[];
  excludedFeatures: string[];
  /** مثل: *يمكنك الترقية أو إلغاء الاشتراك في أي وقت */
  footerNote?: string;
  /** مثل: تنتهي خلال 7 أيام — للتجربة */
  expiryHint?: string;
  visible: boolean;
  section: SubscriptionPlanSection;
  order: number;
  highlight: boolean;
  badge?: string;
  tier?: SubscriptionPlanTier;
  /** الحد الأقصى للإعلانات النشطة/قيد المراجعة لمن يطبِّق عليه هذا السقف (مع ربط المستخدم بالباقة). */
  max_allowed_ads?: number;
}

export interface SubscriptionsConfig {
  active: boolean;
  show_empty_message: boolean;
  empty_message?: string;
  plans: SubscriptionPlan[];
  addons_html: string;
  /** واتساب الشركة لاستلام طلبات اشتراك الباقات (ليست رقم المستخدم) */
  subscription_orders_whatsapp?: string;
  /** أسعار طلب التثبيت VIP بالأيام — مستويات 1–5 من لوحة الأدمن */
  vip_pin_price_level_1?: number;
  vip_pin_price_level_2?: number;
  vip_pin_price_level_3?: number;
  vip_pin_price_level_4?: number;
  vip_pin_price_level_5?: number;
  /** سعر عرض بانر إعلاني (شهرياً) */
  banner_display_price?: number;
  /** سعر تصميم بانر إعلاني (مرة واحدة) */
  banner_design_price?: number;
}

export const SUBSCRIPTIONS_CONFIG_DOC_PATH = ['subscriptions', 'config'] as const;

export const DEFAULT_SUBSCRIPTIONS_CONFIG: SubscriptionsConfig = {
  active: false,
  show_empty_message: true,
  empty_message: '',
  plans: [],
  addons_html: '',
  subscription_orders_whatsapp: '',
  vip_pin_price_level_1: 50,
  vip_pin_price_level_2: 45,
  vip_pin_price_level_3: 40,
  vip_pin_price_level_4: 35,
  vip_pin_price_level_5: 30,
  banner_display_price: 50,
  banner_design_price: 50,
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.map((x) => String(x ?? '').trim()).filter((s) => s.length > 0);
}

function coerceMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function coerceMaxAllowedAds(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    return Math.floor(v);
  }
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function coerceTier(v: unknown): SubscriptionPlanTier | undefined {
  const s = String(v ?? '').trim().toLowerCase();
  const ok: SubscriptionPlanTier[] = [
    'trial',
    'bronze',
    'silver',
    'gold',
    'diamond',
    'slate',
  ];
  return ok.includes(s as SubscriptionPlanTier) ? (s as SubscriptionPlanTier) : undefined;
}

export function coerceSubscriptionPlan(raw: unknown): SubscriptionPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const id = String(o['id'] ?? '').trim();
  if (!id) {
    return null;
  }
  const name = String(o['name'] ?? '').trim();
  const priceLabelRaw =
    o['priceLabel'] ?? o['price_label'] ?? o['price_display'] ?? '';
  const priceLabel = String(priceLabelRaw ?? '').trim();
  const pr = o['price'];
  let price = 0;
  if (typeof pr === 'number' && Number.isFinite(pr)) {
    price = pr;
  } else {
    const n = parseFloat(String(pr ?? '0').replace(/,/g, ''));
    price = Number.isFinite(n) ? n : 0;
  }

  let included = asStringArray(o['includedFeatures'] ?? o['included_features']);
  const excluded = asStringArray(o['excludedFeatures'] ?? o['excluded_features']);
  if (included.length === 0) {
    included = asStringArray(o['features']);
  }

  const secRaw = String(o['section'] ?? 'main').trim().toLowerCase();
  const section: SubscriptionPlanSection =
    secRaw === 'swiper' ? 'swiper' : 'main';

  const ord = o['order'];
  let order = 0;
  if (typeof ord === 'number' && Number.isFinite(ord)) {
    order = ord;
  } else {
    const n = parseInt(String(ord ?? '0'), 10);
    order = Number.isFinite(n) ? n : 0;
  }

  const vis = o['visible'];
  const visible =
    vis === undefined || vis === null ? true : Boolean(vis);

  const hi = o['highlight'];
  const highlight = Boolean(hi);

  return {
    id,
    name,
    priceLabel: priceLabel || (price > 0 ? `${price} جم` : 'مجاناً'),
    price,
    subtitle: String(o['subtitle'] ?? '').trim() || undefined,
    tagline: String(o['tagline'] ?? '').trim() || undefined,
    includedFeatures: included,
    excludedFeatures: excluded,
    footerNote: String(o['footerNote'] ?? o['footer_note'] ?? '').trim() || undefined,
    expiryHint: String(o['expiryHint'] ?? o['expiry_hint'] ?? '').trim() || undefined,
    visible,
    section,
    order,
    highlight,
    badge: String(o['badge'] ?? '').trim() || undefined,
    tier: coerceTier(o['tier']),
    max_allowed_ads: coerceMaxAllowedAds(
      o['max_allowed_ads'] ?? o['maxAllowedAds']
    ),
  };
}

export function normalizeSubscriptionsConfig(
  data: Record<string, unknown> | undefined
): SubscriptionsConfig {
  const d = data ?? {};
  const plansRaw = Array.isArray(d['plans']) ? d['plans'] : [];
  const plans = plansRaw
    .map((p) => coerceSubscriptionPlan(p))
    .filter((p): p is SubscriptionPlan => p !== null);

  const emptyMsg = String(d['empty_message'] ?? d['emptyMessage'] ?? '').trim();

  const waRaw =
    d['subscription_orders_whatsapp'] ??
    d['subscriptionOrdersWhatsapp'] ??
    d['support_whatsapp'] ??
    '';
  const whatsapp = String(waRaw ?? '').trim();

  const def = DEFAULT_SUBSCRIPTIONS_CONFIG;

  return {
    active: Boolean(d['active']),
    show_empty_message:
      d['show_empty_message'] === undefined &&
      d['showEmptyMessage'] === undefined
        ? true
        : Boolean(d['show_empty_message'] ?? d['showEmptyMessage']),
    empty_message: emptyMsg || undefined,
    plans,
    addons_html: typeof d['addons_html'] === 'string' ? d['addons_html'] : '',
    subscription_orders_whatsapp: whatsapp || undefined,
    vip_pin_price_level_1:
      coerceMoney(d['vip_pin_price_level_1']) || def.vip_pin_price_level_1,
    vip_pin_price_level_2:
      coerceMoney(d['vip_pin_price_level_2']) || def.vip_pin_price_level_2,
    vip_pin_price_level_3:
      coerceMoney(d['vip_pin_price_level_3']) || def.vip_pin_price_level_3,
    vip_pin_price_level_4:
      coerceMoney(d['vip_pin_price_level_4']) || def.vip_pin_price_level_4,
    vip_pin_price_level_5:
      coerceMoney(d['vip_pin_price_level_5']) || def.vip_pin_price_level_5,
    banner_display_price:
      coerceMoney(d['banner_display_price']) || def.banner_display_price,
    banner_design_price:
      coerceMoney(d['banner_design_price']) || def.banner_design_price,
  };
}

export function sortPlansForDisplay(plans: SubscriptionPlan[]): SubscriptionPlan[] {
  return [...plans].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function newEmptyPlan(): SubscriptionPlan {
  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: '',
    priceLabel: '',
    price: 0,
    subtitle: '',
    tagline: '',
    includedFeatures: [],
    excludedFeatures: [],
    footerNote: '',
    expiryHint: '',
    visible: true,
    section: 'main',
    order: 100,
    highlight: false,
    badge: '',
    tier: 'slate',
    max_allowed_ads: undefined,
  };
}

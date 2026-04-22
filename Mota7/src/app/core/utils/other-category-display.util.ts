import { OTHER_SERVICES_DATA } from '../constants/other-services-data';

/**
 * فاصل معرّفات الفروع الفرعية تحت تصنيف رئيسي في «خدمات أخرى».
 * يجب ألا يظهر هذا النص داخل `id` التصنيف الرئيسي في Firestore.
 */
export const OTHER_SERVICE_SUB_ID_MARKER = '__m7osub__';

export interface OtherCategoryItem {
  id: string;
  nameAr: string;
  nameEn?: string;
  icon?: string;
  /** ترتيب العرض من Firestore / mota7-admin (يُحافَظ عليه لبنود الفرع) */
  order?: number;
  /** تصنيفات فرعية (نص عربي لكل سطر) كما في مستند Categories/other_services */
  subcategories?: string[];
}

function base64UrlEncodeUtf8(s: string): string {
  try {
    const utf8 = encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_m, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    const b64 = btoa(utf8);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function base64UrlDecodeUtf8(b64url: string): string {
  try {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const utf8 = atob(b64);
    return decodeURIComponent(
      Array.from(utf8)
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return '';
  }
}

/** معرّف مستقر لفرع فرعي تحت تصنيف رئيسي (يُحفظ في ads.category_id). */
export function encodeOtherServiceSubItemId(parentId: string, subNameAr: string): string {
  const p = String(parentId ?? '').trim();
  const s = String(subNameAr ?? '').trim();
  if (!p || !s) return p;
  if (p.includes(OTHER_SERVICE_SUB_ID_MARKER)) return p;
  const enc = base64UrlEncodeUtf8(s);
  if (!enc) return p;
  return `${p}${OTHER_SERVICE_SUB_ID_MARKER}${enc}`;
}

export function parseOtherServiceCompositeItemId(itemId: string): { parentId: string; subNameAr: string } | null {
  const id = String(itemId ?? '').trim();
  const idx = id.indexOf(OTHER_SERVICE_SUB_ID_MARKER);
  if (idx <= 0) return null;
  const parentId = id.slice(0, idx).trim();
  const enc = id.slice(idx + OTHER_SERVICE_SUB_ID_MARKER.length);
  const subNameAr = base64UrlDecodeUtf8(enc).trim();
  if (!parentId || !subNameAr) return null;
  return { parentId, subNameAr };
}

/**
 * يحوّل بنود Firestore (رئيسية + subcategories) إلى قائمة مسطّحة للعرض والاختيار،
 * بنفس منطق تجربة المستخدم في التطبيق (كل فرع فرعي له category_id خاص).
 */
export function expandOtherCategoryItemsForBundle(items: ReadonlyArray<OtherCategoryItem>): OtherCategoryItem[] {
  const out: OtherCategoryItem[] = [];
  for (const item of items) {
    const subs = Array.isArray(item.subcategories)
      ? item.subcategories.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    out.push({ ...item });
    for (const sub of subs) {
      out.push({
        id: encodeOtherServiceSubItemId(item.id, sub),
        nameAr: sub,
        nameEn: item.nameEn,
        icon: item.icon,
        order: item.order,
      });
    }
  }
  return out;
}

const STATIC_OTHER_ITEMS: OtherCategoryItem[] = OTHER_SERVICES_DATA.items as OtherCategoryItem[];
const STATIC_PARENT_ICON = OTHER_SERVICES_DATA.icon || 'construct';

/**
 * يستخرج الجزء قبل آخر "_" من مفاتيح مثل other_match_key و delivery_match_key و store_match_key
 * بصيغة `${nameAr}_${city}`. يعيد سلسلة فارغة إذا تعذّر ذلك.
 *
 * نستخدم آخر "_" تجنّباً لقطع الأسماء التي قد تحتوي على "_" داخلها.
 */
export function extractNameBeforeLastUnderscoreFromMatchKey(key: unknown): string {
  if (typeof key !== 'string' || !key) return '';
  const idx = key.lastIndexOf('_');
  const candidate = idx > 0 ? key.slice(0, idx) : key;
  return candidate.trim();
}

/**
 * education_match_key بصيغة `${stageAr}+${subject}+${city}` — يُستخرج اسم المرحلة (الجزء قبل أول "+").
 */
export function extractEducationStageArFromPlusMatchKey(key: unknown): string {
  if (typeof key !== 'string' || !key) return '';
  const idx = key.indexOf('+');
  const stage = idx >= 0 ? key.slice(0, idx) : key;
  return stage.trim();
}

/**
 * استرجاع اسم الفرع لإعلان "خدمات أخرى" بترتيب أولوية يضمن
 * عرض الاسم الصحيح حتى لو أُضيف الفرع حديثاً في Firestore دون نشر تحديث للتطبيق:
 *
 * 1) القائمة الديناميكية القادمة من Firestore (Categories/other_services)
 * 2) قائمة الثوابت كاحتياط أول
 * 3) الاسم المحفوظ داخل الإعلان نفسه:
 *    - details.service_name إن وُجد
 *    - مستخرَج من other_match_key (`${nameAr}_${city}`) المحفوظ وقت النشر
 * 4) النص الاحتياطي العام "خدمة أخرى"
 */
export function resolveOtherCategoryNameAr(
  ad: any,
  dynamicItems?: ReadonlyArray<OtherCategoryItem> | null
): string {
  const id = String(ad?.category_id ?? '').trim();

  if (id) {
    const dyn = (dynamicItems ?? []).find((c) => c?.id === id);
    if (dyn?.nameAr) return dyn.nameAr;

    const stat = STATIC_OTHER_ITEMS.find((c) => c.id === id);
    if (stat?.nameAr) return stat.nameAr;

    const parsed = parseOtherServiceCompositeItemId(id);
    if (parsed?.subNameAr) return parsed.subNameAr;
  }

  const stored = String(ad?.details?.service_name ?? '').trim();
  if (stored) return stored;

  const fromKey = extractNameBeforeLastUnderscoreFromMatchKey(ad?.other_match_key);
  if (fromKey) return fromKey;

  return 'خدمة أخرى';
}

/**
 * استرجاع أيقونة الفرع. تعتمد على القائمة الديناميكية ثم الثابتة،
 * وإلا أيقونة القسم الأم (construct افتراضياً).
 */
export function resolveOtherCategoryIcon(
  ad: any,
  dynamicItems?: ReadonlyArray<OtherCategoryItem> | null,
  fallback: string = STATIC_PARENT_ICON
): string {
  const id = String(ad?.category_id ?? '').trim();
  if (!id) return fallback;

  const dyn = (dynamicItems ?? []).find((c) => c?.id === id) as any;
  if (dyn?.icon) return dyn.icon;

  const stat = STATIC_OTHER_ITEMS.find((c) => c.id === id) as any;
  if (stat?.icon) return stat.icon;

  const parsed = parseOtherServiceCompositeItemId(id);
  if (parsed) {
    const parentDyn = (dynamicItems ?? []).find((c) => c?.id === parsed.parentId) as any;
    if (parentDyn?.icon) return parentDyn.icon;
    const parentStat = STATIC_OTHER_ITEMS.find((c) => c.id === parsed.parentId) as any;
    if (parentStat?.icon) return parentStat.icon;
  }

  return fallback;
}

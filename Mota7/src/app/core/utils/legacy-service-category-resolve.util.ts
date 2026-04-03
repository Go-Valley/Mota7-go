import { DELIVERY_CATEGORY } from '../constants/delivery-data';
import { OTHER_SERVICES_DATA } from '../constants/other-services-data';

export const DELIVERY_IDS = new Set(DELIVERY_CATEGORY.items.map((i) => i.id));
export const OTHER_IDS = new Set(OTHER_SERVICES_DATA.items.map((i) => i.id));

/**
 * عندما يكون serviceType = craft-services ولا يوجد فرع صالح — لا نستخدم metalworks (حدادة)
 * حتى لا تُصنَّف الجميع خطأً تحت حدادة.
 */
export const LEGACY_FALLBACK_OTHER_CATEGORY_ID = 'contracting-supplies';

/** أخطاء شائعة في بيانات القديم حيث كان id الفرعي نصاً عربياً */
export const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  'ميكانيكي موتوسيكلات': 'motorcycle-mechanic',
  حداده: 'metalworks',
  حدادة: 'metalworks',
  كهربائي: 'electrician',
  سباك: 'plumbing',
  سباكة: 'plumbing',
  نقاش: 'painting',
  نقاشة: 'painting',
  نجار: 'carpentry',
  نجارة: 'carpentry',
};

export function normalizeArCategoryKey(input: string): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ٱﻵ]/g, 'ا')
    .replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
}

/** مطابقة اسم الخدمة العربي/الإنجليزي (من الواجهة القديمة) → id في Mota7 */
export const LEGACY_AR_NAME_TO_OTHER_ID: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const it of OTHER_SERVICES_DATA.items) {
    m[normalizeArCategoryKey(it.nameAr)] = it.id;
    m[normalizeArCategoryKey(it.nameEn)] = it.id;
  }
  return m;
})();

/**
 * يستنتج category_id للقديم: أحياناً الفرع في serviceCategory، وأحياناً فقط في serviceType،
 * وأحياناً نص عربي يحتاج مطابقة بالاسم.
 */
export function resolveLegacyServiceCategoryId(serviceType: string, rawCategory: string): string | null {
  const st = String(serviceType ?? '').trim();
  const rawCat = String(rawCategory ?? '').trim();
  const cat = LEGACY_CATEGORY_ALIASES[rawCat] ?? rawCat;
  const typeResolved = LEGACY_CATEGORY_ALIASES[st] ?? st;

  if (DELIVERY_IDS.has(typeResolved)) {
    return typeResolved;
  }
  if (DELIVERY_IDS.has(cat)) {
    return cat;
  }

  if (st === 'transportation-delivery') {
    if (DELIVERY_IDS.has(cat)) {
      return cat;
    }
    if (DELIVERY_IDS.has(typeResolved)) {
      return typeResolved;
    }
    return null;
  }

  const craftLikeParent =
    st === 'craft-services' || st === 'services' || st === 'other_services' || st === 'service';

  if (OTHER_IDS.has(cat) && !DELIVERY_IDS.has(cat)) {
    return cat;
  }
  if (OTHER_IDS.has(typeResolved) && !DELIVERY_IDS.has(typeResolved)) {
    return typeResolved;
  }

  const fromArCat = LEGACY_AR_NAME_TO_OTHER_ID[normalizeArCategoryKey(rawCat)];
  if (fromArCat) {
    return fromArCat;
  }
  const fromArSt = LEGACY_AR_NAME_TO_OTHER_ID[normalizeArCategoryKey(st)];
  if (fromArSt) {
    return fromArSt;
  }

  if (craftLikeParent) {
    return LEGACY_FALLBACK_OTHER_CATEGORY_ID;
  }

  return null;
}

export function deliveryCategoryNameAr(categoryId: string): string {
  const it = DELIVERY_CATEGORY.items.find((x) => x.id === categoryId);
  return it?.nameAr ?? categoryId;
}

export function otherCategoryNameAr(categoryId: string): string {
  const it = OTHER_SERVICES_DATA.items.find((x) => x.id === categoryId);
  return it?.nameAr ?? categoryId;
}

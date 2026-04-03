import {
  DELIVERY_IDS,
  LEGACY_FALLBACK_OTHER_CATEGORY_ID,
  OTHER_IDS,
  deliveryCategoryNameAr,
  otherCategoryNameAr,
  resolveLegacyServiceCategoryId,
} from './legacy-service-category-resolve.util';

/** بادئة مستندات الإعلانات المُنقولة من مشروع الخدمات القديم */
export const LEGACY_MIGRATED_AD_ID_PREFIX = 'mig_legacy_';

export function isLegacyMigratedAdDocId(docId: string): boolean {
  return String(docId ?? '').startsWith(LEGACY_MIGRATED_AD_ID_PREFIX);
}

export function isLegacyMigratedAdData(ad: Record<string, unknown>): boolean {
  const aid = String(ad['ad_id'] ?? '');
  return aid.startsWith(LEGACY_MIGRATED_AD_ID_PREFIX);
}

/**
 * يقرأ من `legacy_source` (يُملأ عند الاستيراد) أو من حقول اختيارية قديمة على المستند.
 */
export function extractLegacyServiceHintsFromAd(ad: Record<string, unknown>): {
  serviceType: string;
  serviceCategory: string;
} {
  const src = (ad['legacy_source'] as Record<string, unknown> | undefined) ?? {};
  const st = String(src['serviceType'] ?? ad['legacy_service_type'] ?? '').trim();
  const cat = String(src['serviceCategory'] ?? ad['legacy_service_category'] ?? '').trim();
  return { serviceType: st, serviceCategory: cat };
}

export type LegacyMigratedAdReclassifyPlan =
  | { status: 'skip_not_migrated' }
  | { status: 'skip_unresolved' }
  | { status: 'unchanged' }
  | {
      status: 'update';
      category_id: string;
      ad_type: 'delivery' | 'other';
      matchKeyValue: string;
    };

/**
 * نفس منطق الاستيراد: category_id + ad_type + مفتاح المطابقة المناسب.
 * بدون `legacy_source` / حقول legacy غالباً لا يُستنتج التصنيف (skip_unresolved).
 */
export function planLegacyMigratedAdReclassify(ad: Record<string, unknown>): LegacyMigratedAdReclassifyPlan {
  if (!isLegacyMigratedAdData(ad)) {
    return { status: 'skip_not_migrated' };
  }

  const hints = extractLegacyServiceHintsFromAd(ad);
  let categoryId = resolveLegacyServiceCategoryId(hints.serviceType, hints.serviceCategory);
  if (
    !categoryId &&
    !hints.serviceType &&
    !hints.serviceCategory &&
    String(ad['ad_type'] ?? '') === 'other' &&
    String(ad['category_id'] ?? '') === 'metalworks'
  ) {
    /** دفعة قديمة وُضعت افتراضياً تحت حدادة دون حفظ المصدر */
    categoryId = LEGACY_FALLBACK_OTHER_CATEGORY_ID;
  }
  if (!categoryId) {
    return { status: 'skip_unresolved' };
  }

  const isDelivery = DELIVERY_IDS.has(categoryId);
  if (!isDelivery && !OTHER_IDS.has(categoryId)) {
    return { status: 'skip_unresolved' };
  }

  const city = String(ad['city'] ?? '').trim();
  const adType: 'delivery' | 'other' = isDelivery ? 'delivery' : 'other';
  const matchKeyValue = isDelivery
    ? `${deliveryCategoryNameAr(categoryId)}_${city}`
    : `${otherCategoryNameAr(categoryId)}_${city}`;

  const currentCat = String(ad['category_id'] ?? '');
  const currentType = String(ad['ad_type'] ?? '');
  const currentOther = String(ad['other_match_key'] ?? '');
  const currentDelivery = String(ad['delivery_match_key'] ?? '');

  const matches =
    currentCat === categoryId &&
    currentType === adType &&
    (isDelivery ? currentDelivery === matchKeyValue : currentOther === matchKeyValue);

  if (matches) {
    return { status: 'unchanged' };
  }

  return {
    status: 'update',
    category_id: categoryId,
    ad_type: adType,
    matchKeyValue,
  };
}

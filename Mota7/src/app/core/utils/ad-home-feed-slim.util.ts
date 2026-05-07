/**
 * تقليص حقول إعلان الرئيسية بعد الجلب لتخفيف الذاكرة وتقليل بيانات الواجهة.
 * ملاحظة: قراءة Firestore تبقى لكل المستند؛ التقليص هنا للذاكرة والصور المعروضة.
 */

const PRODUCT_DETAIL_KEYS = [
  'title',
  'short_desc',
  'price',
  'location',
  'condition',
  'whatsapp_phone',
] as const;

function slimProductDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!details || typeof details !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const k of PRODUCT_DETAIL_KEYS) {
    if (details[k] !== undefined) out[k] = details[k];
  }
  const imgs = details['images'];
  if (Array.isArray(imgs) && imgs.length > 0) {
    out['images'] = [imgs[0]];
  } else {
    out['images'] = [];
  }
  return out;
}

function slimGenericDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!details || typeof details !== 'object') return details || {};
  const d = { ...details };
  const imgs = d['images'];
  if (Array.isArray(imgs) && imgs.length > 1) {
    d['images'] = [imgs[0]];
  }
  return d;
}

/**
 * @param adType قيمة ad_type في Firestore: delivery | education | other | product | store
 */
export function slimAdForHomeFeed(ad: any, adType: string): any {
  if (!ad || typeof ad !== 'object') return ad;

  if (adType === 'product') {
    return {
      id: ad.id,
      ad_id: ad.ad_id,
      ad_type: ad.ad_type,
      status: ad.status,
      city: ad.city,
      owner_phone: ad.owner_phone,
      owner_name: ad.owner_name,
      verification_level: ad.verification_level,
      is_verified: ad.is_verified,
      verification_valid_from: ad.verification_valid_from,
      verification_valid_until: ad.verification_valid_until,
      sort_order: ad.sort_order,
      category_id: ad.category_id,
      sub_category_name: ad.sub_category_name,
      storeId: ad.storeId,
      storeName: ad.storeName,
      isStoreProduct: ad.isStoreProduct,
      impression_count: ad.impression_count,
      stats: ad.stats && typeof ad.stats === 'object' ? { views: ad.stats.views } : undefined,
      /** لوحة الأدمن: تعطيل زر العربة على الكارت */
      cart_enabled: ad.cart_enabled,
      details: slimProductDetails(ad.details),
      _feedSlim: true,
    };
  }

  if (adType === 'store') {
    return {
      id: ad.id,
      ad_id: ad.ad_id,
      ad_type: ad.ad_type,
      status: ad.status,
      city: ad.city,
      /** مطلوب لأعداد تبويبات «المتاجر» وتصفية القائمة حسب التصنيف */
      category_id: ad.category_id,
      store_name: ad.store_name,
      logo: ad.logo,
      owner_phone: ad.owner_phone,
      whatsapp_phone: ad.whatsapp_phone,
      owner_name: ad.owner_name,
      verification_level: ad.verification_level,
      is_verified: ad.is_verified,
      verification_valid_from: ad.verification_valid_from,
      verification_valid_until: ad.verification_valid_until,
      sort_order: ad.sort_order,
      impression_count: ad.impression_count,
      stats: ad.stats && typeof ad.stats === 'object' ? { views: ad.stats.views } : undefined,
      _feedSlim: true,
    };
  }

  const clone = { ...ad };
  if (clone.details && typeof clone.details === 'object') {
    clone.details = slimGenericDetails(clone.details as Record<string, unknown>);
  }
  /* يظهر متوسط التقييم في الرئيسية من حقول الإعلان — لا تُحذف عند التقليص */
  if (adType === 'delivery' || adType === 'education' || adType === 'other') {
    clone.provider_service_rating_count = ad.provider_service_rating_count;
    clone.provider_service_rating_sum = ad.provider_service_rating_sum;
    clone.last_provider_rating = ad.last_provider_rating;
  }
  return clone;
}

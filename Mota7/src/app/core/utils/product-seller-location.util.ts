/** عرض الموقع على كارت منتج العربة؛ يُحمّل هذا النص عند استعادة أو عرض حقول مستند الطلب بدون عنوان بائع */
export const PRODUCT_HOME_CARD_FALLBACK_LOCATION_AR = 'الخارجة';

/** نص الواجهة عند غياب الموقع ومدينة الإعلان (مثل عرض `{ ad.city || 'غير محدد' }` في خدمات التوصيل) */
export const PRODUCT_SELLER_CITY_UNKNOWN_LABEL_AR = 'غير محدد';

/**
 * عنوان المدينة للمنتج: `details.location` إن وُجد، ثم `city` على مستند الإعلان (Firestore)،
 * لتفادي عرض «الخارجة» الافتراضية عندما المدينة الحقيقية في `city` وليس في التفاصيل.
 */
export function sellerCityLabelForProductAd(ad: unknown): string {
  if (!ad || typeof ad !== 'object' || Array.isArray(ad)) {
    return PRODUCT_SELLER_CITY_UNKNOWN_LABEL_AR;
  }
  const a = ad as Record<string, unknown>;
  const det = a['details'];
  if (det && typeof det === 'object' && !Array.isArray(det)) {
    const raw = (det as Record<string, unknown>)['location'];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  const cy = a['city'];
  if (typeof cy === 'string' && cy.trim()) {
    return cy.trim();
  }
  return PRODUCT_SELLER_CITY_UNKNOWN_LABEL_AR;
}

/** عند وجود جزء التفاصيل فقط؛ نفس الأولويات دون حقول مستوى المستند */
export function sellerLocationFromProductDetails(details: unknown): string {
  return sellerCityLabelForProductAd({ details });
}

/** تطبيع أي نص عُرض سابقًا كشرطة فارغة ليظهر مثل الشاشة الرئيسية */
export function normalizeSellerCityLikeProductFeedCard(locationText: unknown): string {
  if (typeof locationText !== 'string') {
    return PRODUCT_HOME_CARD_FALLBACK_LOCATION_AR;
  }
  const s = locationText.replace(/\u00A0/g, ' ').trim();
  if (!s || s === '—' || s === '-') {
    return PRODUCT_HOME_CARD_FALLBACK_LOCATION_AR;
  }
  return s;
}

/** صف واحد ضمن حقول مستند الطلب على Firestore (items[]) — وليس مدينة المشتري */
export function sellerCityLabelFromFirestoreOrderItemRow(item: Record<string, unknown>): string {
  const take = (v: unknown): string | null => {
    if (typeof v !== 'string') {
      return null;
    }
    const s = v.replace(/\u00A0/g, ' ').trim();
    if (!s || s === '—' || s === '-') {
      return null;
    }
    return s;
  };

  let found: string | null = null;
  const topKeys = [
    'locationLabel',
    'location',
    'city',
    'adCity',
    'product_city',
    'productCity',
  ] as const;
  for (const k of topKeys) {
    const t = take(item[k]);
    if (t) {
      found = t;
      break;
    }
  }

  if (!found) {
    const det = item['details'];
    if (det && typeof det === 'object' && !Array.isArray(det)) {
      const d = det as Record<string, unknown>;
      for (const k of ['location', 'city', 'address'] as const) {
        const t = take(d[k]);
        if (t) {
          found = t;
          break;
        }
      }
    }
  }

  return normalizeSellerCityLikeProductFeedCard(found ?? '');
}

import {
  inferDeliveryServiceFromMatchKey,
  inferEduSubjectFromMatchKey,
} from './service-order-coverage-match.util';

/** يزيل لاحقة التغطية الداخلية (__SCOPE__ / _SCOPE_ / +SCOPE__) من عنوان الإعلان للعرض والرسائل. */
const INTERNAL_SCOPE_SUFFIX_RE = /(?:__SCOPE__|_SCOPE_|\+SCOPE__).*$/i;

/**
 * عنوان إعلان مناسب للمستخدم (واتساب، توثيق VIP، إلخ) دون مفاتيح التغطية الداخلية.
 */
export function adTitleForUserDisplay(
  raw: string,
  adType?: string
): string {
  let title = String(raw ?? '').trim();
  if (!title) {
    return title;
  }

  if (INTERNAL_SCOPE_SUFFIX_RE.test(title)) {
    title = title.replace(INTERNAL_SCOPE_SUFFIX_RE, '').trim();
  }

  const kind = String(adType ?? '').trim();

  if (kind === 'education') {
    const edu = inferEduSubjectFromMatchKey(title);
    if (edu) {
      return edu.replace(/\+/g, ' ').trim();
    }
    return title;
  }

  if (kind === 'delivery' || kind === 'other' || kind === '') {
    const service = inferDeliveryServiceFromMatchKey(title);
    if (service) {
      return service;
    }
  }

  return title;
}

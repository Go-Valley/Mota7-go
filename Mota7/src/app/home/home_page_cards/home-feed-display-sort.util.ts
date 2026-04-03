/**
 * ترتيب إعلانات الرئيسية لكل الأقسام (نقل، تعليم، خدمات أخرى، منتجات، متاجر):
 * - أولاً: الإعلانات المتاحة الآن (كلها قبل غير المتاحة).
 * - أخيراً: غير المتاحة (الكارت الباهت) — لا تُدرَج بين المتاحة.
 *
 * داخل كل مجموعة (متاح / غير متاح):
 * 1) ترتيب يدوي ثابت (sort_order < 999)
 * 2) ذهبي — خلط محدد بالساعة
 * 3) أزرق — خلط محدد بالساعة
 * 4) غير موثّق — خلط محدد بالساعة
 */

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 0) / 4294967296;
  };
}

/** بذرة الساعة المحلية (تتغير كل ساعة). */
export function getLocalHourlySeed(): number {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  return y * 1_000_000 + m * 10_000 + day * 100 + h;
}

function isManualSortOrder(a: any): boolean {
  const n = Number(a?.sort_order);
  return Number.isFinite(n) && n < 999;
}

function resolveVerificationTier(a: any): 'gold' | 'blue' | 'none' {
  const vl = a?.verification_level;
  const iv = a?.is_verified;
  if (vl === 'gold' || iv === 'gold') return 'gold';
  if (vl === 'blue' || iv === 'blue') return 'blue';
  return 'none';
}

function compareIds(a: any, b: any): number {
  return String(a?.id ?? a?.ad_id ?? '').localeCompare(String(b?.id ?? b?.ad_id ?? ''), 'ar');
}

/**
 * متاح للعرض النشيط — يطابق الكروت: توصيل من details.is_available، تعليم/أخرى من is_available.
 * منتجات ومتاجر: تُعامل كمتاحة (لا باهت بنفس المعنى).
 */
export function isAdCurrentlyAvailableForHomeFeed(ad: any): boolean {
  const type = ad?.ad_type;
  if (type === 'delivery') {
    const d = ad?.details;
    if (d && typeof d === 'object' && 'is_available' in d) {
      return d.is_available !== false;
    }
    return true;
  }
  if (type === 'education' || type === 'other') {
    return ad?.is_available !== false;
  }
  return true;
}

/** درجة خلط ثابتة للساعة الحالية داخل طبقة واحدة (ذهبي / أزرق / لا شيء). */
function hourlyShuffleScore(ad: any, hourlySeed: number, tierSalt: number): number {
  const id = String(ad?.id ?? ad?.ad_id ?? '');
  let h = (hourlySeed ^ (tierSalt * 0x9e3779b9)) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  const rng = makeRng(h >>> 0);
  return rng();
}

function sortTierByHourlyShuffle(ads: any[], hourlySeed: number, tierSalt: number): any[] {
  return [...ads].sort((a, b) => {
    const ka = hourlyShuffleScore(a, hourlySeed, tierSalt);
    const kb = hourlyShuffleScore(b, hourlySeed, tierSalt);
    if (ka !== kb) return ka - kb;
    return compareIds(a, b);
  });
}

/** ترتيب أولوية داخل مجموعة واحدة (متاح أو غير متاح). */
function sortByPriorityTiers(ads: any[], seed: number): any[] {
  if (!ads.length) return [];

  const manual = ads.filter((a) => isManualSortOrder(a)).sort((a, b) => {
    const sa = Number(a.sort_order);
    const sb = Number(b.sort_order);
    if (sa !== sb) return sa - sb;
    return compareIds(a, b);
  });

  const rest = ads.filter((a) => !isManualSortOrder(a));
  const gold = rest.filter((a) => resolveVerificationTier(a) === 'gold');
  const blue = rest.filter((a) => resolveVerificationTier(a) === 'blue');
  const none = rest.filter((a) => resolveVerificationTier(a) === 'none');

  return [
    ...manual,
    ...sortTierByHourlyShuffle(gold, seed, 11),
    ...sortTierByHourlyShuffle(blue, seed, 23),
    ...sortTierByHourlyShuffle(none, seed, 37),
  ];
}

/**
 * @param ads قائمة إعلانات بعد التصفية (نفس القسم/المدينة…)
 * @param hourlySeed اختياري لاختبار الوحدة؛ الافتراضي من الساعة المحلية
 */
export function sortHomeFeedAdsForDisplay(ads: any[], hourlySeed?: number): any[] {
  if (!ads?.length) return [];
  const seed = hourlySeed ?? getLocalHourlySeed();

  const available = ads.filter((a) => isAdCurrentlyAvailableForHomeFeed(a));
  const unavailable = ads.filter((a) => !isAdCurrentlyAvailableForHomeFeed(a));

  return [...sortByPriorityTiers(available, seed), ...sortByPriorityTiers(unavailable, seed)];
}

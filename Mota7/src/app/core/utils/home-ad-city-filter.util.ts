/** فلترة إعلانات الرئيسية حسب قائمة دوكيومنت المدن أو أسماء عربية (للإعلانات القديمة). */
export function normalizedHaystackPieces(ad: {
  city?: unknown;
  details?: Record<string, unknown>;
}): string[] {
  const chunks: string[] = [];
  if (typeof ad?.city === 'string' && ad.city.trim()) chunks.push(ad.city.trim());
  const loc = ad?.details && (ad.details as Record<string, unknown>)['location'];
  if (typeof loc === 'string' && loc.trim()) chunks.push(loc.trim());
  return chunks;
}

export function normalizeForMatchArabic(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * إن وُجدت مصفوفة دوكّية على الإعلان تُعتبر المصدر الموثوق.
 * بدون مصفوفة: المطابقة النصّية العربية لمسميات المُختار.
 */
export function adMatchesHomeGeoFilter(opts: {
  ad: Record<string, unknown>;
  isAll: boolean;
  flatCityIds: Set<string>;
  arabicTokens: Set<string>;
}): boolean {
  if (opts.isAll) return true;
  const cov = Array.isArray(opts.ad['coverage_city_ids'])
    ? (opts.ad['coverage_city_ids'] as unknown[]).map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  if (cov.length > 0) {
    if (!opts.flatCityIds.size) {
      /** ليس له IDs في الفلتر — احتياط لا يحدث عملياً */
      return true;
    }
    return cov.some((id) => opts.flatCityIds.has(id));
  }

  const hay = normalizedHaystackPieces(opts.ad as { city?: unknown; details?: Record<string, unknown> })
    .map(normalizeForMatchArabic)
    .join(' ')
    .trim();
  if (!hay) return opts.flatCityIds.size === 0 && opts.arabicTokens.size === 0;

  for (const t of opts.arabicTokens) {
    const nt = normalizeForMatchArabic(t);
    if (!nt) continue;
    if (hay.includes(nt) || nt.includes(hay)) return true;
  }
  return false;
}

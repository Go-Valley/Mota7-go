/** فلترة إعلانات الرئيسية حسب قائمة دوكيومنت المدن أو أسماء عربية (للإعلانات القديمة). */
import {
  adCityDisplayIsWholeGovernorate,
  adCoversWholeGovernorate,
  adCoverageCityIds,
  adCoverageGovernorateWholeIds,
  expandFilterCityIdsFromArabicTokens,
  filterCoversWholeGovernorate,
  normalizeForMatchArabic,
  type HomeGeoCoverageIndex,
} from './home-geo-coverage-index.util';

export { normalizeForMatchArabic };

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

function arabicHaystackMatch(hayNorm: string, tokens: Set<string>): boolean {
  if (!hayNorm) return false;
  for (const t of tokens) {
    const nt = normalizeForMatchArabic(t);
    if (!nt) continue;
    if (hayNorm.includes(nt) || nt.includes(hayNorm)) return true;
  }
  return false;
}

/**
 * مطابقة جغرافية للإعلان مع فلتر الرئيسية:
 * - مدينة / عدة مدن / محافظة كاملة في الفلتر
 * - إعلان بمدينة / عدة مدن / محافظة كاملة في التغطية
 * - إعلان محافظة كاملة يظهر عند فلترة أي مدينة منها، والعكس
 */
export function adMatchesHomeGeoFilter(opts: {
  ad: Record<string, unknown>;
  isAll: boolean;
  flatCityIds: Set<string>;
  arabicTokens: Set<string>;
  geoIndex?: HomeGeoCoverageIndex | null;
}): boolean {
  if (opts.isAll) return true;

  const index = opts.geoIndex ?? null;
  const adCov = adCoverageCityIds(opts.ad);
  const adWholeGovIds = adCoverageGovernorateWholeIds(opts.ad);

  const filterIds = expandFilterCityIdsFromArabicTokens(
    opts.flatCityIds,
    opts.arabicTokens,
    index
  );

  if (index && filterIds.size) {
    for (const fid of filterIds) {
      const govId = index.cityToGov.get(fid);
      if (!govId) continue;
      if (adWholeGovIds.includes(govId)) return true;
    }
  }

  if (adCov.length && filterIds.size) {
    if (adCov.some((id) => filterIds.has(id))) return true;

    if (index) {
      for (const fid of filterIds) {
        const govId = index.cityToGov.get(fid);
        if (!govId) continue;
        if (adCoversWholeGovernorate(adCov, govId, index)) return true;
        if (adCityDisplayIsWholeGovernorate(opts.ad, govId, index)) return true;
      }

      for (const gov of index.govById.values()) {
        if (!filterCoversWholeGovernorate(filterIds, gov.id, index)) continue;
        if (adCoversWholeGovernorate(adCov, gov.id, index)) return true;
        if (adCityDisplayIsWholeGovernorate(opts.ad, gov.id, index)) return true;
        if (adCov.some((id) => index.cityToGov.get(id) === gov.id)) return true;
      }
    }
  }

  if (index && filterIds.size && !adCov.length) {
    for (const fid of filterIds) {
      const govId = index.cityToGov.get(fid);
      if (!govId) continue;
      if (adCityDisplayIsWholeGovernorate(opts.ad, govId, index)) return true;
    }
  }

  const hay = normalizedHaystackPieces(opts.ad as { city?: unknown; details?: Record<string, unknown> })
    .map(normalizeForMatchArabic)
    .join(' ')
    .trim();

  if (!hay) return filterIds.size === 0 && opts.arabicTokens.size === 0;

  if (arabicHaystackMatch(hay, opts.arabicTokens)) return true;

  if (index) {
    for (const raw of opts.arabicTokens) {
      const nt = normalizeForMatchArabic(raw);
      if (!nt) continue;
      for (const gov of index.govById.values()) {
        if (!gov.shortNorm) continue;
        if (nt !== gov.shortNorm && !nt.includes(gov.shortNorm) && !gov.shortNorm.includes(nt)) {
          continue;
        }
        if (adCityDisplayIsWholeGovernorate(opts.ad, gov.id, index)) return true;
        if (adCoversWholeGovernorate(adCov, gov.id, index)) return true;
        if (adWholeGovIds.includes(gov.id)) return true;
      }
    }
  }

  return false;
}

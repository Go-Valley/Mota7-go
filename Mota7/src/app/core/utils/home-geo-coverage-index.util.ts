import { governorateDisplayShort } from './governorate-display-name.util';

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

export interface HomeGeoCoverageIndexGov {
  id: string;
  cityIds: string[];
  shortNorm: string;
}

/** فهرس محافظات/مدن Firebase لربط فلتر الرئيسية بتغطية الإعلانات */
export interface HomeGeoCoverageIndex {
  cityToGov: Map<string, string>;
  govById: Map<string, HomeGeoCoverageIndexGov>;
  /** اسم مدينة مُطبَّع → معرّفات المدن (قد يتكرر الاسم بين محافظات) */
  cityNameToIds: Map<string, string[]>;
}

export function buildHomeGeoCoverageIndex(
  governorates: { id: string; name?: string; cities?: { id: string; name?: string }[] }[]
): HomeGeoCoverageIndex {
  const cityToGov = new Map<string, string>();
  const govById = new Map<string, HomeGeoCoverageIndexGov>();
  const cityNameToIds = new Map<string, string[]>();

  for (const g of governorates || []) {
    const govId = String(g?.id ?? '').trim();
    if (!govId) continue;
    const cities = g.cities ?? [];
    const cityIds = cities
      .map((c) => String(c?.id ?? '').trim())
      .filter(Boolean);
    const shortNorm = normalizeForMatchArabic(governorateDisplayShort(g.name ?? ''));
    govById.set(govId, { id: govId, cityIds, shortNorm });

    for (const c of cities) {
      const cid = String(c?.id ?? '').trim();
      if (!cid) continue;
      cityToGov.set(cid, govId);
      const cn = normalizeForMatchArabic(c.name ?? '');
      if (!cn) continue;
      const prev = cityNameToIds.get(cn) ?? [];
      if (!prev.includes(cid)) prev.push(cid);
      cityNameToIds.set(cn, prev);
    }
  }

  return { cityToGov, govById, cityNameToIds };
}

export function adCoverageCityIds(ad: Record<string, unknown>): string[] {
  if (!Array.isArray(ad['coverage_city_ids'])) return [];
  return (ad['coverage_city_ids'] as unknown[])
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);
}

export function adCoverageGovernorateWholeIds(ad: Record<string, unknown>): string[] {
  if (!Array.isArray(ad['coverage_governorate_whole_ids'])) return [];
  return (ad['coverage_governorate_whole_ids'] as unknown[])
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);
}

export function adCoversWholeGovernorate(
  adCov: string[],
  govId: string,
  index: HomeGeoCoverageIndex
): boolean {
  const all = index.govById.get(govId)?.cityIds;
  if (!all?.length || !adCov.length) return false;
  const set = new Set(adCov);
  return all.every((id) => set.has(id));
}

/** نص حقل city يعرض المحافظة كاملة وليس مدينة مفردة */
export function adCityDisplayIsWholeGovernorate(
  ad: Record<string, unknown>,
  govId: string,
  index: HomeGeoCoverageIndex
): boolean {
  const gov = index.govById.get(govId);
  if (!gov?.shortNorm) return false;
  const disp = normalizeForMatchArabic(ad['city']);
  if (!disp) return false;
  if (disp === gov.shortNorm) return true;
  return disp.includes(gov.shortNorm) || gov.shortNorm.includes(disp);
}

/** توسيع معرّفات الفلتر من أسماء عربية (مدينة أو محافظة كاملة) */
export function expandFilterCityIdsFromArabicTokens(
  flatCityIds: Set<string>,
  arabicTokens: Set<string>,
  index: HomeGeoCoverageIndex | null | undefined
): Set<string> {
  const out = new Set(flatCityIds);
  if (!index) return out;

  for (const raw of arabicTokens) {
    const nt = normalizeForMatchArabic(raw);
    if (!nt) continue;

    const byName = index.cityNameToIds.get(nt);
    if (byName?.length) {
      for (const id of byName) out.add(id);
    }

    for (const gov of index.govById.values()) {
      if (!gov.shortNorm) continue;
      if (nt === gov.shortNorm || nt.includes(gov.shortNorm) || gov.shortNorm.includes(nt)) {
        for (const id of gov.cityIds) out.add(id);
      }
    }
  }

  return out;
}

export function filterCoversWholeGovernorate(
  filterCityIds: Set<string>,
  govId: string,
  index: HomeGeoCoverageIndex
): boolean {
  const all = index.govById.get(govId)?.cityIds;
  if (!all?.length || !filterCityIds.size) return false;
  return all.every((id) => filterCityIds.has(id));
}

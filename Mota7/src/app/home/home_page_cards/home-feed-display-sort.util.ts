/**
 * ترتيب إعلانات الرئيسية لكل الأقسام:
 * - المتاحة أولاً، ثم غير المتاحة (الباهت).
 *
 * داخل كل مجموعة:
 * 1) ترتيب يدوي نشِط (sort_order من 1 إلى 5 مع نافذة التاريخ إن وُجدت)
 * 2) طبقات التوثيق: vip → Diamonds → golden → silver → bronze → free
 *    — خلط محدّد بالساعة داخل كل طبقة (مع احترام gold→golden وblue→silver عبر normalization).
 */

import {
  normalizeVerificationTier,
  type CanonicalVerificationTier,
  VERIFICATION_TIER_SORT_WEIGHT,
  effectiveTierForAdFields,
} from '../../core/utils/verification-tiers.util';

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 0) / 4294967296;
  };
}

export function getLocalHourlySeed(): number {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  return y * 1_000_000 + m * 10_000 + day * 100 + h;
}

function parseMaybeMillis(v: unknown): number | null {
  if (v == null || v === '') {
    return null;
  }
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  const d = new Date(v as string | number | Date);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/** ترتيب يدوي نشِط: مستويات 1–5 فقط + لا قبل البداية ولا بعد النهاية */
export function isManualBoostSortActive(ad: unknown): boolean {
  const o = ad as Record<string, unknown> | null | undefined;
  const so = Number(o?.['sort_order']);
  if (!Number.isFinite(so) || so < 1 || so > 5) {
    return false;
  }
  const fromMs = parseMaybeMillis(o?.['manual_sort_from']);
  const untilMs = parseMaybeMillis(o?.['manual_sort_until']);
  if (fromMs == null && untilMs == null) {
    return true;
  }
  const now = Date.now();
  if (fromMs != null && now < fromMs) {
    return false;
  }
  if (untilMs != null && now > untilMs) {
    return false;
  }
  return true;
}

function resolveEffectiveTier(ad: unknown): CanonicalVerificationTier {
  const o = ad as Record<string, unknown>;
  return effectiveTierForAdFields(
    o['verification_level'],
    o['is_verified'],
    o['verification_valid_from'],
    o['verification_valid_until']
  );
}

function tierSaltForShuffle(tier: CanonicalVerificationTier): number {
  const w = VERIFICATION_TIER_SORT_WEIGHT[tier] ?? 0;
  return (w + 1) * 97;
}

function compareIds(a: unknown, b: unknown): number {
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  return String(ao?.['id'] ?? ao?.['ad_id'] ?? '').localeCompare(
    String(bo?.['id'] ?? bo?.['ad_id'] ?? ''),
    'ar'
  );
}

/** متاح للعرض النشيط — يطابق الكروت */
export function isAdCurrentlyAvailableForHomeFeed(ad: unknown): boolean {
  const o = ad as Record<string, unknown>;
  const type = o['ad_type'];
  if (type === 'delivery') {
    const d = o['details'] as Record<string, unknown> | undefined;
    if (d && typeof d === 'object' && 'is_available' in d) {
      return d['is_available'] !== false;
    }
    return true;
  }
  if (type === 'education' || type === 'other') {
    return o['is_available'] !== false;
  }
  return true;
}

function hourlyShuffleScore(
  ad: unknown,
  hourlySeed: number,
  tierSalt: number
): number {
  const o = ad as Record<string, unknown>;
  const id = String(o?.['id'] ?? o?.['ad_id'] ?? '');
  let h = (hourlySeed ^ (tierSalt * 0x9e3779b9)) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  const rng = makeRng(h >>> 0);
  return rng();
}

function sortTierByHourlyShuffle(
  ads: unknown[],
  hourlySeed: number,
  tierSalt: number
): unknown[] {
  return [...ads].sort((a, b) => {
    const ka = hourlyShuffleScore(a, hourlySeed, tierSalt);
    const kb = hourlyShuffleScore(b, hourlySeed, tierSalt);
    if (ka !== kb) {
      return ka - kb;
    }
    return compareIds(a, b);
  });
}

const TIERS_ORDER: CanonicalVerificationTier[] = [
  'vip',
  'Diamonds',
  'golden',
  'silver',
  'bronze',
  'free',
];

function sortByPriorityTiers(ads: unknown[], seed: number): unknown[] {
  if (!ads.length) {
    return [];
  }

  const manual = ads
    .filter((a) => isManualBoostSortActive(a))
    .sort((a, b) => {
      const ao = a as Record<string, unknown>;
      const bo = b as Record<string, unknown>;
      const sa = Number(ao?.['sort_order']);
      const sb = Number(bo?.['sort_order']);
      if (sa !== sb) {
        return sa - sb;
      }
      return compareIds(a, b);
    });

  const rest = ads.filter((a) => !isManualBoostSortActive(a));
  const parts: unknown[] = [];
  for (const tier of TIERS_ORDER) {
    const slice = rest.filter((a) => resolveEffectiveTier(a) === tier);
    parts.push(
      ...sortTierByHourlyShuffle(slice, seed, tierSaltForShuffle(tier))
    );
  }
  const leftover = rest.filter(
    (a) => !TIERS_ORDER.includes(resolveEffectiveTier(a))
  );
  parts.push(
    ...sortTierByHourlyShuffle(leftover, seed, tierSaltForShuffle('none'))
  );

  return [...manual, ...parts];
}

export function sortHomeFeedAdsForDisplay(
  ads: unknown[],
  hourlySeed?: number
): unknown[] {
  if (!ads?.length) {
    return [];
  }
  const seed = hourlySeed ?? getLocalHourlySeed();

  const available = ads.filter((a) =>
    isAdCurrentlyAvailableForHomeFeed(a)
  );
  const unavailable = ads.filter(
    (a) => !isAdCurrentlyAvailableForHomeFeed(a)
  );

  return [
    ...sortByPriorityTiers(available, seed),
    ...sortByPriorityTiers(unavailable, seed),
  ];
}

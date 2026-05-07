/**
 * توثيق الحساب/الإعلان — موافق لنسخة Mota7 (نسخ للأدمن لعرض الشارات والفرز).
 */

import { Timestamp } from 'firebase/firestore';

export type CanonicalVerificationTier =
  | 'none'
  | 'free'
  | 'bronze'
  | 'silver'
  | 'golden'
  | 'Diamonds'
  | 'vip';

export const VERIFICATION_TIER_SORT_WEIGHT: Record<string, number> = {
  vip: 60,
  Diamonds: 50,
  golden: 40,
  silver: 30,
  bronze: 20,
  free: 10,
  none: 0,
};

const BADGE_FILE: Record<CanonicalVerificationTier, string | null> = {
  none: null,
  free: 'free.jpg',
  bronze: 'bronze.jpg',
  silver: 'silver.jpg',
  golden: 'golden.jpg',
  Diamonds: 'Diamonds.jpg',
  vip: 'vip.jpg',
};

export function defaultMaxAdsForTier(tier: CanonicalVerificationTier): number {
  switch (tier) {
    case 'free':
      return 1;
    case 'bronze':
      return 1;
    case 'silver':
      return 5;
    case 'golden':
      return 10;
    case 'Diamonds':
      return 15;
    case 'vip':
      return 999;
    default:
      return 999;
  }
}

export function normalizeVerificationTier(raw: unknown): CanonicalVerificationTier {
  const s = String(raw ?? '').trim();
  if (!s || s === 'none') {
    return 'none';
  }
  const lower = s.toLowerCase();
  if (lower === 'gold') {
    return 'golden';
  }
  if (lower === 'blue') {
    return 'silver';
  }
  if (lower === 'diamonds') {
    return 'Diamonds';
  }
  const ok: CanonicalVerificationTier[] = [
    'free',
    'bronze',
    'silver',
    'golden',
    'Diamonds',
    'vip',
  ];
  if (ok.includes(s as CanonicalVerificationTier)) {
    return s as CanonicalVerificationTier;
  }
  return 'none';
}

export function tierSortWeight(tierRaw: unknown): number {
  const c = normalizeVerificationTier(tierRaw);
  return VERIFICATION_TIER_SORT_WEIGHT[c] ?? 0;
}

export function verificationBadgeFilename(tierRaw: unknown): string | null {
  const c = normalizeVerificationTier(tierRaw);
  return BADGE_FILE[c];
}

export function verificationBadgeAssetPath(tierRaw: unknown): string | null {
  const f = verificationBadgeFilename(tierRaw);
  return f ? `assets/subscrip/${f}` : null;
}

export function canonicalTierForFirestore(raw: unknown): Exclude<
  CanonicalVerificationTier,
  'none'
> {
  const t = normalizeVerificationTier(raw);
  return (t === 'none' ? 'free' : t) as Exclude<
    CanonicalVerificationTier,
    'none'
  >;
}

/** سلسلة YYYY-MM-DD (أو بداية ISO) → Timestamp UTC؛ للنهاية آخر لحظة من اليوم. */
export function yyyyMmDdStringToUtcTimestamp(
  raw: string,
  endOfDay: boolean
): Timestamp | null {
  const s = String(raw ?? '').trim();
  if (!s) {
    return null;
  }
  const datePart = s.split('T')[0]?.split(' ')[0]?.trim() ?? '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) {
    return null;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const ms = endOfDay
    ? Date.UTC(y, mo, d, 23, 59, 59, 999)
    : Date.UTC(y, mo, d, 0, 0, 0, 0);
  return Timestamp.fromMillis(ms);
}

export function parseFirestoreMillis(v: unknown): number | null {
  if (v == null || v === '') {
    return null;
  }
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  const sec = (v as { seconds?: number }).seconds;
  if (typeof sec === 'number' && Number.isFinite(sec)) {
    const nano = (v as { nanoseconds?: number }).nanoseconds ?? 0;
    return sec * 1000 + Math.floor(nano / 1e6);
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  const d = new Date(v as string);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

export function isVerificationDateWindowActive(
  validFrom: unknown,
  validUntil: unknown,
  nowMs = Date.now()
): boolean {
  const fromMs = parseFirestoreMillis(validFrom);
  const untilMs = parseFirestoreMillis(validUntil);
  if (fromMs != null && nowMs < fromMs) {
    return false;
  }
  if (untilMs != null && nowMs > untilMs) {
    return false;
  }
  return true;
}

export function effectiveTierFromUserFields(
  data: Record<string, unknown> | undefined
): Exclude<CanonicalVerificationTier, 'none'> {
  if (!data) {
    return 'free';
  }
  const raw =
    data['verification_level'] ??
    data['verifiedStatus'] ??
    data['verification_status'] ??
    data['verificationStatus'];
  const windowOk = isVerificationDateWindowActive(
    data['verification_valid_from'],
    data['verification_valid_until']
  );
  if (!windowOk) {
    return 'free';
  }
  return canonicalTierForFirestore(raw);
}

export function effectiveTierForAdFields(
  tierRaw: unknown,
  verifiedRaw: unknown | undefined,
  validFrom: unknown,
  validUntil: unknown
): Exclude<CanonicalVerificationTier, 'none'> {
  const raw = tierRaw ?? verifiedRaw;
  const windowOk = isVerificationDateWindowActive(validFrom, validUntil);
  if (!windowOk) {
    return 'free';
  }
  return canonicalTierForFirestore(raw);
}

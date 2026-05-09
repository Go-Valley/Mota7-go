/**
 * توثيق الحساب/الإعلان — قيم موحّدة في Firestore (verifiedStatus / verification_level / is_verified).
 * ترحيل: gold→golden، blue→silver.
 */

export type CanonicalVerificationTier =
  | 'none'
  | 'empty'
  | 'free'
  | 'bronze'
  | 'silver'
  | 'golden'
  | 'Diamonds'
  | 'vip';

/** أولوية الترتيب في الخلاصات (أكبر = يظهر أعلى ضمن طبقة التوثيق) */
export const VERIFICATION_TIER_SORT_WEIGHT: Record<string, number> = {
  vip: 60,
  Diamonds: 50,
  golden: 40,
  silver: 30,
  bronze: 20,
  free: 10,
  empty: 1,
  none: 0,
};

const BADGE_FILE: Record<CanonicalVerificationTier, string | null> = {
  none: null,
  empty: null,
  free: 'free.jpg',
  bronze: 'bronze.jpg',
  silver: 'silver.jpg',
  golden: 'golden.jpg',
  Diamonds: 'Diamonds.jpg',
  vip: 'vip.jpg',
};

/** افتراضي للحد الأقصى للإعلانات إذا لم يُضبط الحقل في مستند المستخدم */
export function defaultMaxAdsForTier(tier: CanonicalVerificationTier): number {
  switch (tier) {
    case 'empty':
      return 0;
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
  let s = String(raw ?? '').trim();
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
    'empty',
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

/** اسم ملف الشارة تحت assets/subscrip/ أو null */
export function verificationBadgeFilename(tierRaw: unknown): string | null {
  const c = normalizeVerificationTier(tierRaw);
  return BADGE_FILE[c];
}

export function verificationBadgeAssetPath(tierRaw: unknown): string | null {
  const f = verificationBadgeFilename(tierRaw);
  return f ? `assets/subscrip/${f}` : null;
}

/**
 * القيمة المُخزَّنة في users / ads: غياب التوثيق يُعرَّض كـ free ضمن النموذج الستّي.
 */
export function canonicalTierForFirestore(raw: unknown): Exclude<
  CanonicalVerificationTier,
  'none'
> {
  const t = normalizeVerificationTier(raw);
  return (t === 'none' ? 'empty' : t) as Exclude<
    CanonicalVerificationTier,
    'none'
  >;
}

/** وقت من Timestamp أو كائن seconds أو رقم أو نص ISO */
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

/** نافذة التوثيق نشطة إذا لم يُحدَّد تاريخ أو الآن داخل المدى */
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

/**
 * طبقة الحساب بعد احترام تواريخ التوثيق — خارج النافذة يُعامل كـ free للعرض والحصة.
 */
export function effectiveTierFromUserFields(
  data: Record<string, unknown> | undefined
): Exclude<CanonicalVerificationTier, 'none'> {
  if (!data) {
    return 'empty';
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
    return 'empty';
  }
  return canonicalTierForFirestore(raw);
}

/** طبقة الشارة على الإعلان مع احترام تواريخ التوثيق المخزَّنة على الإعلان */
export function effectiveTierForAdFields(
  tierRaw: unknown,
  verifiedRaw: unknown | undefined,
  validFrom: unknown,
  validUntil: unknown
): Exclude<CanonicalVerificationTier, 'none'> {
  const raw = tierRaw ?? verifiedRaw;
  const windowOk = isVerificationDateWindowActive(validFrom, validUntil);
  if (!windowOk) {
    return 'empty';
  }
  return canonicalTierForFirestore(raw);
}

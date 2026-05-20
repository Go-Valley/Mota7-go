import type { SubscriptionPlanTier } from '../models/subscriptions-config.model';
import {
  normalizeSubscriptionsConfig,
  type SubscriptionsConfig,
  type SubscriptionPlan,
} from '../models/subscriptions-config.model';
import {
  defaultMaxAdsForTier,
  type CanonicalVerificationTier,
} from './verification-tiers.util';

/** ربط طبقة توثيق الحساب بمستوى/مستويات باقة في subscriptions/config */
export function verificationTierToPlanTiers(
  tier: Exclude<CanonicalVerificationTier, 'none' | 'vip'>
): SubscriptionPlanTier[] {
  switch (tier) {
    case 'empty':
      return [];
    case 'free':
      /** باقة «تجريبية» في Firestore غالباً tier=slate؛ trial للتوافق القديم */
      return ['slate', 'trial'];
    case 'bronze':
      return ['bronze'];
    case 'silver':
      return ['silver'];
    case 'golden':
      return ['gold'];
    case 'Diamonds':
      return ['diamond'];
    default:
      return [];
  }
}

/** @deprecated استخدم verificationTierToPlanTiers */
export function verificationTierToPlanTier(
  tier: Exclude<CanonicalVerificationTier, 'none' | 'vip'>
): SubscriptionPlanTier | null {
  const tiers = verificationTierToPlanTiers(tier);
  return tiers.length ? tiers[0] : null;
}

function maxAllowedAdsFromMatchingPlans(
  plans: SubscriptionPlan[],
  planTiers: SubscriptionPlanTier[]
): number | null {
  if (!planTiers.length) {
    return null;
  }
  const tierSet = new Set(planTiers);
  const caps = plans
    .filter((p) => p.visible !== false && p.tier != null && tierSet.has(p.tier))
    .map((p) => p.max_allowed_ads)
    .filter(
      (m): m is number =>
        typeof m === 'number' && Number.isFinite(m) && m >= 0
    );
  if (!caps.length) {
    return null;
  }
  return Math.max(...caps.map((m) => Math.floor(m)));
}

function maxAllowedAdsFromAllVisiblePlans(plans: SubscriptionPlan[]): number | null {
  const caps = plans
    .filter((p) => p.visible !== false)
    .map((p) => p.max_allowed_ads)
    .filter(
      (m): m is number =>
        typeof m === 'number' && Number.isFinite(m) && m >= 0
    );
  if (!caps.length) {
    return null;
  }
  return Math.max(...caps.map((m) => Math.floor(m)));
}

/**
 * الحد الأقصى للإعلانات النشطة من إدارة الاشتراكات (plans[].max_allowed_ads).
 * empty → 0؛ vip → أعلى سقف باقة ماسي ثم أعلى سقف عام؛ غير ذلك حسب tier الباقة.
 */
export function resolveMaxActiveAdsForVerificationTier(
  cfg: SubscriptionsConfig | Record<string, unknown> | undefined,
  tier: Exclude<CanonicalVerificationTier, 'none'>
): number {
  if (tier === 'empty') {
    return 0;
  }

  const normalized = normalizeSubscriptionsConfig(
    cfg as Record<string, unknown> | undefined
  );
  const plans = normalized.plans;

  if (tier === 'vip') {
    const fromDiamond = maxAllowedAdsFromMatchingPlans(plans, ['diamond']);
    if (fromDiamond != null) {
      return fromDiamond;
    }
    const fromAny = maxAllowedAdsFromAllVisiblePlans(plans);
    if (fromAny != null) {
      return fromAny;
    }
    return defaultMaxAdsForTier('vip');
  }

  const planTiers = verificationTierToPlanTiers(tier);
  const fromPlans = maxAllowedAdsFromMatchingPlans(plans, planTiers);
  if (fromPlans != null) {
    return fromPlans;
  }
  return defaultMaxAdsForTier(tier);
}

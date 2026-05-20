import type {
  SubscriptionPlan,
  SubscriptionPlanTier,
} from '../models/subscriptions-config.model';

/** ضبط موضع الشارة: posX يمين/يسار، posY أعلى/أسفل (0–100) */
export interface TierBadgeFrameConfig {
  file: string;
  posX: number;
  posY: number;
}

/**
 * شارات الباقات — المسار الفعلي: assets/subscrip/
 * عدّل posX / posY هنا أو عبر Firestore: badge_offset_x / badge_offset_y
 */
export const SUBSCRIPTION_TIER_BADGE_FRAMES: Record<
  SubscriptionPlanTier,
  TierBadgeFrameConfig
> = {
  trial: { file: 'free.jpg', posX: 50, posY: 40 },
  bronze: { file: 'bronze.jpg', posX: 50, posY: 38 },
  silver: { file: 'silver.jpg', posX: 50, posY: 36 },
  gold: { file: 'golden.jpg', posX: 50, posY: 34 },
  diamond: { file: 'Diamonds.jpg', posX: 50, posY: 32 },
  slate: { file: 'free.jpg', posX: 50, posY: 40 },
};

function tierOf(plan: SubscriptionPlan): SubscriptionPlanTier {
  return plan.tier ?? 'slate';
}

function offsets(plan: SubscriptionPlan): { x: number; y: number } {
  const frame = SUBSCRIPTION_TIER_BADGE_FRAMES[tierOf(plan)];
  const x = plan.badge_offset_x ?? plan.badgeOffsetX ?? frame.posX;
  const y = plan.badge_offset_y ?? plan.badgeOffsetY ?? frame.posY;
  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
  };
}

function assetRelPath(plan: SubscriptionPlan): string {
  const custom = String(plan.badge_image_src ?? plan.badgeImageSrc ?? '').trim();
  if (custom.length > 0) {
    return custom.startsWith('assets/') ? custom : `assets/subscrip/${custom}`;
  }
  const file = SUBSCRIPTION_TIER_BADGE_FRAMES[tierOf(plan)].file;
  return `assets/subscrip/${file}`;
}

/** مسار مطلق يعمل على الويب و Capacitor (مثل شارات التوثيق) */
export function subscriptionPlanBadgeSrc(
  plan: SubscriptionPlan,
  baseUri: string
): string {
  const rel = assetRelPath(plan);
  try {
    return new URL(rel, baseUri || '/').href;
  } catch {
    return rel;
  }
}

export function subscriptionPlanBadgeImageStyle(
  plan: SubscriptionPlan
): Record<string, string> {
  const { x, y } = offsets(plan);
  return { objectPosition: `${x}% ${y}%` };
}

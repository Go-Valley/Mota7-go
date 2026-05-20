import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import type { PackageTierVariant } from '../core/models/payment-ledger.model';
import type { SubscriptionsConfig } from '../core/models/subscriptions-config.model';
import { resolveMaxActiveAdsForVerificationTier } from '../core/utils/subscription-verification-limits.util';
import {
  VERIFICATION_TIER_SORT_WEIGHT,
  canonicalTierForFirestore,
  defaultMaxAdsForTier,
  normalizeVerificationTier,
  yyyyMmDdStringToUtcTimestamp,
  type CanonicalVerificationTier,
} from '../core/utils/verification-tiers.util';

export interface ApplyPackageVerificationInput {
  userKey: string;
  packageVariant: PackageTierVariant;
  periodStart: string;
  periodEnd: string;
  config: SubscriptionsConfig;
}

export interface ApplyPackageVerificationResult {
  ok: boolean;
  message: string;
  tier?: CanonicalVerificationTier;
}

@Injectable({ providedIn: 'root' })
export class AdminVerificationApplyService {
  private readonly fs = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  packageVariantToTier(variant: PackageTierVariant): Exclude<CanonicalVerificationTier, 'none' | 'vip' | 'empty' | 'free'> {
    switch (variant) {
      case 'bronze':
        return 'bronze';
      case 'silver':
        return 'silver';
      case 'gold':
        return 'golden';
      case 'diamond':
        return 'Diamonds';
      default:
        return 'bronze';
    }
  }

  tierLabelAr(tier: CanonicalVerificationTier): string {
    switch (tier) {
      case 'bronze':
        return 'برونزي';
      case 'silver':
        return 'فضي';
      case 'golden':
        return 'ذهبي';
      case 'Diamonds':
        return 'ماسي';
      default:
        return tier;
    }
  }

  async applyPackageVerification(
    input: ApplyPackageVerificationInput
  ): Promise<ApplyPackageVerificationResult> {
    const userKey = String(input.userKey ?? '').trim();
    if (!userKey) {
      return { ok: false, message: 'رقم الحساب فارغ' };
    }

    const tier = this.packageVariantToTier(input.packageVariant);
    const fromTs = yyyyMmDdStringToUtcTimestamp(input.periodStart, false);
    const untilTs = yyyyMmDdStringToUtcTimestamp(input.periodEnd, true);
    if (!fromTs || !untilTs) {
      return { ok: false, message: 'تواريخ الفترة غير صالحة' };
    }
    if (fromTs.toMillis() > untilTs.toMillis()) {
      return { ok: false, message: 'تاريخ البداية بعد تاريخ النهاية' };
    }

    let maxAds: number;
    try {
      maxAds = resolveMaxActiveAdsForVerificationTier(input.config, tier);
    } catch {
      maxAds = defaultMaxAdsForTier(tier);
    }

    const tierStored = canonicalTierForFirestore(tier);
    const userPayload: Record<string, unknown> = {
      verifiedStatus: tierStored,
      verification_level: tierStored,
      max_active_ads: maxAds,
      verification_valid_from: fromTs,
      verification_valid_until: untilTs,
    };

    try {
      return await runInInjectionContext(this.injector, async () => {
        const userRef = doc(this.fs, 'users', userKey);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          return {
            ok: false,
            message: `لم يُعثر على مستخدم برقم الحساب: ${userKey}`,
          };
        }

        const userData = userSnap.data() as Record<string, unknown>;
        await updateDoc(userRef, userPayload);
        await this.cascadeVerificationToUserAds(
          {
            id: userKey,
            uid: typeof userData['uid'] === 'string' ? userData['uid'] : undefined,
            phone:
              typeof userData['phone'] === 'string'
                ? userData['phone']
                : userKey,
          },
          tierStored,
          fromTs,
          untilTs
        );
        return {
          ok: true,
          message: `تم تطبيق توثيق ${this.tierLabelAr(tier)} حتى ${input.periodEnd} — حد ${maxAds} إعلاناً`,
          tier,
        };
      });
    } catch (e) {
      console.error('[AdminVerificationApply]', e);
      return { ok: false, message: 'فشل تطبيق التوثيق — تحقق من الصلاحيات' };
    }
  }

  /** يُستدعى داخل runInInjectionContext فقط */
  private async cascadeVerificationToUserAds(
    user: { id: string; uid?: string; phone?: string },
    tier: string,
    validFrom: Timestamp,
    validUntil: Timestamp
  ): Promise<void> {
    const adIds = new Set<string>();
    const adsCol = collection(this.fs, 'ads');
    const firebaseUid =
      typeof user.uid === 'string' && user.uid.trim().length > 0
        ? user.uid.trim()
        : null;
    if (firebaseUid) {
      const snapUid = await getDocs(
        query(adsCol, where('userId', '==', firebaseUid))
      );
      snapUid.docs.forEach((d) => adIds.add(d.id));
    }
    const phones = new Set<string>();
    if (user.phone?.trim()) phones.add(user.phone.trim());
    if (user.id?.trim()) phones.add(user.id.trim());
    for (const p of phones) {
      const byOwner = await getDocs(
        query(adsCol, where('owner_phone', '==', p))
      );
      byOwner.docs.forEach((d) => adIds.add(d.id));
    }
    const ids = [...adIds];
    if (!ids.length) return;

    const chunk = 400;
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk);
      const snaps = await Promise.all(
        slice.map((id) => getDoc(doc(this.fs, 'ads', id)))
      );
      const batch = writeBatch(this.fs);
      for (let j = 0; j < slice.length; j++) {
        const snap = snaps[j];
        if (!snap.exists()) continue;
        const adData = snap.data() as Record<string, unknown>;
        if (normalizeVerificationTier(adData['verification_level']) === 'vip') {
          continue;
        }
        batch.update(doc(this.fs, 'ads', slice[j]), {
          verification_level: tier,
          is_verified: tier,
          verification_valid_from: validFrom,
          verification_valid_until: validUntil,
          updated_at: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }
}

/** أعلى باقة عند تسجيل أكثر من باقة في جلسة واحدة */
export function highestPackageVariant(
  variants: PackageTierVariant[]
): PackageTierVariant {
  let best: PackageTierVariant = variants[0] ?? 'bronze';
  let bestW = VERIFICATION_TIER_SORT_WEIGHT[packageVariantToCanonical(best)] ?? 0;
  for (const v of variants) {
    const t = packageVariantToCanonical(v);
    const w = VERIFICATION_TIER_SORT_WEIGHT[t] ?? 0;
    if (w > bestW) {
      bestW = w;
      best = v;
    }
  }
  return best;
}

function packageVariantToCanonical(v: PackageTierVariant): CanonicalVerificationTier {
  switch (v) {
    case 'bronze':
      return 'bronze';
    case 'silver':
      return 'silver';
    case 'gold':
      return 'golden';
    case 'diamond':
      return 'Diamonds';
    default:
      return 'bronze';
  }
}

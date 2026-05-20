import {
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import {
  defaultMaxAdsForTier,
  effectiveTierFromUserFields,
  isVerificationDateWindowActive,
  type CanonicalVerificationTier,
} from './verification-tiers.util';

/** رقم الدعم — واتساب تطبيق (Capacitor على الأصلي) */
export const QUOTA_ADMIN_WHATSAPP_PHONE = '01220883999';

export type AdQuotaGateVariant =
  | 'no_subscription'
  | 'within_limit'
  | 'at_limit';

export interface OwnerAdQuotaGateState {
  variant: AdQuotaGateVariant;
  canAddNewAd: boolean;
  effectiveTier: Exclude<CanonicalVerificationTier, 'none'>;
  /** المجانية — البرونزية — … */
  packageNameAr: string;
  /** مجاني — برونزي — … */
  packageNameShortAr: string;
  maxAllowedAds: number;
  activeAdsCount: number;
  displayPhone: string;
}

const PACKAGE_NAME_AR: Record<
  Exclude<CanonicalVerificationTier, 'none'>,
  string
> = {
  empty: 'بدون اشتراك',
  free: 'المجانية',
  bronze: 'البرونزية',
  silver: 'الفضية',
  golden: 'الذهبية',
  Diamonds: 'الماسية',
  vip: 'VIP',
};

const PACKAGE_SHORT_AR: Record<
  Exclude<CanonicalVerificationTier, 'none'>,
  string
> = {
  empty: 'بدون اشتراك',
  free: 'مجاني',
  bronze: 'برونزي',
  silver: 'فضي',
  golden: 'ذهبي',
  Diamonds: 'ماسي',
  vip: 'VIP',
};

function packageLabels(
  tier: Exclude<CanonicalVerificationTier, 'none'>
): { packageNameAr: string; packageNameShortAr: string } {
  return {
    packageNameAr: PACKAGE_NAME_AR[tier] ?? String(tier),
    packageNameShortAr: PACKAGE_SHORT_AR[tier] ?? String(tier),
  };
}

/** يمرَّر لـ modal.dismiss(..., role) للخروج دون «تأكيد الخروج» (مثلاً الانتقال للباقات) */
export const AD_FORM_DISMISS_FOR_SUBSCRIPTION_PLANS_ROLE =
  'subscription_plans' as const;

/**
 * عدّ الإعلانات التي تخصّص «فتحة» المستخدم: **نشطة أو قيد المراجعة فقط**
 */
export async function countOwnerQuotaAds(
  fs: Firestore,
  injector: EnvironmentInjector,
  ownerPhone: string,
  firebaseUid?: string | null
): Promise<number> {
  const phone = String(ownerPhone ?? '').trim();
  const uid = String(firebaseUid ?? '').trim();
  const byId = new Map<string, { status?: unknown }>();
  if (phone) {
    const snap = await runInInjectionContext(injector, () =>
      getDocs(query(collection(fs, 'ads'), where('owner_phone', '==', phone)))
    );
    for (const d of snap.docs) {
      byId.set(d.id, d.data() as { status?: unknown });
    }
  }
  if (uid) {
    const snapUid = await runInInjectionContext(injector, () =>
      getDocs(query(collection(fs, 'ads'), where('userId', '==', uid)))
    );
    for (const d of snapUid.docs) {
      byId.set(d.id, d.data() as { status?: unknown });
    }
  }
  let n = 0;
  for (const data of byId.values()) {
    const st = String(data?.status ?? '');
    if (st === 'pending' || st === 'active') {
      n++;
    }
  }
  return n;
}

function parseMaxActiveAdsField(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n >= 0) {
      return Math.floor(n);
    }
  }
  return null;
}

/**
 * الحد الأقصى للإعلانات من حقل `max_active_ads` على مستند المستخدم
 * (يُضبط عند التوثيق من إدارة المستخدمين في لوحة الأدمن).
 */
export async function resolveMaxAdsForOwner(
  fs: Firestore,
  injector: EnvironmentInjector,
  userDocId: string
): Promise<number> {
  const id = String(userDocId ?? '').trim();
  if (!id) {
    return defaultMaxAdsForTier('empty');
  }
  return runInInjectionContext(injector, async () => {
    const userSnap = await getDoc(doc(fs, 'users', id));
    if (!userSnap.exists()) {
      return defaultMaxAdsForTier('empty');
    }
    const data = userSnap.data() as Record<string, unknown>;
    const effective = effectiveTierFromUserFields(data);
    if (effective === 'empty') {
      return 0;
    }
    const windowActive = isVerificationDateWindowActive(
      data['verification_valid_from'],
      data['verification_valid_until']
    );
    const fromAdmin = parseMaxActiveAdsField(data['max_active_ads']);
    if (windowActive && fromAdmin != null) {
      return fromAdmin;
    }
    return defaultMaxAdsForTier(effective);
  });
}

/** حالة البوابة عند الضغط على «إضافة إعلان جديد» */
export async function loadOwnerAdQuotaGateState(
  fs: Firestore,
  injector: EnvironmentInjector,
  ownerPhone: string,
  userDocId: string,
  firebaseUid?: string | null
): Promise<OwnerAdQuotaGateState | null> {
  const phone = String(ownerPhone ?? '').trim();
  const id = String(userDocId ?? '').trim();
  if (!phone || !id) {
    return null;
  }

  return runInInjectionContext(injector, async () => {
    const userSnap = await getDoc(doc(fs, 'users', id));
    const data = userSnap.exists()
      ? (userSnap.data() as Record<string, unknown>)
      : undefined;
    const effectiveTier = effectiveTierFromUserFields(data);
    const labels = packageLabels(effectiveTier);
    const phoneFromDoc = String(data?.['phone'] ?? '').trim();
    const displayPhone = phoneFromDoc || phone || id;

    const maxAllowedAds = await resolveMaxAdsForOwner(fs, injector, id);
    const activeAdsCount = await countOwnerQuotaAds(
      fs,
      injector,
      phone,
      firebaseUid
    );

    const isEmpty = effectiveTier === 'empty';
    const atLimit = activeAdsCount >= maxAllowedAds;
    let variant: AdQuotaGateVariant;
    if (isEmpty) {
      variant = 'no_subscription';
    } else if (atLimit) {
      variant = 'at_limit';
    } else {
      variant = 'within_limit';
    }

    return {
      variant,
      canAddNewAd: !isEmpty && !atLimit,
      effectiveTier,
      packageNameAr: labels.packageNameAr,
      packageNameShortAr: labels.packageNameShortAr,
      maxAllowedAds,
      activeAdsCount,
      displayPhone,
    };
  });
}

export function buildAddAdQuotaAdminWhatsAppMessage(
  gate: OwnerAdQuotaGateState
): string {
  const pkg =
    gate.variant === 'at_limit'
      ? gate.packageNameShortAr
      : gate.packageNameAr;
  return (
    'السلام عليكم .. 👋🏽\n' +
    'بستفسر عن عدم إمكانية اضافة إعلان جديد ..\n' +
    `لحساب رقم "${gate.displayPhone}" ..\n` +
    `اشتراكي حالياً على باقة "${pkg}" ..\n` +
    `عدد اعلاناتي المفعلة حاليا على التطبيق "${gate.activeAdsCount}" إعلان`
  );
}

/** @deprecated — استخدم loadOwnerAdQuotaGateState + presentAddAdQuotaGateModal */
export async function checkOwnerAdQuota(
  fs: Firestore,
  injector: EnvironmentInjector,
  ownerPhone: string,
  userDocId: string,
  firebaseUid?: string | null
): Promise<{ ok: boolean; isEmptyTier?: boolean }> {
  const gate = await loadOwnerAdQuotaGateState(
    fs,
    injector,
    ownerPhone,
    userDocId,
    firebaseUid
  );
  if (!gate) {
    return { ok: false };
  }
  return {
    ok: gate.canAddNewAd,
    isEmptyTier: gate.effectiveTier === 'empty',
  };
}

export function tierFromUserDoc(data: Record<string, unknown> | undefined): string {
  return effectiveTierFromUserFields(data);
}

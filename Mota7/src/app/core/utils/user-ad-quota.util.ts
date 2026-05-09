import {
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { AlertController } from '@ionic/angular';
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
  type CanonicalVerificationTier,
  isVerificationDateWindowActive,
  normalizeVerificationTier,
} from './verification-tiers.util';
import {
  normalizeSubscriptionsConfig,
  SUBSCRIPTIONS_CONFIG_DOC_PATH,
} from '../models/subscriptions-config.model';
import { openWhatsappNative } from './whatsapp-open.util';

/** رقم الدعم عند تجاوز حد الإعلانات — واتساب تطبيق (على الأصلي عبر Capacitor) */
const QUOTA_ADMIN_WHATSAPP_PHONE = '01220883999';

const EFFECTIVE_TIER_LABEL_AR: Record<
  Exclude<CanonicalVerificationTier, 'none'>,
  string
> = {
  empty: 'بدون اشتراك',
  free: 'تجريبية',
  bronze: 'برونزي',
  silver: 'فضّي',
  golden: 'ذهبي',
  Diamonds: 'ماسي',
  vip: 'VIP',
};

function tierArabicLabel(
  tier: Exclude<CanonicalVerificationTier, 'none'>
): string {
  return EFFECTIVE_TIER_LABEL_AR[tier] ?? String(tier);
}

async function resolveQuotaExceededWhatsAppLine(
  fs: Firestore,
  injector: EnvironmentInjector,
  userDocId: string,
  contactPhoneFallback: string
): Promise<{ displayPhone: string; packageSummaryAr: string }> {
  const id = String(userDocId ?? '').trim();
  const fallback = String(contactPhoneFallback ?? '').trim();
  if (!id) {
    return {
      displayPhone: fallback || 'غير متوفر',
      packageSummaryAr: 'غير معروف',
    };
  }
  return runInInjectionContext(injector, async () => {
    const snap = await getDoc(doc(fs, 'users', id));
    const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
    const phoneFromDoc = String(data['phone'] ?? '').trim();
    const displayPhone = phoneFromDoc || fallback || id;
    const eff = effectiveTierFromUserFields(data);
    const tierAr = tierArabicLabel(eff);
    const planId = String(
      data['subscription_plan_id'] ?? data['subscriptionPlanId'] ?? ''
    ).trim();
    let planName: string | null = null;
    if (planId) {
      try {
        const cfgSnap = await getDoc(
          doc(fs, SUBSCRIPTIONS_CONFIG_DOC_PATH[0], SUBSCRIPTIONS_CONFIG_DOC_PATH[1])
        );
        if (cfgSnap.exists()) {
          const cfg = normalizeSubscriptionsConfig(
            cfgSnap.data() as Record<string, unknown>
          );
          const n = cfg.plans.find((p) => p.id === planId)?.name?.trim();
          planName = n && n.length > 0 ? n : null;
        }
      } catch {
        planName = null;
      }
    }
    const packageSummaryAr = planName
      ? `«${planName}» — توثيق ${tierAr}`
      : `توثيق ${tierAr}`;

    return { displayPhone, packageSummaryAr };
  });
}

/** رسالة موحّدة عند تجاوز الحد المسموح لإعلانات المستخدم */
export const MAX_ADS_QUOTA_TOAST_AR =
  'عفواً .. وصلت للحد الاقصى المسموح به لاضافة اعلان جديد - قم بالترقية للاستفادة من مزايا الباقة الشهرية الأعلى';

/** رسالة مخصصة لمستخدمي الطبقة empty */
export const EMPTY_TIER_NO_ADS_MSG_AR =
  'عفواً  .. لايمكنك اضافة اعلان جديد في الوقت الحالي\nلاضافة اعلان جديد - قم بالترقية للاستفادة من مزايا الباقات الشهرية الاعلي';

/**
 * عدّ الإعلانات التي تخصّص «فتحة» المستخدم: **نشطة أو قيد المراجعة فقط**
 * (لا تُحسب مرفوضة/منتهية). يدمج نتائج `owner_phone` و`userId` لتفادي التفريق.
 */
export async function countOwnerQuotaAds(
  fs: Firestore,
  injector: EnvironmentInjector,
  ownerPhone: string,
  firebaseUid?: string | null
): Promise<number> {
  const phone = String(ownerPhone ?? '').trim();
  const uid = String(firebaseUid ?? '').trim();

  return runInInjectionContext(injector, async () => {
    const byId = new Map<string, { status?: unknown }>();
    if (phone) {
      const snap = await getDocs(
        query(collection(fs, 'ads'), where('owner_phone', '==', phone))
      );
      for (const d of snap.docs) {
        byId.set(d.id, d.data() as { status?: unknown });
      }
    }
    if (uid) {
      const snapUid = await getDocs(
        query(collection(fs, 'ads'), where('userId', '==', uid))
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
  });
}

export type QuotaExceededAdminContactPayload = {
  firestore: Firestore;
  injector: EnvironmentInjector;
  userDocId: string;
  /** رقم الهاتف في النموذج — احتياط إذا نُقص الحقل من مستند المستخدم */
  contactPhoneFallback: string;
};

export type PresentOwnerAdQuotaExceededOptions = {
  /** الضغط على «باقات الاشتراكات المتاحة» — عادة الانتقال لحسابي وفتح الباقات */
  onOpenSubscriptionPlans?: () => void | Promise<void>;
  /** زر «تواصل مع الإدارة» — رسالة واتساب برقم الحساب وملخص الباقة/التوثيق */
  quotaAdminContact?: QuotaExceededAdminContactPayload;
  /** إذا true يُستخدم نص ورأس مخصَّص لمستخدمي empty */
  isEmptyTier?: boolean;
};

/** يمرَّر لـ modal.dismiss(..., role) للخروج مباشرة دون «تأكيد الخروج» (مثلاً الانتقال للباقات) */
export const AD_FORM_DISMISS_FOR_SUBSCRIPTION_PLANS_ROLE =
  'subscription_plans' as const;

/** تنبيه واضح عند محاولة إضافة إعلان تتجاوز الحدّ المسموح */
export async function presentOwnerAdQuotaExceeded(
  alertCtrl: AlertController,
  options?: PresentOwnerAdQuotaExceededOptions
): Promise<void> {
  const go = options?.onOpenSubscriptionPlans;
  const qc = options?.quotaAdminContact;
  const isEmpty = options?.isEmptyTier === true;

  const buttons: {
    text: string;
    role?: string;
    handler?: () => void | false | Promise<void | false>;
  }[] = [];

  if (go) {
    buttons.push({
      text: 'باقات الاشتراكات المُتاحة',
      handler: () => {
        void Promise.resolve(go()).catch(() => {});
      },
    });
  }
  if (qc) {
    buttons.push({
      text: 'لمعرفة المزيد - تواصل مع الإدارة',
      handler: () => {
        void (async () => {
          try {
            const { displayPhone, packageSummaryAr } =
              await resolveQuotaExceededWhatsAppLine(
                qc.firestore,
                qc.injector,
                qc.userDocId,
                qc.contactPhoneFallback
              );
            const msg =
              `السلام عليكم .. بستفسر عن عدم امكانية اضافة اعلان جديد - لحساب رقم "${displayPhone}" - اشتراكي حاليا على باقة "${packageSummaryAr}"`;
            openWhatsappNative(QUOTA_ADMIN_WHATSAPP_PHONE, msg);
          } catch {
            openWhatsappNative(
              QUOTA_ADMIN_WHATSAPP_PHONE,
              'السلام عليكم .. استفسار بخصوص عدم إمكانيّة إضافة إعلان جديد.'
            );
          }
        })();
      },
    });
  }

  buttons.push({
    text: go || qc ? 'إغلاق' : 'حسناً',
    role: 'cancel',
  });

  const alert = await alertCtrl.create({
    header: 'تعذر اضافة اعلان جديد',
    message: isEmpty ? EMPTY_TIER_NO_ADS_MSG_AR : MAX_ADS_QUOTA_TOAST_AR,
    mode: 'ios',
    buttons,
  });
  await alert.present();
}

async function maxAdsCapFromSubscriptionPlan(
  fs: Firestore,
  injector: EnvironmentInjector,
  planRaw: unknown
): Promise<number | null> {
  const planId = String(planRaw ?? '').trim();
  if (!planId) {
    return null;
  }
  return runInInjectionContext(injector, async () => {
    const cfgSnap = await getDoc(
      doc(fs, SUBSCRIPTIONS_CONFIG_DOC_PATH[0], SUBSCRIPTIONS_CONFIG_DOC_PATH[1])
    );
    if (!cfgSnap.exists()) {
      return null;
    }
    const cfg = normalizeSubscriptionsConfig(
      cfgSnap.data() as Record<string, unknown>
    );
    const match = cfg.plans.find((p) => p.id === planId);
    const m = match?.max_allowed_ads;
    if (
      typeof m === 'number' &&
      Number.isFinite(m) &&
      m >= 0
    ) {
      return Math.floor(m);
    }
    return null;
  });
}

/** الحد الأقصى من مستند المستخدم، طبقة الاشتراك (الباقة)، أو افتراضي حسب الطبقة */
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
    const snap = await getDoc(doc(fs, 'users', id));
    if (!snap.exists()) {
      return defaultMaxAdsForTier('empty');
    }
    const data = snap.data() as Record<string, unknown>;
    const effective = effectiveTierFromUserFields(data);
    const explicit = data['max_active_ads'];
    const windowActive = isVerificationDateWindowActive(
      data['verification_valid_from'],
      data['verification_valid_until']
    );
    let base: number;
    if (
      typeof explicit === 'number' &&
      Number.isFinite(explicit) &&
      explicit >= 0 &&
      windowActive
    ) {
      base = Math.floor(explicit);
    } else {
      base = defaultMaxAdsForTier(normalizeVerificationTier(effective));
    }
    const planCap = await maxAdsCapFromSubscriptionPlan(
      fs,
      injector,
      data['subscription_plan_id'] ?? data['subscriptionPlanId']
    );
    if (planCap != null) {
      return Math.min(base, planCap);
    }
    return base;
  });
}

/** قبل إنشاء إعلان جديد — يشمل العدّ الإعلانات النشطة + قيد المراجعة */
export async function checkOwnerAdQuota(
  fs: Firestore,
  injector: EnvironmentInjector,
  ownerPhone: string,
  userDocId: string,
  firebaseUid?: string | null
): Promise<{ ok: boolean; message?: string; isEmptyTier?: boolean }> {
  const phone = String(ownerPhone ?? '').trim();
  if (!phone) {
    return { ok: false, message: 'لا يوجد رقم هاتف مسجّل للحساب.' };
  }

  const userSnap = await runInInjectionContext(injector, () =>
    getDoc(doc(fs, 'users', String(userDocId ?? '').trim() || '__missing__'))
  );
  const userData = userSnap.exists()
    ? (userSnap.data() as Record<string, unknown>)
    : undefined;
  const effectiveTier = effectiveTierFromUserFields(userData);
  const isEmptyTier = effectiveTier === 'empty';

  const max = await resolveMaxAdsForOwner(fs, injector, userDocId);
  const cur = await countOwnerQuotaAds(
    fs,
    injector,
    phone,
    firebaseUid
  );
  if (cur >= max) {
    return {
      ok: false,
      message: isEmptyTier ? EMPTY_TIER_NO_ADS_MSG_AR : MAX_ADS_QUOTA_TOAST_AR,
      isEmptyTier,
    };
  }
  return { ok: true };
}

export function tierFromUserDoc(data: Record<string, unknown> | undefined): string {
  return effectiveTierFromUserFields(data);
}

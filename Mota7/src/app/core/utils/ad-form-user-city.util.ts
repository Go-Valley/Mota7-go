import type { EnvironmentInjector } from '@angular/core';
import { runInInjectionContext } from '@angular/core';
import type { Auth } from '@angular/fire/auth';
import type { Firestore } from '@angular/fire/firestore';
import { doc, getDoc } from '@angular/fire/firestore';
import type { GovernorateService } from '../services/governorate.service';
import { uniqSortedCityIds } from './service-order-coverage-match.util';

export interface UserGovernorateContext {
  userGovernorateId: string | null;
  userCityId: string | null;
}

/** محافظة/مدينة الحساب — نفس قيود مودال الإضافة عند تعديل الإعلان */
export async function loadUserGovernorateContextForAdForm(
  auth: Auth,
  firestore: Firestore,
  injector: EnvironmentInjector
): Promise<UserGovernorateContext> {
  const user = auth.currentUser;
  if (!user?.email) {
    return { userGovernorateId: null, userCityId: null };
  }
  const userKey = user.email.split('@')[0];
  const userDoc = await runInInjectionContext(injector, () =>
    getDoc(doc(firestore, 'users', userKey))
  );
  if (!userDoc.exists()) {
    return { userGovernorateId: null, userCityId: null };
  }
  const data = userDoc.data();
  return {
    userGovernorateId: String(data['governorate_id'] ?? '').trim() || null,
    userCityId: String(data['city_id'] ?? '').trim() || null,
  };
}

export interface AdFormUserCityHydration {
  userGovernorateId: string | null;
  userCityId: string | null;
  cityDisplay: string;
  coverageCityIds: string[];
}

/**
 * عند تحميل ملف المستخدم: تهيئة معرّفات تغطية المدن من city_id المسجّل.
 */
export function coverageCityIdsFromUserProfile(
  isEditMode: boolean,
  userCityId: string | null | undefined,
  existing: string[] | undefined | null
): string[] {
  const current = [...(existing ?? [])].map((id) => String(id).trim()).filter(Boolean);
  if (isEditMode || current.length) {
    return current;
  }
  const cid = String(userCityId ?? '').trim();
  return cid ? [cid] : [];
}

/** قبل التحقق عند الحفظ — يضمن اعتماد مدينة الحساب إن وُجدت ولم يُخترَ شيء يدوياً */
export function ensureCoverageCityIdsBeforeSave(
  isEditMode: boolean,
  userCityId: string | null | undefined,
  coverageCityIds: string[]
): string[] {
  return coverageCityIdsFromUserProfile(isEditMode, userCityId, coverageCityIds);
}

/**
 * تحميل مدينة الحساب لنموذج إعلان جديد: city_id أو استنتاجها من الاسم + المحافظة.
 */
export async function hydrateAdFormUserCityFromProfile(
  govService: GovernorateService,
  data: Record<string, unknown>,
  isEditMode: boolean
): Promise<AdFormUserCityHydration> {
  const userGovernorateId = String(data['governorate_id'] ?? '').trim() || null;
  let userCityId = String(data['city_id'] ?? '').trim() || null;
  const cityDisplay = String(data['city'] ?? '').trim();

  if (!isEditMode && !userCityId && userGovernorateId && cityDisplay) {
    userCityId = await govService.resolveCityIdByGovernorateAndName(
      userGovernorateId,
      cityDisplay
    );
  }

  const coverageCityIds = coverageCityIdsFromUserProfile(isEditMode, userCityId, []);

  return {
    userGovernorateId,
    userCityId,
    cityDisplay,
    coverageCityIds,
  };
}

/**
 * قبل إرسال الإعلان: حلّ المدينة من الحساب إن بقي الحقل فارغاً بعد واجهة الاختيار.
 */
export async function ensureCoverageCityIdsForAdSubmit(
  govService: GovernorateService,
  opts: {
    isEditMode: boolean;
    userGovernorateId: string | null;
    userCityId: string | null;
    cityDisplay: string;
    coverageCityIds: string[];
  }
): Promise<{ coverageCityIds: string[]; userCityId: string | null }> {
  let userCityId = opts.userCityId;
  let coverageCityIds = ensureCoverageCityIdsBeforeSave(
    opts.isEditMode,
    userCityId,
    opts.coverageCityIds
  );

  if (!coverageCityIds.length && !opts.isEditMode) {
    const gid = opts.userGovernorateId;
    const name = String(opts.cityDisplay ?? '').trim();
    if (!userCityId && gid && name) {
      userCityId = await govService.resolveCityIdByGovernorateAndName(gid, name);
    }
    if (userCityId) {
      coverageCityIds = [userCityId];
    }
  }

  return { coverageCityIds, userCityId };
}

/** لا تُصفّر التغطية عند emit فارغ من المُختار (بذرة فاشلة قبل تحميل المدن). */
export function applyCoverageMultiEmitToAdForm(
  ev: { cityIds?: string[]; primaryCityDisplay?: string },
  currentCoverageIds: string[],
  currentCityDisplay: string
): { coverageCityIds: string[]; cityDisplay: string } {
  const ids = uniqSortedCityIds(ev.cityIds ?? []);
  if (ids.length) {
    const disp = String(ev.primaryCityDisplay ?? '').trim();
    return {
      coverageCityIds: ids,
      cityDisplay: disp || currentCityDisplay,
    };
  }
  return {
    coverageCityIds: currentCoverageIds,
    cityDisplay: currentCityDisplay,
  };
}

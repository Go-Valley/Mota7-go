import { firstValueFrom } from 'rxjs';
import type { GovernorateService } from '../services/governorate.service';
import {
  readGuestOrderContact,
  writeGuestOrderContact,
} from './guest-order-contact-storage.util';
import { readStoredShoppingBuyer } from './shopping-checkout-buyer-storage.util';
import {
  NEW_VALLEY_GOV_ID,
  uniqSortedCityIds,
  valleyCityDocIdsFromDisplay,
} from './service-order-coverage-match.util';

export { valleyCityDocIdsFromDisplay } from './service-order-coverage-match.util';

export function arabicTokensFromCityDocIds(cityIds: string[]): string[] {
  const tokens: string[] = [];
  for (const id of cityIds) {
    if (id === 'kharga') tokens.push('الخارجة');
    if (id === 'dakhla') tokens.push('الداخلة');
  }
  return tokens;
}

export interface ServiceRequestCoverageHydration {
  cityIds: string[];
  arabicTokens: string[];
  cityDisplay: string;
}

export interface ServiceRequestCoverageFormState {
  requestCoverageCityIds: string[];
  requestCoverageArabic: string[];
  orderCity: string;
}

/** تهيئة تغطية طلب الخدمة من مستند users (city_id أو حلّ الاسم + المحافظة) */
export async function hydrateServiceRequestCoverageFromUserDoc(
  govService: GovernorateService,
  data: Record<string, unknown>
): Promise<ServiceRequestCoverageHydration> {
  const cityDisplay = String(data['city'] ?? '').trim();
  let cityId = String(data['city_id'] ?? '').trim();
  const govId = String(data['governorate_id'] ?? '').trim();

  if (!cityId && govId && cityDisplay) {
    cityId =
      (await govService.resolveCityIdByGovernorateAndName(govId, cityDisplay)) ?? '';
  }

  let cityIds = cityId ? [cityId] : valleyCityDocIdsFromDisplay(cityDisplay);
  cityIds = uniqSortedCityIds(cityIds);

  let arabicTokens = arabicTokensFromCityDocIds(cityIds);
  if (!arabicTokens.length && cityDisplay) {
    arabicTokens = [cityDisplay];
  }
  if (!arabicTokens.length && cityIds.length === 1 && govId) {
    const city = await govService.getCityById(govId, cityIds[0]!);
    if (city?.name?.trim()) {
      arabicTokens = [city.name.trim()];
    }
  }

  return { cityIds, arabicTokens, cityDisplay };
}

/**
 * يطبّق التغطية على النموذج ويُرجع قيمًا جديدة للمصفوفات (مهم لـ seedCoverageCityIds في Angular).
 * يُرجع null إذا كانت التغطية مُعبأة مسبقاً أو لا بيانات.
 */
export function applyServiceRequestCoverageFromUserDoc(
  hydration: ServiceRequestCoverageHydration,
  state: ServiceRequestCoverageFormState
): ServiceRequestCoverageHydration | null {
  if (state.requestCoverageCityIds.length) {
    return null;
  }

  const cityIds = uniqSortedCityIds(hydration.cityIds);
  let arabicTokens = [...hydration.arabicTokens]
    .map((x) => String(x).trim())
    .filter(Boolean);
  if (!arabicTokens.length && cityIds.length) {
    arabicTokens = arabicTokensFromCityDocIds(cityIds);
  }

  const display =
    hydration.cityDisplay.trim() ||
    arabicTokens.join('، ') ||
    String(state.orderCity ?? '').trim();

  if (!cityIds.length && !display) {
    return null;
  }

  if (display) {
    state.orderCity = display;
  }

  return {
    cityIds,
    arabicTokens,
    cityDisplay: display,
  };
}

/** بعد دمج بيانات الزائر: تعبئة المدينة ومعرّفات التغطية من التخزين المحلي أو عربة الشراء */
export async function hydrateServiceRequestCoverageFromGuestStorage(
  govService: GovernorateService,
  state: ServiceRequestCoverageFormState
): Promise<ServiceRequestCoverageHydration | null> {
  if (state.requestCoverageCityIds.length) {
    return null;
  }

  const guest = readGuestOrderContact();
  const shopping = readStoredShoppingBuyer();

  const govId = String(
    guest.governorateId ?? shopping?.governorateId ?? ''
  ).trim();
  const cityId = String(guest.cityId ?? shopping?.cityId ?? '').trim();
  let cityDisplay = String(
    state.orderCity || guest.city || shopping?.city || ''
  ).trim();

  if (cityId && govId) {
    const city = await govService.getCityById(govId, cityId);
    const name = city?.name?.trim() ?? '';
    const hydration: ServiceRequestCoverageHydration = {
      cityIds: [cityId],
      arabicTokens: name ? [name] : arabicTokensFromCityDocIds([cityId]),
      cityDisplay: cityDisplay || name,
    };
    return applyServiceRequestCoverageFromUserDoc(hydration, state);
  }

  if (govId && cityDisplay) {
    const resolved =
      (await govService.resolveCityIdByGovernorateAndName(govId, cityDisplay)) ?? '';
    if (resolved) {
      const city = await govService.getCityById(govId, resolved);
      const name = city?.name?.trim() ?? '';
      const hydration: ServiceRequestCoverageHydration = {
        cityIds: [resolved],
        arabicTokens: name ? [name] : arabicTokensFromCityDocIds([resolved]),
        cityDisplay: cityDisplay || name,
      };
      return applyServiceRequestCoverageFromUserDoc(hydration, state);
    }
  }

  if (cityDisplay) {
    const cityIds = valleyCityDocIdsFromDisplay(cityDisplay);
    let arabicTokens = arabicTokensFromCityDocIds(cityIds);
    if (!arabicTokens.length) {
      arabicTokens = [cityDisplay];
    }
    return applyServiceRequestCoverageFromUserDoc(
      { cityIds, arabicTokens, cityDisplay },
      state
    );
  }

  return null;
}

/** يبحث عن محافظة المدينة الأولى لحفظها مع بيانات الزائر */
export async function resolvePrimaryGeoForCoverageCityIds(
  govService: GovernorateService,
  cityIds: string[]
): Promise<{ governorateId: string; cityId: string } | null> {
  const cid = uniqSortedCityIds(cityIds)[0];
  if (!cid) {
    return null;
  }
  if (cid === 'kharga' || cid === 'dakhla') {
    return { governorateId: NEW_VALLEY_GOV_ID, cityId: cid };
  }
  try {
    const govs = await firstValueFrom(govService.getActiveGovernorates());
    for (const g of govs ?? []) {
      const gid = String(g?.id ?? '').trim();
      if (!gid) {
        continue;
      }
      const cities = await firstValueFrom(govService.getCitiesByGovernorate(gid));
      if ((cities ?? []).some((c) => String(c?.id ?? '').trim() === cid)) {
        return { governorateId: gid, cityId: cid };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** حفظ بيانات الزائر بعد إرسال طلب خدمة ناجح */
export async function persistGuestOrderContactAfterServiceSubmit(
  govService: GovernorateService,
  name: string,
  phone: string,
  cityDisplay: string,
  coverageCityIds: string[]
): Promise<void> {
  const geo = await resolvePrimaryGeoForCoverageCityIds(govService, coverageCityIds);
  writeGuestOrderContact(name, phone, cityDisplay, geo);
}

/** قبل الإرسال: اشتقاق order_coverage_city_ids من النص إن لم يُخترَ يدوياً */
export function finalizeServiceRequestCoverageForSubmit(input: {
  requestCoverageCityIds: string[];
  requestCoverageArabic: string[];
  orderCityDisplay: string;
}): { covIds: string[]; cityDisplay: string; arabicTokens: string[] } {
  let covIds = uniqSortedCityIds(input.requestCoverageCityIds);
  const rawCity = String(input.orderCityDisplay ?? '').trim();
  let arabicTokens = [...input.requestCoverageArabic]
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!covIds.length && rawCity) {
    covIds = valleyCityDocIdsFromDisplay(rawCity);
  }
  if (!arabicTokens.length && covIds.length) {
    arabicTokens = arabicTokensFromCityDocIds(covIds);
  }
  const cityDisplay =
    [...new Set(arabicTokens)].join('، ') ||
    rawCity ||
    arabicTokensFromCityDocIds(covIds).join('، ');

  return { covIds, cityDisplay, arabicTokens: [...new Set(arabicTokens)] };
}

/** يعيّن التغطية على حقول المكوّن بعد التهيئة من الملف أو التخزين */
export function assignServiceRequestCoverageToComponent(
  component: {
    requestCoverageCityIds: string[];
    requestCoverageArabic: string[];
    orderData: { city: string };
  },
  applied: ServiceRequestCoverageHydration | null
): void {
  if (!applied) {
    return;
  }
  component.requestCoverageCityIds = [...applied.cityIds];
  component.requestCoverageArabic = [...applied.arabicTokens];
  if (applied.cityDisplay) {
    component.orderData.city = applied.cityDisplay;
  }
}

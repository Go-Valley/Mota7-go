import type { GovernorateService } from '../services/governorate.service';
import {
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

  return { cityIds, arabicTokens, cityDisplay };
}

export function applyServiceRequestCoverageFromUserDoc(
  hydration: ServiceRequestCoverageHydration,
  state: {
    requestCoverageCityIds: string[];
    requestCoverageArabic: string[];
    orderCity: string;
  }
): void {
  if (state.requestCoverageCityIds.length) {
    return;
  }
  if (hydration.cityIds.length) {
    state.requestCoverageCityIds.push(...hydration.cityIds);
    state.requestCoverageArabic.push(...hydration.arabicTokens);
  }
  const display =
    hydration.cityDisplay ||
    hydration.arabicTokens.join('، ') ||
    state.orderCity;
  if (display) {
    state.orderCity = display;
  }
}

/** قبل الإرسال: اشتقاق order_coverage_city_ids من النص إن لم يُخترَ يدوياً */
export function finalizeServiceRequestCoverageForSubmit(input: {
  requestCoverageCityIds: string[];
  requestCoverageArabic: string[];
  orderCityDisplay: string;
}): { covIds: string[]; cityDisplay: string; arabicTokens: string[] } {
  let covIds = uniqSortedCityIds(input.requestCoverageCityIds);
  const rawCity = String(input.orderCityDisplay ?? '').trim();
  let arabicTokens = [...input.requestCoverageArabic].map((x) => String(x).trim()).filter(Boolean);

  if (!covIds.length && rawCity) {
    covIds = valleyCityDocIdsFromDisplay(rawCity);
  }
  if (!arabicTokens.length && covIds.length) {
    arabicTokens = arabicTokensFromCityDocIds(covIds);
  }
  const cityDisplay =
    [...new Set(arabicTokens)].join('، ') || rawCity || arabicTokensFromCityDocIds(covIds).join('، ');

  return { covIds, cityDisplay, arabicTokens: [...new Set(arabicTokens)] };
}

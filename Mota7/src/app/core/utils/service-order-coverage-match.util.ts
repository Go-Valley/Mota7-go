/**
 * مطابقة طلبات الخدمات (توصيل / تعليم / أخرى) مع الإعلان:
 * - إعلان بدون coverage_city_ids: مطابقة مفتاح التطابق القديم بالكامل.
 * - إعلان بدوال coverage_city_ids: تطابق delivery_service_token (أو ما يُقابله)
 *   + تقاطع order_coverage_city_ids مع مصفوفة الإعلان، مع احتياط key===key للطلبات القديمة.
 */
import { normalizeMatchKeyForOrders } from './match-key-normalize';

export const NEW_VALLEY_GOV_ID = 'new_valley';
export const VALLEY_CITY_DOC_IDS = new Set(['kharga', 'dakhla']);

function normTxt(s: string): string {
  return normalizeMatchKeyForOrders(String(s ?? '').trim());
}

export function uniqSortedCityIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x) => typeof x === 'string' && x.trim()))].map((x) => x.trim()).sort();
}

export function orderLooksLegacyValleyCityField(cityRaw: unknown): boolean {
  const n = normTxt(String(cityRaw ?? ''));
  return n.includes(normTxt('خارج')) || n.includes(normTxt('داخل'));
}

export function deriveValleyCanonCity(raw: unknown): string {
  const n = normTxt(String(raw ?? ''));
  if (n.includes(normTxt('داخل'))) return 'الداخلة';
  return 'الخارجة';
}

const DELIVERY_SCOPE_MARKER = '__SCOPE__';
const EDUCATION_SCOPE_MARKER = '+SCOPE__';

export function inferDeliveryServiceFromMatchKey(fullKeyNorm: string): string {
  if (!fullKeyNorm) return '';
  const scopeIx = fullKeyNorm.indexOf(DELIVERY_SCOPE_MARKER);
  if (scopeIx > 0) return fullKeyNorm.slice(0, scopeIx);
  const ix = fullKeyNorm.lastIndexOf('_');
  if (ix <= 0) return fullKeyNorm;
  return fullKeyNorm.slice(0, ix);
}

export function inferEduSubjectFromMatchKey(fullKeyNorm: string): string {
  if (!fullKeyNorm) return '';
  const scopeIx = fullKeyNorm.indexOf(EDUCATION_SCOPE_MARKER);
  if (scopeIx > 0) return fullKeyNorm.slice(0, scopeIx);
  const ix = fullKeyNorm.lastIndexOf('+');
  if (ix <= 0) return fullKeyNorm;
  return fullKeyNorm.slice(0, ix);
}

/** للمطابقة مع الإعلان: IDs محفوظة أو مستنتجة من حقل city */
export function orderCoverageCityIdsForMatch(order: Record<string, unknown>): string[] {
  const stored = uniqSortedCityIds(order['order_coverage_city_ids']);
  if (stored.length) return stored;
  return valleyCityDocIdsFromDisplay(order['city']);
}

export function valleyCityDocIdsFromDisplay(cityRaw: unknown): string[] {
  const n = normTxt(String(cityRaw ?? ''));
  if (!n) return [];
  const ids: string[] = [];
  if (n.includes(normTxt('داخل'))) ids.push('dakhla');
  if (n.includes(normTxt('خارج'))) ids.push('kharga');
  return uniqSortedCityIds(ids);
}

/** يُقطع طرف المفتاح المفترَض لهيئة نوعخدمه_مدينه أو نوع+مدينه */
export function stripTrailingCityFromDeliveryMatchKey(fullKeyNorm: string, cityRaw: unknown): string {
  if (!fullKeyNorm) return '';
  const inferred = inferDeliveryServiceFromMatchKey(fullKeyNorm);
  const canon = normTxt(deriveValleyCanonCity(cityRaw));
  if (!canon) return inferred;
  const suf = '_' + canon;
  if (fullKeyNorm.endsWith(suf) && inferred.length <= fullKeyNorm.length) return inferred;
  return inferred;
}

export function stripTrailingCityFromEducationMatchKey(fullKeyNorm: string, cityRaw: unknown): string {
  if (!fullKeyNorm) return '';
  const inferred = inferEduSubjectFromMatchKey(fullKeyNorm);
  const canon = normTxt(deriveValleyCanonCity(cityRaw));
  if (!canon) return inferred;
  const suf = '+' + canon;
  if (fullKeyNorm.endsWith(suf)) return inferred;
  return inferred;
}

function intersects(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const bs = new Set(b);
  return a.some((x) => bs.has(x));
}

function valleyOnly(ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => VALLEY_CITY_DOC_IDS.has(id));
}

function deliverySvcNorm(adOrOrder: Record<string, unknown>): string {
  const t = normTxt(String(adOrOrder['delivery_service_token'] ?? '').trim());
  if (t) return t;
  const k = normTxt(String(adOrOrder['delivery_match_key'] ?? '').trim());
  return inferDeliveryServiceFromMatchKey(k);
}

function eduSvcNorm(adOrOrder: Record<string, unknown>): string {
  const t = normTxt(String(adOrOrder['education_subject_token'] ?? '').trim());
  if (t) return t;
  const k = normTxt(String(adOrOrder['education_match_key'] ?? '').trim());
  return inferEduSubjectFromMatchKey(k);
}

function otherSvcNorm(adOrOrder: Record<string, unknown>): string {
  const t = normTxt(String(adOrOrder['other_service_token'] ?? '').trim());
  if (t) return t;
  const k = normTxt(String(adOrOrder['other_match_key'] ?? '').trim());
  return inferDeliveryServiceFromMatchKey(k);
}

function matchKeyedService(
  order: Record<string, unknown>,
  ad: Record<string, unknown>,
  orderKeyField: keyof Record<string, unknown>,
  svcOrder: typeof deliverySvcNorm,
  svcAd: typeof deliverySvcNorm
): boolean {
  const adCov = uniqSortedCityIds(ad['coverage_city_ids']);
  const oCov = orderCoverageCityIdsForMatch(order);

  const oKey = normTxt(String(order[orderKeyField] ?? '').trim());
  const adKey = normTxt(String(ad[orderKeyField] ?? '').trim());

  /** إعلان قديم: لا مصفوفة تغطية */
  if (adCov.length === 0) {
    return !!(oKey && adKey && oKey === adKey);
  }

  /** إعلان جديد بتغطية مدن */
  const os = svcOrder(order);
  const ads = svcAd(ad);
  if (!os || !ads || os !== ads) return false;

  if (!oCov.length) {
    return !!(oKey && adKey && oKey === adKey);
  }

  if (valleyOnly(oCov) && valleyOnly(adCov) && oKey && adKey && oKey === adKey) {
    return true;
  }

  return intersects(oCov, adCov);
}

export function deliveryOrderMatches(order: Record<string, unknown>, ad: Record<string, unknown>): boolean {
  return matchKeyedService(order, ad, 'delivery_match_key', deliverySvcNorm, deliverySvcNorm);
}

export function educationOrderMatches(order: Record<string, unknown>, ad: Record<string, unknown>): boolean {
  return matchKeyedService(order, ad, 'education_match_key', eduSvcNorm, eduSvcNorm);
}

export function otherOrderMatches(order: Record<string, unknown>, ad: Record<string, unknown>): boolean {
  return matchKeyedService(order, ad, 'other_match_key', otherSvcNorm, otherSvcNorm);
}

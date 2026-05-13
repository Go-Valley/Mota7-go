import { CitySelection } from '../models/governorate.model';
import { governorateDisplayShort } from './governorate-display-name.util';

/**
 * Format city display with governorate when available
 * @param ad - The advertisement object
 * @returns Formatted location string (e.g., "أسيوط - محافظة أسيوط" or just "أسيوط")
 */
export function formatLocationWithGovernorate(ad: any): string {
  const cityName = ad?.city || '';
  const governorateName = ad?.governorateName || '';
  
  if (cityName && governorateName && cityName !== governorateName) {
    return `${cityName} - ${governorateName}`;
  }
  
  return cityName || 'غير محدد';
}

/**
 * Format location from CitySelection object
 * @param selection - The city selection object
 * @returns Formatted location string
 */
export function formatLocationFromSelection(selection: CitySelection | null): string {
  if (!selection) {
    return 'الكل';
  }
  
  if (selection.isWholeGovernorate && selection.governorateName) {
    return selection.governorateName;
  }
  
  if (selection.cityName && selection.governorateName && selection.cityName !== selection.governorateName) {
    return `${selection.cityName} - ${selection.governorateName}`;
  }
  
  return selection.cityName || selection.governorateName || 'الكل';
}

/**
 * Get short location display (just city name)
 * @param ad - The advertisement object
 * @returns City name only
 */
export function getShortLocationDisplay(ad: any): string {
  return formatAdCoverageDisplay(ad);
}

/** لعرض زر «المنطقة» في الرئيسية عند التصفية من كرت متجر: اسم المحافظة فقط (بدون بادئة «محافظة») */
export function hubHomeGovernorateChipButtonLabelFromAd(ad: {
  governorate_name_ar?: unknown;
}): string | null {
  const g = typeof ad?.governorate_name_ar === 'string' ? ad.governorate_name_ar.trim() : '';
  return g ? governorateDisplayShort(g) : null;
}

/** نص واحد لعرض مدن/مناطق الإعلان أو الطلب على الكروت والأدمن */
export function formatAdCoverageDisplay(ad: {
  city?: unknown;
  coverage_city_ids?: unknown;
  governorate_name_ar?: unknown;
  details?: Record<string, unknown>;
}): string {
  const s = typeof ad?.city === 'string' ? ad.city.trim() : '';
  if (s) return s;
  const ids = Array.isArray(ad?.coverage_city_ids)
    ? (ad.coverage_city_ids as unknown[]).filter((x) => typeof x === 'string' && String(x).trim()).length
    : 0;
  if (ids > 0) {
    const g = typeof ad?.governorate_name_ar === 'string' ? ad.governorate_name_ar.trim() : '';
    return g ? `${ids} منطقة (${g})` : `${ids} منطقة`;
  }
  const loc = ad?.details && (ad.details as Record<string, unknown>)['location'];
  if (typeof loc === 'string' && loc.trim()) return loc.trim();
  return 'غير محدد';
}

/** عرض المدن من مستند طلب (Firestore order) */
export function formatOrderCoverageDisplay(order: Record<string, unknown>): string {
  const c = typeof order['city'] === 'string' ? order['city'].trim() : '';
  if (c) return c;
  const ids = Array.isArray(order['order_coverage_city_ids'])
    ? (order['order_coverage_city_ids'] as unknown[]).filter((x) => typeof x === 'string' && String(x).trim()).length
    : 0;
  if (ids > 0) return `${ids} منطقة`;
  return 'غير محدد';
}

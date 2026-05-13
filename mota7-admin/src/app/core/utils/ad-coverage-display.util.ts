/** يطابق منطق Mota7 formatAdCoverageDisplay / formatOrderCoverageDisplay لعرض موحّد في الأدمن */

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

export function formatOrderCoverageDisplay(order: Record<string, unknown>): string {
  const c = typeof order['city'] === 'string' ? order['city'].trim() : '';
  if (c) return c;
  const ids = Array.isArray(order['order_coverage_city_ids'])
    ? (order['order_coverage_city_ids'] as unknown[]).filter((x) => typeof x === 'string' && String(x).trim()).length
    : 0;
  if (ids > 0) return `${ids} منطقة`;
  return 'غير محدد';
}

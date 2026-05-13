/**
 * مواءمة تخزين رقم مقدم الخدمة في Firestore (إعلانات، device_tokens)
 * مع منطق دوال السحابة resolve-provider-phones / getMota7TokensForPhones.
 */
export function normalizeProviderPhoneForLookup(raw: string | null | undefined): string {
  let d = String(raw ?? '')
    .trim()
    .replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('20') && d.length >= 11) {
    d = '0' + d.slice(2);
  }
  if (d.length === 10 && /^[15]/.test(d)) {
    d = '0' + d;
  }
  return d;
}

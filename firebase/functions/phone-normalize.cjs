/**
 * مواءمة مع Mota7/src/app/core/utils/provider-phone-normalize.util.ts
 */
function normalizeProviderPhoneForLookup(raw) {
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

module.exports = { normalizeProviderPhoneForLookup };

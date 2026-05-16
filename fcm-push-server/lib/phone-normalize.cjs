'use strict';

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

function expandPhonesForTokenLookup(phones) {
  const out = new Set();
  for (const p of phones) {
    const raw = String(p || '').trim();
    if (!raw) continue;
    out.add(raw);
    const n = normalizeProviderPhoneForLookup(raw);
    if (n && n !== raw) out.add(n);
  }
  return [...out];
}

module.exports = { normalizeProviderPhoneForLookup, expandPhonesForTokenLookup };

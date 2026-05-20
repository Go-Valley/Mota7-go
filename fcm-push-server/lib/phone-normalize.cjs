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
    if (!n) continue;
    out.add(n);
    if (n.startsWith('0') && n.length === 11) {
      out.add('2' + n);
      out.add(n.slice(1));
    }
    if (n.startsWith('20') && n.length >= 12) {
      out.add('0' + n.slice(2));
    }
  }
  return [...out];
}

module.exports = { normalizeProviderPhoneForLookup, expandPhonesForTokenLookup };

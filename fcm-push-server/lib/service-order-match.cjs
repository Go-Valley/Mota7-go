'use strict';

const { normalizeMatchKeyForOrders } = require('./match-keys.cjs');

function uniqSorted(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x) => typeof x === 'string' && x.trim()))].sort();
}

function inferBeforeLastSep(nk, sep) {
  if (!nk) return '';
  const ix = nk.lastIndexOf(sep);
  if (ix <= 0) return nk;
  return nk.slice(0, ix);
}

function deliverySvcNorm(obj) {
  const t = normalizeMatchKeyForOrders(String(obj.delivery_service_token ?? '').trim());
  if (t) return t;
  const k = normalizeMatchKeyForOrders(String(obj.delivery_match_key ?? '').trim());
  return inferBeforeLastSep(k, '_');
}

function eduSvcNorm(obj) {
  const t = normalizeMatchKeyForOrders(String(obj.education_subject_token ?? '').trim());
  if (t) return t;
  const k = normalizeMatchKeyForOrders(String(obj.education_match_key ?? '').trim());
  return inferBeforeLastSep(k, '+');
}

function otherSvcNorm(obj) {
  const t = normalizeMatchKeyForOrders(String(obj.other_service_token ?? '').trim());
  if (t) return t;
  const k = normalizeMatchKeyForOrders(String(obj.other_match_key ?? '').trim());
  return inferBeforeLastSep(k, '_');
}

function intersects(a, b) {
  if (!a.length || !b.length) return false;
  const bs = new Set(b);
  return a.some((x) => bs.has(x));
}

const VALLEY = new Set(['kharga', 'dakhla']);

function valleyOnly(ids) {
  return ids.length > 0 && ids.every((id) => VALLEY.has(id));
}

function keyedMatch(order, ad, orderKeyField, svcOrderFn, svcAdFn) {
  const adCov = uniqSorted(ad.coverage_city_ids);
  const oCov = uniqSorted(order.order_coverage_city_ids);

  const oKey = normalizeMatchKeyForOrders(String(order[orderKeyField] ?? '').trim());
  const adKey = normalizeMatchKeyForOrders(String(ad[orderKeyField] ?? '').trim());

  if (!adCov.length) {
    return !!(oKey && adKey && oKey === adKey);
  }

  const os = svcOrderFn(order);
  const ads = svcAdFn(ad);
  if (!os || !ads || os !== ads) return false;

  if (!oCov.length) {
    return !!(oKey && adKey && oKey === adKey);
  }

  if (valleyOnly(oCov) && valleyOnly(adCov) && oKey && adKey && oKey === adKey) {
    return true;
  }

  return intersects(oCov, adCov);
}

function deliveryOrderMatches(order, ad) {
  return keyedMatch(order, ad, 'delivery_match_key', deliverySvcNorm, deliverySvcNorm);
}

function educationOrderMatches(order, ad) {
  return keyedMatch(order, ad, 'education_match_key', eduSvcNorm, eduSvcNorm);
}

function otherOrderMatches(order, ad) {
  return keyedMatch(order, ad, 'other_match_key', otherSvcNorm, otherSvcNorm);
}

module.exports = { deliveryOrderMatches, educationOrderMatches, otherOrderMatches };

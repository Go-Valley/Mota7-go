'use strict';

/**
 * نسخة خادمة تطابق Mota7/src/app/core/utils/service-order-coverage-match.util.ts بقدر المعقول لمطابقة الطلبات مع الإعلانات.
 */

const { normalizeMatchKeyForOrders } = require('./match-keys.cjs');

/** @param {unknown} ids */
function uniqSorted(ids) {
  if (!Array.isArray(ids)) return [];
  const s = [...new Set(ids.filter((x) => typeof x === 'string' && x.trim()))].sort();
  return s;
}

const DELIVERY_SCOPE_MARKER = '__SCOPE__';
const EDUCATION_SCOPE_MARKER = '+SCOPE__';

/** @param {string} nk */
function inferBeforeLastSep(nk, sep) {
  if (!nk) return '';
  const ix = nk.lastIndexOf(sep);
  if (ix <= 0) return nk;
  return nk.slice(0, ix);
}

/** @param {string} nk @param {string} scopeMarker */
function inferDeliveryServiceFromKey(nk) {
  if (!nk) return '';
  const scopeIx = nk.indexOf(DELIVERY_SCOPE_MARKER);
  if (scopeIx > 0) return nk.slice(0, scopeIx);
  return inferBeforeLastSep(nk, '_');
}

/** @param {string} nk */
function inferEduSubjectFromKey(nk) {
  if (!nk) return '';
  const scopeIx = nk.indexOf(EDUCATION_SCOPE_MARKER);
  if (scopeIx > 0) return nk.slice(0, scopeIx);
  return inferBeforeLastSep(nk, '+');
}

/** @param {unknown} cityRaw */
function valleyCityDocIdsFromDisplay(cityRaw) {
  const n = normalizeMatchKeyForOrders(String(cityRaw ?? '').trim());
  if (!n) return [];
  const ids = [];
  if (n.includes(normalizeMatchKeyForOrders('داخل'))) ids.push('dakhla');
  if (n.includes(normalizeMatchKeyForOrders('خارج'))) ids.push('kharga');
  return uniqSorted(ids);
}

/** @param {Record<string, unknown>} order */
function orderCoverageCityIdsForMatch(order) {
  const stored = uniqSorted(order.order_coverage_city_ids);
  if (stored.length) return stored;
  return valleyCityDocIdsFromDisplay(order.city);
}

function deliverySvcNorm(obj) {
  const t = normalizeMatchKeyForOrders(String(obj.delivery_service_token ?? '').trim());
  if (t) return t;
  const k = normalizeMatchKeyForOrders(String(obj.delivery_match_key ?? '').trim());
  return inferDeliveryServiceFromKey(k);
}

function eduSvcNorm(obj) {
  const t = normalizeMatchKeyForOrders(String(obj.education_subject_token ?? '').trim());
  if (t) return t;
  const k = normalizeMatchKeyForOrders(String(obj.education_match_key ?? '').trim());
  return inferEduSubjectFromKey(k);
}

function otherSvcNorm(obj) {
  const t = normalizeMatchKeyForOrders(String(obj.other_service_token ?? '').trim());
  if (t) return t;
  const k = normalizeMatchKeyForOrders(String(obj.other_match_key ?? '').trim());
  return inferDeliveryServiceFromKey(k);
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

/**
 * @param {Record<string, unknown>} order
 * @param {Record<string, unknown>} ad
 * @returns {boolean}
 */
function keyedMatch(order, ad, orderKeyField, svcOrderFn, svcAdFn) {
  const adCov = uniqSorted(ad.coverage_city_ids);
  const oCov = orderCoverageCityIdsForMatch(order);

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

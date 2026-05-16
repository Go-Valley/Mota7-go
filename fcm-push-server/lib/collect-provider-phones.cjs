'use strict';

const criteria = require('../config/recipient-criteria.cjs');
const { normalizeMatchKeyForOrders } = require('./match-keys.cjs');
const { normalizeProviderPhoneForLookup } = require('./phone-normalize.cjs');
const {
  deliveryOrderMatches,
  educationOrderMatches,
  otherOrderMatches,
} = require('./service-order-match.cjs');

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {Record<string, unknown>} order
 * @returns {Promise<string[]>}
 */
async function collectMatchedProviderPhones(db, order) {
  if (criteria.testOverride.enabled) {
    const phones = criteria.testOverride.providerPhones
      .map((p) => normalizeProviderPhoneForLookup(p))
      .filter(Boolean);
    console.log('[collect] testOverride phones', phones);
    return phones;
  }

  const svc = String(order.serviceType || '')
    .trim()
    .toLowerCase();
  const adType = criteria.serviceToAdType[svc];
  if (!adType) {
    console.log('[collect] unknown serviceType', svc);
    return [];
  }

  let rawKey = null;
  let fieldPath = '';
  if (svc === 'delivery') {
    fieldPath = 'delivery_match_key';
    rawKey = order.delivery_match_key ?? null;
  } else if (svc === 'education') {
    fieldPath = 'education_match_key';
    rawKey = order.education_match_key ?? null;
  } else {
    fieldPath = 'other_match_key';
    rawKey = order.other_match_key ?? null;
  }

  let adsQuery = db.collection('ads').where('ad_type', '==', adType);
  if (criteria.providerAdQuery.requireIsAvailable) {
    adsQuery = adsQuery.where('is_available', '==', true);
  }
  const requiredStatus = criteria.providerAdQuery.requireAdStatus;
  if (typeof requiredStatus === 'string' && requiredStatus.trim()) {
    adsQuery = adsQuery.where('status', '==', requiredStatus.trim());
  }

  const snap = await adsQuery.get();
  const phones = new Set();

  for (const d of snap.docs) {
    const ad = d.data() || {};
    let hit = false;

    if (criteria.matching.useCoverageAndServiceToken) {
      if (svc === 'delivery') hit = deliveryOrderMatches(order, ad);
      else if (svc === 'education') hit = educationOrderMatches(order, ad);
      else hit = otherOrderMatches(order, ad);
    }

    if (
      !hit &&
      criteria.matching.allowExactMatchKeyFallback &&
      rawKey &&
      ad[fieldPath]
    ) {
      if (
        normalizeMatchKeyForOrders(String(ad[fieldPath])) ===
        normalizeMatchKeyForOrders(String(rawKey))
      ) {
        hit = true;
      }
    }

    if (hit) {
      const p = normalizeProviderPhoneForLookup(String(ad.owner_phone || '').trim());
      if (p) phones.add(p);
    }
  }

  const list = [...phones];
  console.log('[collect] matched providers', list.length, 'from', snap.size, 'ads');
  return list;
}

module.exports = { collectMatchedProviderPhones };

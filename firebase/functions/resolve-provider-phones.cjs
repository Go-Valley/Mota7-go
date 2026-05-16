/**
 * Mirror logic: جمع أرقام مقدّمي الخدمة المطابقين للطلب.
 */

const admin = require('./require-firebase-admin.cjs');
const criteria = require('./recipient-criteria.cjs');

const {
  normalizeMatchKeyForOrders,
} = require('./match-keys.cjs');
const { normalizeProviderPhoneForLookup } = require('./phone-normalize.cjs');
const {
  deliveryOrderMatches,
  educationOrderMatches,
  otherOrderMatches,
} = require('./service-order-match.cjs');

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {Record<string, unknown>} order
 * @returns {Promise<Set<string>>}
 */
async function collectMatchedProviderPhones(db, order) {
  const svc = String(order.serviceType || '')
    .trim()
    .toLowerCase();

  const adType = criteria.serviceToAdType[svc];
  /** @type {Set<string>} */
  const phones = new Set();

  if (!adType) {
    return phones;
  }

  /** @type {string | undefined | null} */
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

  for (const d of snap.docs) {
    const ad = /** @type {Record<string, unknown>} */ (d.data() || {});

    let hit = false;
    if (criteria.matching.useCoverageAndServiceToken) {
      if (svc === 'delivery') {
        hit = deliveryOrderMatches(
          /** @type {Record<string, unknown>} */ (order),
          ad
        );
      } else if (svc === 'education') {
        hit = educationOrderMatches(
          /** @type {Record<string, unknown>} */ (order),
          ad
        );
      } else {
        hit = otherOrderMatches(
          /** @type {Record<string, unknown>} */ (order),
          ad
        );
      }
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

  return phones;
}

module.exports = { collectMatchedProviderPhones };

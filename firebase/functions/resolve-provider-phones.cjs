/**
 * Mirror logic: Mota7/src/app/core/services/provider-match.service.ts
 * جمع owner_phone لمقدّمي خدمات يُطابقون الطلب وفق نوع الخدمة والمفتاح.
 */

const admin = require('./require-firebase-admin.cjs');

const AD_TYPES_BY_SERVICE = {
  delivery: 'delivery',
  education: 'education',
  other: 'other',
};

const { normalizeMatchKeyForOrders } = require('./match-keys.cjs');

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {Record<string, unknown>} order
 * @returns {Promise<Set<string>>}
 */
async function collectMatchedProviderPhones(db, order) {
  const svc = String(order.serviceType || '')
    .trim()
    .toLowerCase();

  const adType = AD_TYPES_BY_SERVICE[svc];
  const phones = new Set();

  if (!adType) {
    return phones;
  }

  let fieldPath;
  /** @type {string | undefined | null} */
  let rawKey = null;

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

  const targetNorm = rawKey ? normalizeMatchKeyForOrders(String(rawKey)) : '';
  if (!targetNorm) {
    return phones;
  }

  const snap = await db
    .collection('ads')
    .where('ad_type', '==', adType)
    .where('is_available', '==', true)
    .get();

  for (const d of snap.docs) {
    const ad = d.data() || {};
    const adRaw = ad[fieldPath];
    if (!adRaw) continue;
    if (normalizeMatchKeyForOrders(String(adRaw)) === targetNorm) {
      const p = String(ad.owner_phone || '').trim();
      if (p) phones.add(p);
    }
  }

  return phones;
}

module.exports = { collectMatchedProviderPhones };

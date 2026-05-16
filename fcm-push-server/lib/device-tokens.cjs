'use strict';

const criteria = require('../config/recipient-criteria.cjs');
const { expandPhonesForTokenLookup } = require('./phone-normalize.cjs');

const IN_CHUNK = 30;

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string[]} ownerPhones
 * @returns {Promise<string[]>}
 */
async function getTokensForPhones(db, ownerPhones) {
  const tokens = [];
  const expanded = expandPhonesForTokenLookup(ownerPhones);

  for (let i = 0; i < expanded.length; i += IN_CHUNK) {
    const chunk = expanded.slice(i, i + IN_CHUNK);
    if (!chunk.length) continue;

    const q = await db
      .collection('device_tokens')
      .where('app', '==', criteria.deviceTokens.app)
      .where('owner_phone', 'in', chunk)
      .get();

    for (const d of q.docs) {
      const row = d.data() || {};
      if (criteria.deviceTokens.excludeDisabled && row.disabled === true) continue;
      const t = String(row.token || '').trim();
      if (t && !tokens.includes(t)) tokens.push(t);
    }
  }

  console.log('[tokens] phones', ownerPhones.length, '→ tokens', tokens.length);
  return tokens;
}

module.exports = { getTokensForPhones };

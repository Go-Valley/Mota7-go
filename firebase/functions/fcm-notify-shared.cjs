/**
 * مشترك بين مشغلات Firestore لإرسال FCM إلى topic الإداريين وتجميع رسائل مقدّمي الخدمة.
 */

const admin = require('./require-firebase-admin.cjs');
const { normalizeProviderPhoneForLookup } = require('./phone-normalize.cjs');

const ADMIN_TOPIC = 'admin_all';

const IN_CHUNK = 30;
const MULTICAST_CHUNK = 500;

/**
 * يوسّع قائمة الأرقام بصيغ متعددة (قديمة/موحّدة) لمطابقة مستندات device_tokens التاريخية.
 * @param {string[]} phones
 */
function expandPhonesForTokenLookup(phones) {
  const out = new Set();
  for (const p of phones) {
    const raw = String(p || '').trim();
    if (!raw) continue;
    out.add(raw);
    const n = normalizeProviderPhoneForLookup(raw);
    if (n && n !== raw) {
      out.add(n);
    }
  }
  return [...out];
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string[]} ownerPhonesNormalized أرقام هاتف مثل 01xxxxxxxx
 */
async function getMota7TokensForPhones(db, ownerPhonesNormalized) {
  const tokens = [];
  const uniq = [
    ...new Set(ownerPhonesNormalized.map((x) => String(x || '').trim()).filter(Boolean)),
  ];
  const expanded = expandPhonesForTokenLookup(uniq);

  for (let i = 0; i < expanded.length; i += IN_CHUNK) {
    const chunk = expanded.slice(i, i + IN_CHUNK);
    if (!chunk.length) continue;
    const q = await db
      .collection('device_tokens')
      .where('app', '==', 'mota7')
      .where('owner_phone', 'in', chunk)
      .get();

    for (const d of q.docs) {
      const row = d.data() || {};
      const t = String(row.token || '').trim();
      if (!t || row.disabled === true) continue;
      if (!tokens.includes(t)) tokens.push(t);
    }
  }
  return tokens;
}

async function softDisableInvalidTokens(tokens) {
  if (!tokens.length) return;
  const db = admin.firestore();
  const uniq = [...new Set(tokens)].filter(Boolean);

  /** @type {FirebaseFirestore.Batch} */
  let batch = db.batch();
  let opCount = 0;

  async function flush() {
    if (opCount > 0) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  for (const t of uniq) {
    const s = await db.collection('device_tokens').where('token', '==', t).limit(5).get();
    for (const doc of s.docs) {
      batch.update(doc.ref, {
        disabled: true,
        disabledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      opCount++;
      if (opCount >= 400) await flush();
    }
  }
  await flush();
}

/**
 * @param {string[]} tokens
 * @param {{ title?: string; body?: string }} notification
 * @param {Record<string,string>} dataPayload values must be strings
 */
async function messagingSendMulticastChunked(tokens, notification, dataPayload) {
  const messaging = admin.messaging();
  if (!tokens.length) return;

  const data = {};
  for (const [k, v] of Object.entries(dataPayload || {})) {
    data[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }

  const isOrderNew = String(dataPayload?.kind || '') === 'order_new';

  const androidCfg = {
    priority: 'high',
  };
  if (isOrderNew) {
    /** يطابق قناة التطبيق mota7-orders وملف res/raw/talap.mp3 بعد المزامنة من Assets */
    androidCfg.notification = {
      channelId: 'mota7-orders',
      sound: 'talap',
    };
  }

  const payload = {
    notification: {
      title: notification.title || 'مُتاح',
      body: notification.body || '',
    },
    data,
    android: androidCfg,
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  };

  for (let i = 0; i < tokens.length; i += MULTICAST_CHUNK) {
    const chunk = tokens.slice(i, i + MULTICAST_CHUNK);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        ...payload,
      });
      const invalid = [];
      res.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = String(r.error?.code || '');
          if (/not-registered|invalid-registration/i.test(code)) invalid.push(chunk[idx]);
        }
      });
      if (invalid.length) await softDisableInvalidTokens(invalid);
    } catch (e) {
      console.error('[FCM multicast]', e);
    }
  }
}

async function notifyAdminTopic(title, body, dataPayload) {
  const data = {};
  for (const [k, v] of Object.entries(dataPayload || {})) {
    data[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  try {
    await admin.messaging().send({
      topic: ADMIN_TOPIC,
      notification: { title: title || 'متاح لوحة', body: body || '' },
      data,
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    });
  } catch (e) {
    console.error('[FCM notifyAdminTopic]', e);
  }
}

/**
 * تعديل مهمة خارج الإحصاءات وبعض حقول تقييمات المتصل؛ مطابق تقريبي لقواعد Firestore.
 */
function adUpdateIsNonStatsOnly(beforeData, afterData) {
  const ignore = new Set([
    'stats',
    'call_clicks',
    'whatsapp_clicks',
    'impression_count',
    'provider_service_rating_count',
    'provider_service_rating_sum',
    'last_provider_rating',
  ]);
  const keys = new Set([...Object.keys(beforeData || {}), ...Object.keys(afterData || {})]);
  for (const key of keys) {
    if (ignore.has(key)) continue;
    if (JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key])) return true;
  }
  return false;
}

module.exports = {
  ADMIN_TOPIC,
  getMota7TokensForPhones,
  messagingSendMulticastChunked,
  notifyAdminTopic,
  adUpdateIsNonStatsOnly,
};

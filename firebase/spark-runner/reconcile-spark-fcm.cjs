/**
 * تناغم FCM وسير الطلب مع خطة Firebase Spark (بدون Cloud Functions المنشورة).
 * يُستدعى من GitHub Actions باستخدام firebase-admin وحساب خدمة.
 */

const admin = require('firebase-admin');
const {
  notifyOrderCreated,
  notifyOrderCompleted,
  notifyAdCreated,
  notifyAdUpdated,
} = require('../functions/fcm-handlers-internal.cjs');

/**
 * نوافذ رجوع لتقليل ظهرة إجراء واحد؛ قابلة للتهيئة بمتغيرات البيئة.
 * أول تنشيط بعد إضافة Spark runner قد يرسل عدة تنبيهات لمستندات ضمن هذه النوافذ.
 */
function parseHourEnv(key, fallbackH) {
  const v = typeof process.env[key] === 'string' ? Number(process.env[key]) : NaN;
  if (!Number.isFinite(v) || v <= 0) return fallbackH;
  return v;
}

const ORDER_NEW_LOOKBACK_MS =
  parseHourEnv('SPARK_ORDER_NEW_LOOKBACK_HOURS', 12) * 60 * 60 * 1000;
const ORDER_COMPLETED_LOOKBACK_MS =
  parseHourEnv('SPARK_ORDER_COMPLETED_LOOKBACK_HOURS', 12) * 60 * 60 * 1000;

const ORDER_NEW_BATCH = 60;
const ORDER_COMPLETED_BATCH = 40;

const IGNORE_AD_STATS_KEYS = new Set([
  'stats',
  'call_clicks',
  'whatsapp_clicks',
  'impression_count',
  'provider_service_rating_count',
  'provider_service_rating_sum',
  'last_provider_rating',
]);

function sanitizeDocSegment(id) {
  return String(id || '')
    .replace(/\//g, '_')
    .replace(/^\.+/, '')
    .slice(0, 800);
}

function markerOrdNew(orderId) {
  return `ord_new_${sanitizeDocSegment(orderId)}`;
}

function markerOrdCompleted(orderId) {
  return `ord_cmpl_${sanitizeDocSegment(orderId)}`;
}

function markerAdSub(adId) {
  return `ad_sub_${sanitizeDocSegment(adId)}`;
}

/**
 * @param {unknown} x
 * @param {boolean} shallowStripStats
 */
function forCompareStructure(x, shallowStripStats) {
  if (x == null) return x;
  if (typeof x === 'number' || typeof x === 'boolean' || typeof x === 'string') return x;
  if (x instanceof admin.firestore.Timestamp) return { __fire_ts_ms: x.toMillis() };
  if (Array.isArray(x)) return x.map((y) => forCompareStructure(y, false));
  if (typeof x === 'object') {
    const xx = /** @type {Record<string, unknown>} */ (x);
    const o = {};
    for (const k of Object.keys(xx).sort()) {
      if (shallowStripStats && IGNORE_AD_STATS_KEYS.has(k)) continue;
      o[k] = forCompareStructure(xx[k], false);
    }
    return o;
  }
  return x;
}

/**
 * @param {Record<string, unknown>} adData
 */
function substantiveJsonFromAd(adData) {
  const slice = forCompareStructure(adData || {}, true);
  return JSON.stringify(slice);
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {FirebaseFirestore.CollectionReference} markers
 * @param {string[]} markerIds
 * @returns {Promise<Set<string>>} مجموعة الـ marker IDs الموجودة فعلاً
 */
async function batchCheckExistingMarkers(db, markers, markerIds) {
  const existing = new Set();
  if (!markerIds.length) return existing;
  const refs = markerIds.map((id) => markers.doc(id));
  const snaps = await db.getAll(...refs);
  snaps.forEach((s, i) => {
    if (s.exists) existing.add(markerIds[i]);
  });
  return existing;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 */
async function reconcilePendingOrderNotifications(db) {
  const since = admin.firestore.Timestamp.fromMillis(Date.now() - ORDER_NEW_LOOKBACK_MS);
  const snap = await db
    .collection('orders')
    .where('status', '==', 'pending')
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'asc')
    .limit(ORDER_NEW_BATCH)
    .get();

  if (snap.empty) return 0;

  const markers = db.collection('spark_processed_events');
  const mIds = snap.docs.map((d) => markerOrdNew(d.id));
  const alreadySent = await batchCheckExistingMarkers(db, markers, mIds);

  let notified = 0;
  for (let i = 0; i < snap.docs.length; i++) {
    if (alreadySent.has(mIds[i])) continue;
    const doc = snap.docs[i];
    try {
      await notifyOrderCreated(doc.id, doc.data() || {});
      await markers.doc(mIds[i]).set(
        { t: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      notified += 1;
    } catch (e) {
      console.error('[Spark] notifyOrderCreated', doc.id, e);
    }
  }
  return notified;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 */
async function reconcileCompletedOrderNotifications(db) {
  const since = admin.firestore.Timestamp.fromMillis(Date.now() - ORDER_COMPLETED_LOOKBACK_MS);
  const snap = await db
    .collection('orders')
    .where('status', '==', 'completed')
    .where('completedAt', '>=', since)
    .orderBy('completedAt', 'desc')
    .limit(ORDER_COMPLETED_BATCH)
    .get();

  if (snap.empty) return 0;

  const markers = db.collection('spark_processed_events');
  const mIds = snap.docs.map((d) => markerOrdCompleted(d.id));
  const alreadySent = await batchCheckExistingMarkers(db, markers, mIds);

  let notified = 0;
  for (let i = 0; i < snap.docs.length; i++) {
    if (alreadySent.has(mIds[i])) continue;
    const doc = snap.docs[i];
    const after = /** @type {Record<string, unknown>} */ (doc.data() || {});
    try {
      await notifyOrderCompleted(doc.id, { status: '' }, after);
      await markers.doc(mIds[i]).set(
        { t: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      notified += 1;
    } catch (e) {
      console.error('[Spark] notifyOrderCompleted', doc.id, e);
    }
  }
  return notified;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 */
async function processAdSavedJobs(db) {
  const jobsSnap = await db
    .collection('spark_fcm_jobs')
    .orderBy('requestedAt', 'asc')
    .limit(40)
    .get();

  if (jobsSnap.empty) return 0;

  const markers = db.collection('spark_processed_events');
  let processed = 0;

  for (const job of jobsSnap.docs) {
    const row = job.data() || {};
    const kind = String(row.kind || '');
    const adId = typeof row.ad_id === 'string' ? row.ad_id.trim() : '';
    if (!adId || kind !== 'ad_saved') {
      await job.ref.delete().catch(() => {});
      processed += 1;
      continue;
    }

    const adRef = db.collection('ads').doc(adId);
    let adSnap;
    try {
      adSnap = await adRef.get();
    } catch (e) {
      console.error('[Spark] ads get', adId, e);
      continue;
    }

    if (!adSnap.exists) {
      await job.ref.delete().catch(() => {});
      processed += 1;
      continue;
    }

    const ad = /** @type {Record<string, unknown>} */ (adSnap.data() || {});
    const nowJson = substantiveJsonFromAd(ad);
    const mref = markers.doc(markerAdSub(adId));

    try {
      const prevSnap = await mref.get();
      const prevJson = prevSnap.exists && prevSnap.data() ? prevSnap.data().substantiveJson : null;

      if (!prevJson) {
        await notifyAdCreated(adId, ad);
        await mref.set({ substantiveJson: nowJson }, { merge: false });
      } else if (prevJson !== nowJson) {
        const beforeObj =
          typeof prevJson === 'string'
            ? /** @type {Record<string, unknown>} */ (JSON.parse(prevJson))
            : {};
        const afterObj =
          typeof nowJson === 'string'
            ? /** @type {Record<string, unknown>} */ (JSON.parse(nowJson))
            : {};
        await notifyAdUpdated(adId, beforeObj, afterObj);
        await mref.set({ substantiveJson: nowJson }, { merge: false });
      }

      await job.ref.delete().catch(() => {});
      processed += 1;
    } catch (e) {
      console.error('[Spark] processAdSavedJobs', adId, e);
    }
  }

  return processed;
}

async function runSparkFcmOnce() {
  const db = admin.firestore();
  const [ordNew, ordDone, jobs] = await Promise.all([
    reconcilePendingOrderNotifications(db),
    reconcileCompletedOrderNotifications(db),
    processAdSavedJobs(db),
  ]);
  return { ordNew, ordDone, jobs };
}

module.exports = { runSparkFcmOnce, substantiveJsonFromAd, markerOrdNew };

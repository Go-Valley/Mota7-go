/**
 * مسح مهلة الطلبات — مشترَك بين Cloud Functions (جدولة Blaze) ومشغّل Spark الخارجي (GitHub Actions).
 * قبل الاستخدام: تهيئة firebase-admin (initializeApp مرة واحدة).
 */

const admin = require('./require-firebase-admin.cjs');

/** مطابق Mota7: src/app/core/utils/order-lifecycle.util.ts */
const ORDER_ACCEPTED_WINDOW_MS = 30 * 60 * 1000;
const ORDER_ARCHIVE_UI_MS = 10 * 60 * 1000;
const ORDER_DB_RETENTION_AFTER_UI_MS = 30 * 24 * 60 * 60 * 1000;

const SWEEP_BATCH = 450;
const SWEEP_MAX_ITERATIONS = 12;

/** @returns {FirebaseFirestore.Timestamp} */
function cutoffTimestampLessThanAcceptedWindow() {
  return admin.firestore.Timestamp.fromMillis(Date.now() - ORDER_ACCEPTED_WINDOW_MS);
}

/**
 * @param {FirebaseFirestore.Timestamp|number|null|undefined} v
 * @param {number} fallbackMs
 */
function fieldToMillis(v, fallbackMs) {
  if (v == null) return fallbackMs;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  return fallbackMs;
}

async function sweepExpiredPendingOrders() {
  const db = admin.firestore();
  const cutoff = cutoffTimestampLessThanAcceptedWindow();
  let total = 0;
  let iter = 0;
  while (iter < SWEEP_MAX_ITERATIONS) {
    iter += 1;
    const snap = await db
      .collection('orders')
      .where('status', '==', 'pending')
      .where('createdAt', '<=', cutoff)
      .limit(SWEEP_BATCH)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
    total += snap.size;
    if (snap.size < SWEEP_BATCH) break;
  }
  return total;
}

async function sweepExpiredAcceptedOrders() {
  const db = admin.firestore();
  const cutoff = cutoffTimestampLessThanAcceptedWindow();
  let total = 0;
  let iter = 0;
  /** @type {FirebaseFirestore.QueryDocumentSnapshot|null} */
  let pageAfter = null;
  while (iter < SWEEP_MAX_ITERATIONS) {
    iter += 1;
    let qRef = db
      .collection('orders')
      .where('status', '==', 'accepted')
      .where('acceptedAt', '<=', cutoff)
      .orderBy('acceptedAt', 'asc')
      .limit(SWEEP_BATCH);
    if (pageAfter) {
      qRef = qRef.startAfter(pageAfter);
    }
    const snap = await qRef.get();
    if (snap.empty) break;
    pageAfter = snap.docs[snap.docs.length - 1];
    const batch = db.batch();
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();
    const uiArchiveUntil = admin.firestore.Timestamp.fromMillis(nowMs + ORDER_ARCHIVE_UI_MS);
    let queued = 0;
    for (const d of snap.docs) {
      const data = d.data();
      if (data.removedFromUiAt) continue;
      if (data.status !== 'accepted') continue;
      const createdAtMs = fieldToMillis(data.createdAt, nowMs);
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        createdAtMs + ORDER_DB_RETENTION_AFTER_UI_MS
      );
      batch.update(d.ref, {
        status: 'completed',
        completedAt: now,
        expiresAt,
        isArchiving: true,
        uiArchiveUntil,
      });
      queued += 1;
    }
    if (queued > 0) {
      await batch.commit();
      total += queued;
    }
    if (snap.size < SWEEP_BATCH) break;
  }
  return total;
}

module.exports = {
  sweepExpiredPendingOrders,
  sweepExpiredAcceptedOrders,
};

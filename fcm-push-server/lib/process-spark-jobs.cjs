'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const { notifyOrderCreated } = require('./notify-order-created.cjs');

const MAX_ATTEMPTS = 8;

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function processOrderCreatedJobs(db) {
  const jobsSnap = await db
    .collection('spark_fcm_jobs')
    .orderBy('requestedAt', 'asc')
    .limit(80)
    .get();

  if (jobsSnap.empty) return 0;

  let processed = 0;
  for (const job of jobsSnap.docs) {
    const row = job.data() || {};
    const kind = String(row.kind || '');
    const orderId = typeof row.order_id === 'string' ? row.order_id.trim() : '';

    if (kind !== 'order_created' || !orderId) {
      await job.ref.delete().catch(() => {});
      continue;
    }

    const attempts = Number(row.attempts || 0);
    if (attempts >= MAX_ATTEMPTS) {
      console.error('[jobs] giving up', orderId, 'attempts', attempts);
      await job.ref.delete().catch(() => {});
      continue;
    }

    try {
      const snap = await db.collection('orders').doc(orderId).get();
      if (!snap.exists) {
        await job.ref.update({
          attempts: attempts + 1,
          lastError: 'order_not_found',
          lastAttemptAt: FieldValue.serverTimestamp(),
        });
        console.warn('[jobs] order not found yet', orderId, 'attempt', attempts + 1);
        continue;
      }
      const inlineOrder =
        row.order_snapshot && typeof row.order_snapshot === 'object'
          ? row.order_snapshot
          : null;
      await notifyOrderCreated(db, orderId, snap.data() || inlineOrder || {});
      await job.ref.delete().catch(() => {});
      processed += 1;
    } catch (e) {
      const msg = e?.message || String(e);
      console.error('[jobs] order_created', orderId, msg);
      await job.ref
        .update({
          attempts: attempts + 1,
          lastError: msg.slice(0, 500),
          lastAttemptAt: FieldValue.serverTimestamp(),
        })
        .catch(() => {});
    }
  }

  return processed;
}

module.exports = { processOrderCreatedJobs };

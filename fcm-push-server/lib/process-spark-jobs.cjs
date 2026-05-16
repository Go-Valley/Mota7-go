'use strict';

const { notifyOrderCreated } = require('./notify-order-created.cjs');

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

    try {
      const snap = await db.collection('orders').doc(orderId).get();
      if (snap.exists) {
        await notifyOrderCreated(db, orderId, snap.data() || {});
      }
      await job.ref.delete().catch(() => {});
      processed += 1;
    } catch (e) {
      console.error('[jobs] order_created', orderId, e?.message || e);
    }
  }

  return processed;
}

module.exports = { processOrderCreatedJobs };

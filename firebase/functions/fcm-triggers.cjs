/**
 * Cloud Functions (v2 Firestore) — FCM للمقدّمين موصَفون بعرض وdevice_tokens، وللأدمن عبر topic admin_all.
 * Blaze فقط؛ على Spark استخدم firebase/spark-runner مع GitHub Actions.
 */

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const {
  notifyOrderCreated,
  notifyOrderCompleted,
  notifyAdCreated,
  notifyAdUpdated,
} = require('./fcm-handlers-internal.cjs');

const orderCreateOpts = {
  document: 'orders/{orderId}',
  region: 'europe-west1',
};

exports.fcmNotifyOnOrderCreated = onDocumentCreated(orderCreateOpts, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const oid = event.params.orderId;
  await notifyOrderCreated(oid, snap.data() || {});
});

const orderUpdateOpts = {
  document: 'orders/{orderId}',
  region: 'europe-west1',
};

exports.fcmNotifyOnOrderCompleted = onDocumentUpdated(orderUpdateOpts, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const oid = event.params.orderId;
  await notifyOrderCompleted(oid, before, after);
});

const adCreateOpts = {
  document: 'ads/{adId}',
  region: 'europe-west1',
};

exports.fcmNotifyOnAdCreated = onDocumentCreated(adCreateOpts, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const aid = event.params.adId;
  await notifyAdCreated(aid, snap.data() || {});
});

const adUpdateOpts = {
  document: 'ads/{adId}',
  region: 'europe-west1',
};

exports.fcmNotifyOnAdUpdated = onDocumentUpdated(adUpdateOpts, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const aid = event.params.adId;
  await notifyAdUpdated(aid, before, after);
});

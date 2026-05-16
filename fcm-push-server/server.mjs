/**
 * خادم FCM على Render — يرسل إشعارات لمقدّمي الخدمة عند طلب جديد (توصيل / تعليم / أخرى).
 *
 * المسارات:
 *   GET  /                         صحة الخدمة
 *   POST /notify/order-created     { "orderId": "..." }  — Header: X-API-Key
 *   POST /jobs/process             معالجة دفعة من spark_fcm_jobs (للجدولة أو cron)
 *
 * المتغيرات: env.sample.txt
 */
import express from 'express';
import { createRequire } from 'module';
import './init-firebase-admin.mjs';

const require = createRequire(import.meta.url);
const { notifyOrderCreated } = require('../firebase/functions/fcm-handlers-internal.cjs');
const { processOrderCreatedJobs } = require('../firebase/spark-runner/reconcile-spark-fcm.cjs');
const admin = require('../firebase/functions/require-firebase-admin.cjs');

const app = express();
app.use(express.json({ limit: '32kb' }));

const API_KEY = String(process.env.FCM_PUSH_API_KEY || '').trim();
const POLL_MS = Number(process.env.FCM_JOBS_POLL_MS || 0);

function assertApiKey(req, res) {
  if (!API_KEY) {
    res.status(503).json({ error: 'FCM_PUSH_API_KEY not configured on server' });
    return false;
  }
  const key = String(req.headers['x-api-key'] || '').trim();
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Invalid or missing X-API-Key' });
    return false;
  }
  return true;
}

app.get('/', (_req, res) => {
  res.type('text/plain').send('mota7 fcm-push-server OK');
});

app.post('/notify/order-created', async (req, res) => {
  if (!assertApiKey(req, res)) return;
  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
  if (!orderId) {
    return res.status(400).json({ error: 'orderId required' });
  }
  try {
    const db = admin.firestore();
    const snap = await db.collection('orders').doc(orderId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'order not found', orderId });
    }
    const order = snap.data() || {};
    const serviceType = String(order.serviceType || req.body?.serviceType || '').trim().toLowerCase();
    await notifyOrderCreated(orderId, order);
    return res.json({ ok: true, orderId, serviceType: serviceType || order.serviceType });
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[notify/order-created]', orderId, msg);
    return res.status(500).json({ error: msg });
  }
});

app.post('/jobs/process', async (req, res) => {
  if (!assertApiKey(req, res)) return;
  try {
    const db = admin.firestore();
    const processed = await processOrderCreatedJobs(db);
    return res.json({ ok: true, processed });
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[jobs/process]', msg);
    return res.status(500).json({ error: msg });
  }
});

async function pollJobsOnce() {
  if (!API_KEY) return;
  try {
    const db = admin.firestore();
    const n = await processOrderCreatedJobs(db);
    if (n > 0) {
      console.log(`[poll] processed spark_fcm_jobs: ${n}`);
    }
  } catch (e) {
    console.error('[poll]', e?.message || e);
  }
}

const port = Number(process.env.PORT) || 8790;
app.listen(port, () => {
  console.log(`fcm-push-server listening on ${port}`);
  if (POLL_MS > 0) {
    console.log(`polling spark_fcm_jobs every ${POLL_MS}ms`);
    setInterval(pollJobsOnce, POLL_MS);
    void pollJobsOnce();
  }
});

/**
 * Mota7 FCM push server (Render) — كل المنطق هنا، FCM HTTP v1 REST.
 * https://firebase.google.com/docs/reference/fcm/rest
 */
import express from 'express';
import criteria from './config/recipient-criteria.cjs';
import { initFirestore } from './lib/firestore-client.cjs';
import { notifyOrderCreated } from './lib/notify-order-created.cjs';
import { processOrderCreatedJobs } from './lib/process-spark-jobs.cjs';

const app = express();
app.use(express.json({ limit: '32kb' }));

const API_KEY = String(process.env.FCM_PUSH_API_KEY || '').trim();
const POLL_MS = Number(process.env.FCM_JOBS_POLL_MS || 0);

let db;
try {
  db = initFirestore();
  console.log('[init] Firestore ready, project', criteria.projectId);
  if (criteria.testOverride.enabled) {
    console.warn(
      '[init] TEST OVERRIDE ON — only phones:',
      criteria.testOverride.providerPhones.join(', ')
    );
  }
} catch (e) {
  console.error('[init]', e?.message || e);
  process.exit(1);
}

function assertApiKey(req, res) {
  if (!API_KEY) {
    res.status(503).json({ error: 'FCM_PUSH_API_KEY not configured' });
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
  res.json({
    ok: true,
    service: 'mota7-fcm-push-server',
    testOverride: criteria.testOverride.enabled,
  });
});

app.post('/notify/order-created', async (req, res) => {
  if (!assertApiKey(req, res)) return;
  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
  if (!orderId) {
    return res.status(400).json({ error: 'orderId required' });
  }
  try {
    const snap = await db.collection('orders').doc(orderId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'order not found', orderId });
    }
    const result = await notifyOrderCreated(db, orderId, snap.data() || {});
    return res.json({ ok: true, orderId, ...result });
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[notify/order-created]', orderId, msg);
    return res.status(500).json({ error: msg });
  }
});

app.post('/jobs/process', async (req, res) => {
  if (!assertApiKey(req, res)) return;
  try {
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
    const n = await processOrderCreatedJobs(db);
    if (n > 0) console.log('[poll] processed jobs:', n);
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

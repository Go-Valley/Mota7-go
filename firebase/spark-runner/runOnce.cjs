'use strict';

/**
 * تشغيل دورة واحدة: مسّح مهلة الطلبات + تناغم FCM (خطة Spark).
 *
 * المتغير: FIREBASE_SERVICE_ACCOUNT_JSON أو GOOGLE_APPLICATION_CREDENTIALS_JSON
 * بصيغة JSON كامل لحساب خدمة (إعدادات المشروع ← حساب خدمة).
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const credentialJsonRaw =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
const credentialPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

function loadCredential() {
  if (credentialJsonRaw && String(credentialJsonRaw).trim()) {
    try {
      return admin.credential.cert(JSON.parse(String(credentialJsonRaw)));
    } catch (e) {
      console.error('Invalid JSON in FIREBASE_SERVICE_ACCOUNT_JSON:', /** @type {Error} */ (e).message);
      process.exit(1);
    }
  }
  if (credentialPathEnv && fs.existsSync(String(credentialPathEnv))) {
    try {
      return admin.credential.cert(
        JSON.parse(fs.readFileSync(String(credentialPathEnv), 'utf8'))
      );
    } catch (e) {
      console.error('Failed to read GOOGLE_APPLICATION_CREDENTIALS file:', /** @type {Error} */ (e).message);
      process.exit(1);
    }
  }
  console.error(
    'Credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON (secret) or GOOGLE_APPLICATION_CREDENTIALS path.'
  );
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: loadCredential() });
}

/** @param {unknown} err */
function isQuotaExhausted(err) {
  if (!err || typeof err !== 'object') return false;
  const e = /** @type {Record<string, unknown>} */ (err);
  if (e.code === 8 || e.code === 'resource-exhausted') return true;
  if (typeof e.details === 'string' && /quota exceeded/i.test(e.details)) return true;
  if (typeof e.message === 'string' && /RESOURCE_EXHAUSTED|quota exceeded/i.test(e.message)) return true;
  return false;
}

const sweep = require(path.join(__dirname, '../functions/order-sweep-logic.cjs'));
const { runSparkFcmOnce } = require('./reconcile-spark-fcm.cjs');

(async () => {
  let quotaHit = false;

  const deleted = await sweep.sweepExpiredPendingOrders().catch((e) => {
    if (isQuotaExhausted(e)) {
      console.warn('[WARN] Firestore quota exceeded during sweep pending — skipping this cycle.');
      quotaHit = true;
    } else {
      console.error('Sweep pending:', e);
    }
    return 0;
  });

  const autoCompleted = await sweep.sweepExpiredAcceptedOrders().catch((e) => {
    if (isQuotaExhausted(e)) {
      console.warn('[WARN] Firestore quota exceeded during sweep accepted — skipping this cycle.');
      quotaHit = true;
    } else {
      console.error('Sweep accepted:', e);
    }
    return 0;
  });

  if (deleted || autoCompleted) {
    console.log(`Order sweep: deleted_pending=${deleted} auto_completed_accepted=${autoCompleted}`);
  }

  let fcm = { ordNew: 0, shopNew: 0, ordDone: 0, jobs: 0 };
  if (!quotaHit) {
    fcm = await runSparkFcmOnce().catch((e) => {
      if (isQuotaExhausted(e)) {
        console.warn('[WARN] Firestore quota exceeded during FCM reconcile — skipping this cycle.');
        quotaHit = true;
      } else {
        console.error('FCM reconcile:', e);
      }
      return { ordNew: 0, shopNew: 0, ordDone: 0, jobs: 0 };
    });
  }

  console.log(
    JSON.stringify({
      spark_fcm_ord_new_notified: fcm.ordNew,
      spark_fcm_shop_new_notified: fcm.shopNew,
      spark_fcm_ord_completed_notified: fcm.ordDone,
      spark_fcm_ad_jobs_processed: fcm.jobs,
      quota_exhausted: quotaHit,
    })
  );

  process.exit(0);
})();

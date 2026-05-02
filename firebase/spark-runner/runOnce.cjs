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

const sweep = require(path.join(__dirname, '../functions/order-sweep-logic.cjs'));
const { runSparkFcmOnce } = require('./reconcile-spark-fcm.cjs');

(async () => {
  const deleted = await sweep.sweepExpiredPendingOrders().catch((e) => {
    console.error('Sweep pending:', e);
    return 0;
  });
  const autoCompleted = await sweep.sweepExpiredAcceptedOrders().catch((e) => {
    console.error('Sweep accepted:', e);
    return 0;
  });
  if (deleted || autoCompleted) {
    console.log(`Order sweep: deleted_pending=${deleted} auto_completed_accepted=${autoCompleted}`);
  }

  const fcm = await runSparkFcmOnce().catch((e) => {
    console.error('FCM reconcile:', e);
    return { ordNew: 0, ordDone: 0, jobs: 0 };
  });

  console.log(
    JSON.stringify({
      spark_fcm_ord_new_notified: fcm.ordNew,
      spark_fcm_ord_completed_notified: fcm.ordDone,
      spark_fcm_ad_jobs_processed: fcm.jobs,
    })
  );

  process.exit(0);
})();

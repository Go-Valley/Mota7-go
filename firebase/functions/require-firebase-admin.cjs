'use strict';

/**
 * تحميل firebase-admin موحّد (Functions / spark-runner / fcm-push-server على Render).
 * يهيّئ التطبيق الافتراضي مرة واحدة عند الحاجة.
 */
const fs = require('fs');
const path = require('path');

/** @param {string} moduleDir absolute path to firebase-admin package dir */
function tryRequireFromDir(moduleDir) {
  const pkgJson = path.join(moduleDir, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    return null;
  }
  return /** @type {typeof import('firebase-admin')} */ (require(moduleDir));
}

function loadAdminModule() {
  try {
    return require('firebase-admin');
  } catch (firstErr) {
    const fallbacks = [
      path.join(__dirname, '../spark-runner/node_modules/firebase-admin'),
      path.join(__dirname, '../../fcm-push-server/node_modules/firebase-admin'),
    ];
    for (const dir of fallbacks) {
      try {
        const mod = tryRequireFromDir(dir);
        if (mod) return mod;
      } catch {
        /* try next */
      }
    }
    throw firstErr;
  }
}

/**
 * @param {import('firebase-admin')} admin
 */
function ensureDefaultApp(admin) {
  if (admin.apps.length > 0) {
    return;
  }

  const credentialJsonRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (credentialJsonRaw && String(credentialJsonRaw).trim()) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(String(credentialJsonRaw))),
      });
    } catch (e) {
      console.error(
        'Invalid FIREBASE_SERVICE_ACCOUNT_JSON:',
        /** @type {Error} */ (e).message
      );
      throw e;
    }
    return;
  }

  // Cloud Functions / GCP runtime (Application Default Credentials)
  admin.initializeApp();
}

const admin = loadAdminModule();
ensureDefaultApp(admin);

module.exports = admin;

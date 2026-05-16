/**
 * تهيئة firebase-admin قبل تحميل وحدات firebase/functions (CommonJS).
 */
import admin from 'firebase-admin';

const credentialJsonRaw =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

function loadCredential() {
  if (credentialJsonRaw && String(credentialJsonRaw).trim()) {
    try {
      return admin.credential.cert(JSON.parse(String(credentialJsonRaw)));
    } catch (e) {
      console.error(
        'Invalid JSON in FIREBASE_SERVICE_ACCOUNT_JSON:',
        /** @type {Error} */ (e).message
      );
      process.exit(1);
    }
  }
  console.error(
    'Credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON on Render (full service account JSON).'
  );
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: loadCredential() });
}

export default admin;

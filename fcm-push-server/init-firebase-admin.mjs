/**
 * تهيئة firebase-admin قبل تحميل وحدات firebase/functions (CommonJS).
 * يستخدم require-firebase-admin.cjs حتى لا يكون هناك نسختان (ESM vs CJS) على Render.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('../firebase/functions/require-firebase-admin.cjs');

if (!admin.apps.length) {
  console.error(
    'Firebase Admin failed to initialize. Set FIREBASE_SERVICE_ACCOUNT_JSON on Render.'
  );
  process.exit(1);
}

export default admin;

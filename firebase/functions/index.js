/**
 * Legacy Callable — يتطلب خطة Blaze. التطبيقات تستخدم الآن cloudinary-delete-proxy/ بدلاً من ذلك.
 */
const functions = require('firebase-functions');
const cloudinary = require('cloudinary').v2;

const ALLOWED_PREFIXES = ['banners/', 'products/', 'stores/'];

function validatePublicIds(publicIds) {
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'publicIds مطلوبة');
  }
  if (publicIds.length > 25) {
    throw new functions.https.HttpsError('invalid-argument', 'عدد كبير جداً');
  }
  for (const id of publicIds) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new functions.https.HttpsError('invalid-argument', 'معرف غير صالح');
    }
    const ok = ALLOWED_PREFIXES.some((p) => id.startsWith(p));
    if (!ok) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'مسموح فقط بمجلدات banners و products و stores'
      );
    }
  }
}

exports.deleteCloudinaryAssets = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول');
  }

  const publicIds = data.publicIds;
  validatePublicIds(publicIds);

  const cfg = functions.config().cloudinary || {};
  const cloud_name = cfg.cloud_name;
  const api_key = cfg.api_key;
  const api_secret = cfg.api_secret;

  if (!cloud_name || !api_key || !api_secret) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Cloudinary غير مهيأ على الخادم (functions:config)'
    );
  }

  cloudinary.config({ cloud_name, api_key, api_secret });

  const results = [];
  for (const publicId of publicIds) {
    const r = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    results.push({ publicId, result: r.result });
  }

  return { ok: true, results };
});

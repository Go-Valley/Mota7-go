/**
 * Legacy Callable — يتطلب خطة Blaze. التطبيقات تستخدم الآن cloudinary-delete-proxy/ بدلاً من ذلك.
 */
const functions = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;
const {
  sweepExpiredPendingOrders,
  sweepExpiredAcceptedOrders,
} = require('./order-sweep-logic.cjs');

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * الطلب المعلّق: حذف نهائي من Firestore بعد 30 دقيقة من الإنشاء (حتى لو تطبيق العميل مغلق).
 * الطلب المقبول: إكمال تلقائي بنفس حقول الإكمال اليدوي بعد 30 دقيقة من وقت القبول.
 *
 * يتطلّب خطة Blaze + تفعيل Cloud Scheduler بعد النشر الأول.
 * على Spark: استخدم firebase/spark-runner وجدولة GitHub Actions.
 */
exports.processOrderDeadlineSweep = onSchedule(
  {
    schedule: 'every 2 minutes',
    timeZone: 'Africa/Cairo',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const deleted = await sweepExpiredPendingOrders().catch((e) => {
      console.error('processOrderDeadlineSweep pending:', e);
      return 0;
    });
    const completed = await sweepExpiredAcceptedOrders().catch((e) => {
      console.error('processOrderDeadlineSweep accepted:', e);
      return 0;
    });
    if (deleted > 0 || completed > 0) {
      console.log(
        `processOrderDeadlineSweep: deleted_pending=${deleted} auto_completed_accepted=${completed}`
      );
    }
    return null;
  }
);

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

Object.assign(exports, require('./fcm-triggers.cjs'));

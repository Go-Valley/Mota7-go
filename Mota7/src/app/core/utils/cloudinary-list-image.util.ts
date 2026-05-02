/**
 * تحويل روابط Cloudinary لنسخ أخف للقوائم والمعرض (تقليل باندوidth).
 * يدعم روابط res.cloudinary.com وأي رابط يحتوي المسار /upload/ (مثل CNAME).
 */

const LIST_TRANSFORM = 'c_limit,w_420,h_420,f_auto,q_auto:eco';
const GALLERY_TRANSFORM = 'c_limit,w_960,f_auto,q_auto:good';

function firstPathSegment(tail: string): string {
  return tail.split('/')[0] || '';
}

/** يبدو أن تحويلات مضافة مسبقاً (مثل c_limit,w_400) */
function looksLikeCloudinaryTransform(segment: string): boolean {
  if (!segment) return false;
  if (segment.includes(',')) return true;
  return /^(c_|w_|h_|f_|q_|g_|e_)/i.test(segment);
}

/**
 * يزيل أول مقطع مسار يطابق v123 فقط (إصدار Cloudinary الاختياري).
 * إصدارات قديمة في Firestore تسبب 404 بينما الـ public_id لا يزال موجوداً؛
 * التوصيل بدون v... يحل إلى أحدث نسخة.
 */
function stripFirstCloudinaryVersionSegment(tail: string): string {
  const segs = tail.split('/');
  const i = segs.findIndex((s) => /^v\d+$/.test(s));
  if (i === -1) return tail;
  const next = [...segs];
  next.splice(i, 1);
  return next.join('/');
}

/**
 * يُدرج تحويل Cloudinary بعد /upload/، ويُسقِط إصدار v123 من المسار عند وجوده.
 */
export function cloudinaryTransformUrl(
  url: string | null | undefined,
  transformation: string
): string {
  const u = (url || '').trim();
  if (!u) return '';
  if (!u.includes('/upload/')) return u;

  const parts = u.split('/upload/');
  if (parts.length < 2) return u;
  const head = parts.slice(0, -1).join('/upload/') + '/upload/';
  let tail = stripFirstCloudinaryVersionSegment(parts[parts.length - 1]);

  const seg0 = firstPathSegment(tail);
  if (looksLikeCloudinaryTransform(seg0)) {
    return head + tail;
  }

  tail = `${transformation}/${tail}`;
  return head + tail;
}

/** إزالة مقطع v123 من رابط التوصيل فقط (بدون إضافة تحويلات). مفيد بعد الرفع أو لروابط مخزنة. */
export function cloudinaryDeliveryUrlDropVersion(url: string | null | undefined): string {
  const u = (url || '').trim();
  if (!u || !u.includes('/upload/')) return u;
  const parts = u.split('/upload/');
  if (parts.length < 2) return u;
  const head = parts.slice(0, -1).join('/upload/') + '/upload/';
  const tail = stripFirstCloudinaryVersionSegment(parts[parts.length - 1]);
  return head + tail;
}

export function cloudinaryListThumbnailUrl(url: string | null | undefined): string {
  return cloudinaryTransformUrl(url, LIST_TRANSFORM);
}

/** صور معرض التفاصيل — أكبر قليلاً من الكرت لكن مضغوطة */
export function cloudinaryGalleryImageUrl(url: string | null | undefined): string {
  return cloudinaryTransformUrl(url, GALLERY_TRANSFORM);
}

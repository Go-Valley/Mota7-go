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
 * يُدرج تحويل Cloudinary بعد /upload/ مع احترام مجلد الإصدار v123/
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
  let tail = parts[parts.length - 1];

  const seg0 = firstPathSegment(tail);
  if (looksLikeCloudinaryTransform(seg0)) {
    return u;
  }

  /* التحويلات تسبق المسار كاملاً (بما فيه v123/ إن وُجد) */
  tail = `${transformation}/${tail}`;
  return head + tail;
}

export function cloudinaryListThumbnailUrl(url: string | null | undefined): string {
  return cloudinaryTransformUrl(url, LIST_TRANSFORM);
}

/** صور معرض التفاصيل — أكبر قليلاً من الكرت لكن مضغوطة */
export function cloudinaryGalleryImageUrl(url: string | null | undefined): string {
  return cloudinaryTransformUrl(url, GALLERY_TRANSFORM);
}

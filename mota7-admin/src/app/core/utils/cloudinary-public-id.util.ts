export function tryParseCloudinaryPublicIdFromUrl(
  url: string,
  cloudHost: string = 'res.cloudinary.com'
): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }
  if (!url.includes(cloudHost)) {
    return null;
  }
  const noQuery = url.split('?')[0];
  const idx = noQuery.indexOf('/upload/');
  if (idx < 0) {
    return null;
  }
  const tail = noQuery.slice(idx + '/upload/'.length);
  const segments = tail.split('/').filter(Boolean);
  let i = 0;
  while (i < segments.length && segments[i].includes(',')) {
    i++;
  }
  if (i < segments.length && /^v\d+$/i.test(segments[i])) {
    i++;
  }
  if (i >= segments.length) {
    return null;
  }
  let id = segments.slice(i).join('/');
  id = id.replace(/\.(jpe?g|png|gif|webp|avif|bmp)$/i, '');
  return id || null;
}

const CLOUDINARY_DELETE_ALLOWED_PREFIXES = ['banners/', 'products/', 'stores/'] as const;

function pushPublicIdFromCloudinaryUrl(ids: string[], url: unknown): void {
  if (typeof url !== 'string' || !url.trim()) {
    return;
  }
  const parsed = tryParseCloudinaryPublicIdFromUrl(url);
  if (!parsed) {
    return;
  }
  if (!CLOUDINARY_DELETE_ALLOWED_PREFIXES.some((p) => parsed.startsWith(p))) {
    return;
  }
  ids.push(parsed);
}

/** نفس منطق Mota7: حقول مخزنة + استخراج من روابط الصور للإعلانات القديمة. */
export function collectCloudinaryPublicIdsFromAd(ad: Record<string, unknown> | null | undefined): string[] {
  if (!ad) {
    return [];
  }
  const ids: string[] = [];
  const logoId = ad['logo_cloudinary_public_id'];
  if (typeof logoId === 'string' && logoId.trim()) {
    ids.push(logoId.trim());
  }
  const details = ad['details'] as Record<string, unknown> | undefined;
  const stored = details?.['images_cloudinary_public_ids'];
  if (Array.isArray(stored)) {
    for (const x of stored) {
      if (typeof x === 'string' && x.trim()) {
        ids.push(x.trim());
      }
    }
  }
  pushPublicIdFromCloudinaryUrl(ids, ad['logo']);
  const imgs = details?.['images'];
  if (Array.isArray(imgs)) {
    for (const u of imgs) {
      pushPublicIdFromCloudinaryUrl(ids, u);
    }
  }
  return [...new Set(ids)];
}

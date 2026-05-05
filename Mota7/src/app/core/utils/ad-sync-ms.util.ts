/** وقت مزامنة الإعلان: يفضّل updated_at ثم created_at — مشترك بين الرئيسية والخدمات */

export function firestoreTimestampToMs(v: unknown): number {
  if (v == null) return 0;
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === 'object' && v !== null && 'seconds' in v) {
    const s = v as { seconds: number; nanoseconds?: number };
    const sec = typeof s.seconds === 'number' ? s.seconds : 0;
    const ns = typeof s.nanoseconds === 'number' ? s.nanoseconds : 0;
    return sec * 1000 + Math.floor(ns / 1e6);
  }
  return 0;
}

export function createdAtMsForSort(ad: { created_at?: unknown } | null | undefined): number {
  return firestoreTimestampToMs(ad?.created_at);
}

export function adSyncMillis(ad: { updated_at?: unknown; created_at?: unknown } | null | undefined): number {
  return Math.max(firestoreTimestampToMs(ad?.updated_at), createdAtMsForSort(ad ?? undefined));
}

export function computeHighWaterMsFromAds(ads: unknown[]): number {
  let m = 0;
  for (const a of ads) {
    if (a && typeof a === 'object') {
      m = Math.max(m, adSyncMillis(a as { updated_at?: unknown; created_at?: unknown }));
    }
  }
  return m;
}

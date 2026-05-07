/**
 * ترتيب يدوي في لوحة الإعلانات: مستويات 1–5 فقط للعرض على الكارت.
 */
export function manualSortLevel1to5(ad: unknown): number | null {
  const o = ad as { sort_order?: unknown } | null | undefined;
  const n = Number(o?.sort_order);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    return null;
  }
  return Math.floor(n);
}

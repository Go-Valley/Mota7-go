/** فتح قسم معيّن في الرئيسية بعد الانتقال من تبويب آخر (مثلاً العربة → المنتجات). */
export const MOTA7_PENDING_HOME_CATEGORY_KEY = 'mota7_pending_home_category';

export function setPendingHomeCategory(categoryId: string): void {
  try {
    sessionStorage.setItem(MOTA7_PENDING_HOME_CATEGORY_KEY, categoryId);
  } catch {
    /* ignore */
  }
}

export function takePendingHomeCategory(): string | null {
  try {
    const id = sessionStorage.getItem(MOTA7_PENDING_HOME_CATEGORY_KEY);
    if (id) {
      sessionStorage.removeItem(MOTA7_PENDING_HOME_CATEGORY_KEY);
    }
    return id;
  } catch {
    return null;
  }
}

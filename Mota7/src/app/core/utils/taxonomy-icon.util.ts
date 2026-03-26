/**
 * مفاتيح الأيقونات القادمة من Firestore (ماديريال/وصفية) → أسماء ion-icon مدعومة في التطبيق.
 */
const FIRESTORE_ICON_TO_IONICON: Record<string, string> = {
  shopping_cart: 'cart',
  utensils: 'restaurant',
  checkroom: 'shirt',
  medical_services: 'medkit',
  devices: 'hardware-chip',
  weekend: 'bed',
  construction: 'hammer',
  directions_car: 'car-sport',
  local_mall: 'storefront',
  storefront: 'storefront',
  basket: 'basket',
  bandage: 'bandage',
  restaurant: 'restaurant',
  shirt: 'shirt',
  tv: 'tv',
  hammer: 'hammer',
  bed: 'bed',
  car: 'car',
  bicycle: 'bicycle',
  bus: 'bus',
  school: 'school',
  construct: 'construct',
  cart: 'cart',
  'car-sport': 'car-sport',
  'phone-portrait': 'phone-portrait',
  home: 'home',
  watch: 'watch',
  business: 'business',
  'ellipsis-horizontal': 'ellipsis-horizontal',
  grid: 'grid',
};

export function resolveTaxonomyIcon(iconKey: string | undefined | null): string {
  const k = String(iconKey ?? '').trim();
  if (!k) return 'grid';
  return FIRESTORE_ICON_TO_IONICON[k] || k;
}

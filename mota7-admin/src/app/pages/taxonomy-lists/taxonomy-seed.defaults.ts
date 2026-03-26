/**
 * قيم افتراضية لمستندات Categories — تُستورد من ثوابت تطبيق Mota7 (مصدر واحد مع التطبيق).
 */
import { DELIVERY_CATEGORY } from '@mota7-app/core/constants/delivery-data';
import { EDUCATION_CATEGORY } from '@mota7-app/core/constants/educational-data';
import { OTHER_SERVICES_DATA } from '@mota7-app/core/constants/other-services-data';
import { PRODUCTS_CATEGORY } from '@mota7-app/core/constants/products-data';
import { STORES_CATEGORIES_DATA } from '@mota7-app/core/constants/stores-data';

/** مفاتيح مستندات مجموعة Categories في Firestore */
export const CATEGORY_DOC_IDS = [
  'transportation',
  'education',
  'other_services',
  'products',
  'stores_types',
] as const;

export type CategoryDocId = (typeof CATEGORY_DOC_IDS)[number];

export function buildDefaultCategoryPayload(docId: CategoryDocId): Record<string, unknown> {
  switch (docId) {
    case 'transportation':
      return { ...DELIVERY_CATEGORY };
    case 'education':
      return { ...EDUCATION_CATEGORY };
    case 'other_services':
      return { ...OTHER_SERVICES_DATA };
    case 'products':
      return {
        ...PRODUCTS_CATEGORY,
        active: true,
        order: 4,
        nameEn: 'Products',
      };
    case 'stores_types':
      return {
        ...STORES_CATEGORIES_DATA,
        active: true,
        order: 5,
        nameAr: 'المتاجر',
        nameEn: 'Stores',
      };
    default:
      return {};
  }
}

export function allDefaultCategoryPayloads(): Record<CategoryDocId, Record<string, unknown>> {
  return {
    transportation: buildDefaultCategoryPayload('transportation'),
    education: buildDefaultCategoryPayload('education'),
    other_services: buildDefaultCategoryPayload('other_services'),
    products: buildDefaultCategoryPayload('products'),
    stores_types: buildDefaultCategoryPayload('stores_types'),
  };
}

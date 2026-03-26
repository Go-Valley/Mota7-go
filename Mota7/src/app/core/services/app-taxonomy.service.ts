import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, combineLatest, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { DELIVERY_CATEGORY } from '../constants/delivery-data';
import { EDUCATION_CATEGORY } from '../constants/educational-data';
import { OTHER_SERVICES_DATA } from '../constants/other-services-data';
import { PRODUCTS_CATEGORY } from '../constants/products-data';
import { STORES_CATEGORIES_DATA } from '../constants/stores-data';
import { resolveTaxonomyIcon } from '../utils/taxonomy-icon.util';

export interface TaxonomyBundle {
  deliveryItems: any[];
  educationItems: any[];
  otherItems: any[];
  productItems: any[];
  storeItems: any[];
  /** أي مستندات جُلبت من Firestore وفيها items غير فارغ */
  loadedFromFirebase: boolean;
}

function mapDeliveryItem(raw: any): any {
  return {
    ...raw,
    id: raw.id,
    nameAr: raw.nameAr ?? '',
    nameEn: raw.nameEn ?? '',
    icon: resolveTaxonomyIcon(raw.icon),
    active: raw.active !== false,
    order: typeof raw.order === 'number' ? raw.order : 0,
    value: raw.value ?? raw.id,
  };
}

function mapEducationItem(raw: any): any {
  return {
    id: raw.id,
    nameAr: raw.nameAr ?? '',
    nameEn: raw.nameEn ?? '',
    subjects: Array.isArray(raw.subjects) ? [...raw.subjects] : [],
    icon: raw.icon != null ? resolveTaxonomyIcon(raw.icon) : undefined,
  };
}

function mapProductItem(raw: any): any {
  return {
    id: raw.id,
    nameAr: raw.nameAr ?? '',
    nameEn: raw.nameEn ?? '',
    icon: resolveTaxonomyIcon(raw.icon),
    subcategories: Array.isArray(raw.subcategories) ? [...raw.subcategories] : [],
  };
}

function mapStoreItem(raw: any): any {
  return {
    id: raw.id,
    nameAr: raw.nameAr ?? '',
    nameEn: raw.nameEn ?? '',
    icon: resolveTaxonomyIcon(raw.icon),
  };
}

function mapOtherItem(raw: any): any {
  return {
    id: raw.id,
    nameAr: raw.nameAr ?? '',
    nameEn: raw.nameEn ?? '',
    icon: raw.icon != null ? resolveTaxonomyIcon(raw.icon) : undefined,
  };
}

function pickItems(
  fsDoc: any,
  fallback: any[],
  mapper: (x: any) => any
): { items: any[]; fromFs: boolean } {
  const arr = fsDoc?.items;
  if (Array.isArray(arr) && arr.length > 0) {
    return { items: arr.map(mapper), fromFs: true };
  }
  return { items: fallback.map(mapper), fromFs: false };
}

@Injectable({ providedIn: 'root' })
export class AppTaxonomyService {
  private firestore = inject(Firestore);

  /** تدفق موحّد لقوائم التصنيفات (تحديث فوري عند تغيير Firestore) مع احتياط من الثوابت */
  readonly bundle$: Observable<TaxonomyBundle> = combineLatest([
    this.safeDoc$('transportation'),
    this.safeDoc$('education'),
    this.safeDoc$('other_services'),
    this.safeDoc$('products'),
    this.safeDoc$('stores_types'),
  ]).pipe(
    map(([t, e, o, p, s]) => {
      const d = pickItems(t, DELIVERY_CATEGORY.items, mapDeliveryItem);
      const ed = pickItems(e, EDUCATION_CATEGORY.items, mapEducationItem);
      const ot = pickItems(o, OTHER_SERVICES_DATA.items, mapOtherItem);
      const pr = pickItems(p, PRODUCTS_CATEGORY.items, mapProductItem);
      const st = pickItems(s, STORES_CATEGORIES_DATA.items, mapStoreItem);
      const loadedFromFirebase = d.fromFs || ed.fromFs || ot.fromFs || pr.fromFs || st.fromFs;
      return {
        deliveryItems: d.items,
        educationItems: ed.items,
        otherItems: ot.items,
        productItems: pr.items,
        storeItems: st.items,
        loadedFromFirebase,
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private safeDoc$(docId: string): Observable<any> {
    return docData(doc(this.firestore, 'Categories', docId)).pipe(
      catchError(() => of(null))
    );
  }
}

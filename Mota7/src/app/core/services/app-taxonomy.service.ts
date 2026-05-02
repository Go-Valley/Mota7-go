import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, combineLatest, of } from 'rxjs';
import { map, catchError, shareReplay, startWith, tap } from 'rxjs/operators';
import { DELIVERY_CATEGORY } from '../constants/delivery-data';
import { EDUCATION_CATEGORY } from '../constants/educational-data';
import { OTHER_SERVICES_DATA } from '../constants/other-services-data';
import { PRODUCTS_CATEGORY } from '../constants/products-data';
import { STORES_CATEGORIES_DATA } from '../constants/stores-data';
import { resolveTaxonomyIcon } from '../utils/taxonomy-icon.util';
import { expandOtherCategoryItemsForBundle } from '../utils/other-category-display.util';
import { FirestoreCacheService } from './firestore-cache.service';

export interface TaxonomyBundle {
  deliveryItems: any[];
  educationItems: any[];
  otherItems: any[];
  productItems: any[];
  storeItems: any[];
  /** صدرت أي قيمة من `docData` لمستند Categories/* ويحتوي على حقل `items` كمصفوفة (حتى لو فارغة) */
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
    order:
      typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : undefined,
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
    order:
      typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : undefined,
  };
}

function mapProductItem(raw: any): any {
  return {
    id: raw.id,
    nameAr: raw.nameAr ?? '',
    nameEn: raw.nameEn ?? '',
    icon: resolveTaxonomyIcon(raw.icon),
    subcategories: Array.isArray(raw.subcategories) ? [...raw.subcategories] : [],
    order:
      typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : undefined,
  };
}

function mapStoreItem(raw: any): any {
  return {
    id: raw.id,
    nameAr: raw.nameAr ?? '',
    nameEn: raw.nameEn ?? '',
    icon: resolveTaxonomyIcon(raw.icon),
    order:
      typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : undefined,
  };
}

function mapOtherItem(raw: any): any {
  return {
    id: raw.id,
    nameAr: raw.nameAr ?? '',
    nameEn: raw.nameEn ?? '',
    icon: raw.icon != null ? resolveTaxonomyIcon(raw.icon) : undefined,
    subcategories: Array.isArray(raw.subcategories) ? [...raw.subcategories] : [],
    order:
      typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : undefined,
  };
}

/**
 * إن وُجد على كل البنود order = 0..n-1 بدون تكرار (كما يحفظه mota7-admin بعد إعادة الترتيب)، نرتّب به.
 * وإلا نُبقي ترتيب مصفوفة items كما جاء من Firestore (أو الثوابت).
 */
function orderMappedItemsForDisplay(mapped: any[]): any[] {
  const n = mapped.length;
  if (n <= 1) {
    return mapped;
  }
  const orders = mapped.map((m) =>
    typeof m?.order === 'number' && Number.isFinite(m.order) ? m.order : null
  );
  if (orders.some((o) => o === null)) {
    return mapped;
  }
  const sorted = [...orders].sort((a, b) => (a as number) - (b as number));
  const isZeroToN1Permutation =
    new Set(orders).size === n && sorted.every((o, i) => (o as number) === i);
  if (!isZeroToN1Permutation) {
    return mapped;
  }
  return [...mapped].sort((a, b) => a.order - b.order);
}

function pickItems(
  fsDoc: any,
  fallback: any[],
  mapper: (x: any) => any
): { items: any[]; fromFs: boolean } {
  /**
   * أي تعديل من وحدة تحكم Firebase أو من التطبيق يصل عبر `docData` (مستمع مباشر).
   * إذا وُجد المستند وفي الحقل `items` مصفوفة — نستخدمها حتى لو فارغة، ولا نرجع للثوابت
   * (سابقاً: length > 0 فقط فكان يُخفي تغييرات Firestore عندما تكون القائمة قصيرة أو أثناء الكتابة).
   */
  if (fsDoc != null && typeof fsDoc === 'object' && Array.isArray(fsDoc.items)) {
    return { items: orderMappedItemsForDisplay(fsDoc.items.map(mapper)), fromFs: true };
  }
  return { items: orderMappedItemsForDisplay(fallback.map(mapper)), fromFs: false };
}

/**
 * دفعة افتراضية من الثوابت فقط — تُستخدم كإصدار فوري (startWith) قبل وصول أول
 * استجابة من Firestore. هذا ضروري على Android WebView حيث تتأخر أول إطلاقة لـ
 * `docData` أحياناً (تهيئة Firestore البارد + pendingUntilEvent)، فلا يصل للمشتركين
 * أي قيمة أولاً وتظل الكروت تنتظر بلا عرض. القيمة الأولية تضمن عرض القائمة
 * فوراً بالثوابت ثم تُحدَّث لحظياً من Firestore عند وصولها.
 */
function buildStaticBundle(): TaxonomyBundle {
  const otherMapped = orderMappedItemsForDisplay(OTHER_SERVICES_DATA.items.map(mapOtherItem));
  return {
    deliveryItems: orderMappedItemsForDisplay(DELIVERY_CATEGORY.items.map(mapDeliveryItem)),
    educationItems: orderMappedItemsForDisplay(EDUCATION_CATEGORY.items.map(mapEducationItem)),
    otherItems: expandOtherCategoryItemsForBundle(otherMapped),
    productItems: orderMappedItemsForDisplay(PRODUCTS_CATEGORY.items.map(mapProductItem)),
    storeItems: orderMappedItemsForDisplay(STORES_CATEGORIES_DATA.items.map(mapStoreItem)),
    loadedFromFirebase: false,
  };
}

@Injectable({ providedIn: 'root' })
export class AppTaxonomyService {
  private firestore = inject(Firestore);
  private cache = inject(FirestoreCacheService);

  readonly bundle$: Observable<TaxonomyBundle> = this.createBundleObservable();

  private createBundleObservable(): Observable<TaxonomyBundle> {
    const cacheKey = FirestoreCacheService.KEYS.TAXONOMY_BUNDLE;
    const cached = this.cache.get<TaxonomyBundle>(cacheKey);
    const isFresh = this.cache.isFresh(cacheKey, FirestoreCacheService.FRESH_TTL.TAXONOMY);

    // إذا الكاش طازج (< 30 دقيقة) → استخدمه فقط بدون فتح مستمعي Firestore
    if (isFresh && cached && Array.isArray(cached.deliveryItems)) {
      return of({ ...cached, loadedFromFirebase: false }).pipe(
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    // الكاش قديم أو غير موجود → فتح مستمعي Firestore
    return combineLatest([
      this.safeDoc$('transportation'),
      this.safeDoc$('education'),
      this.safeDoc$('other_services'),
      this.safeDoc$('products'),
      this.safeDoc$('stores_types'),
    ]).pipe(
      map(([t, e, o, p, s]) => {
        const d = pickItems(t, DELIVERY_CATEGORY.items, mapDeliveryItem);
        const ed = pickItems(e, EDUCATION_CATEGORY.items, mapEducationItem);
        const otPick = pickItems(o, OTHER_SERVICES_DATA.items, mapOtherItem);
        const pr = pickItems(p, PRODUCTS_CATEGORY.items, mapProductItem);
        const st = pickItems(s, STORES_CATEGORIES_DATA.items, mapStoreItem);
        const loadedFromFirebase = d.fromFs || ed.fromFs || otPick.fromFs || pr.fromFs || st.fromFs;
        return {
          deliveryItems: d.items,
          educationItems: ed.items,
          otherItems: expandOtherCategoryItemsForBundle(otPick.items),
          productItems: pr.items,
          storeItems: st.items,
          loadedFromFirebase,
        };
      }),
      tap((bundle) => {
        if (bundle.loadedFromFirebase) {
          this.cache.set(cacheKey, bundle);
        }
      }),
      startWith(this.restoreCachedOrStaticBundle()),
      shareReplay({ bufferSize: 1, refCount: false })
    );
  }

  private restoreCachedOrStaticBundle(): TaxonomyBundle {
    const cached = this.cache.get<TaxonomyBundle>(FirestoreCacheService.KEYS.TAXONOMY_BUNDLE);
    if (cached && Array.isArray(cached.deliveryItems)) {
      return { ...cached, loadedFromFirebase: false };
    }
    return buildStaticBundle();
  }

  private safeDoc$(docId: string): Observable<any> {
    return docData(doc(this.firestore, 'Categories', docId)).pipe(
      catchError(() => of(null))
    );
  }
}

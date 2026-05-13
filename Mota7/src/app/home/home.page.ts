import { Component, OnInit, OnDestroy, inject, EnvironmentInjector, runInInjectionContext, HostBinding, computed } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { IonicModule, NavController, Platform, AlertController } from '@ionic/angular';
import { App } from '@capacitor/app';
import { CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  orderBy,
  where,
  getDocs,
  limit,
  startAfter,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import type { QueryConstraint, QueryDocumentSnapshot, QuerySnapshot } from 'firebase/firestore';
import { documentId, Timestamp } from 'firebase/firestore';
import { Observable, of, Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { map, catchError, filter, startWith } from 'rxjs/operators';
import { FormsModule } from '@angular/forms'; // تم إضافة FormsModule لدعم البحث

// استيراد الأيقونات الأصلية + أيقونات زر المدينة + أيقونات البحث الجديدة
import {
  car, school, construct, cart, storefront, grid, 
  carSport, chevronForwardOutline, alertCircleOutline, 
  call, logoWhatsapp, locationOutline, globeOutline,
  searchOutline, closeOutline,
  carSportOutline, schoolOutline, gridOutline, storefrontOutline, cartOutline,
  constructOutline, carOutline, chevronDownCircleOutline,
  basket, bandage, restaurant, shirt, tv, hammer, bed, bicycle, bus,
  medkit, hardwareChip
} from 'ionicons/icons';

// كروت عرض الإعلانات
import { DeliveryHomeCardComponent } from './home_page_cards/delivery-home-card.component';
import { EducationHomeCardComponent } from './home_page_cards/education-home-card.component';
import { OtherServicesHomeCardComponent } from './home_page_cards/other-services-home-card.component';
import { ProductHomeCardComponent } from './home_page_cards/product-home-card.component';
import { StoreHomeCardComponent } from './home_page_cards/store-home-card.component';

import { BannersComponent } from './banners/banners.component';
import { Mota7HeaderComponent } from '../top_header/header';
import { slimAdForHomeFeed } from '../core/utils/ad-home-feed-slim.util';
import { sortHomeFeedAdsForDisplay } from './home_page_cards/home-feed-display-sort.util';
import { DELIVERY_CATEGORY } from '../core/constants/delivery-data';
import { EDUCATION_CATEGORY } from '../core/constants/educational-data';
import { OTHER_SERVICES_DATA } from '../core/constants/other-services-data';
import { PRODUCTS_CATEGORY } from '../core/constants/products-data';
import { STORES_CATEGORIES_DATA } from '../core/constants/stores-data';
import { AppTaxonomyService } from '../core/services/app-taxonomy.service';
import { resolveTaxonomyIcon } from '../core/utils/taxonomy-icon.util';
import { FirestoreCacheService } from '../core/services/firestore-cache.service';
import { HomeAdsRealtimeService } from '../core/services/home-ads-realtime.service';
import { normalizeProfileCityToShoppingCheckout } from '../core/utils/shopping-checkout-buyer-storage.util';
import { normalizeAdTypeValue } from '../core/utils/duplicate-ad.util';
import { computeHighWaterMsFromAds, createdAtMsForSort } from '../core/utils/ad-sync-ms.util';
import { CartService } from '../core/services/cart.service';
import { GovernorateCitySelectorComponent, HubGeoSelectionEmit } from '../shared/governorate-city-selector/governorate-city-selector.component';
import { adMatchesHomeGeoFilter } from '../core/utils/home-ad-city-filter.util';
import { governorateDisplayShort } from '../core/utils/governorate-display-name.util';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule, // تم تفعيله ليعمل البحث بنفس آلية الطلبات المقبولة
    BannersComponent,
    Mota7HeaderComponent,
    DeliveryHomeCardComponent,
    EducationHomeCardComponent,
    OtherServicesHomeCardComponent,
    ProductHomeCardComponent,
    StoreHomeCardComponent,
    GovernorateCitySelectorComponent,
  ]
})
export class HomePage implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private platform = inject(Platform);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private taxonomy = inject(AppTaxonomyService);
  private fCache = inject(FirestoreCacheService);
  private homeAdsRt = inject(HomeAdsRealtimeService);
  private auth = inject(Auth);
  private navCtrl = inject(NavController);
  private cart = inject(CartService);
  readonly cartCount = this.cart.itemCount;
  readonly cartBadgeText = computed(() => {
    const n = this.cart.itemCount();
    return n > 99 ? '99+' : String(n);
  });

  /**
   * إزاحة زر المدينة وزر العربة داخل منطقة الهيدر (بكسل، من المرجع الافتراضي يسار + أسفل الـ safe area).
   * - hubActionsOffsetX: قيمة موجبة تُحرّك المجموعة نحو يمين الشاشة، سالبة نحو اليسار.
   * - hubActionsOffsetY: قيمة موجبة لأسفل، سالبة لأعلى.
   */
  hubActionsOffsetX = 0;
  hubActionsOffsetY = -2;

  private taxonomySub?: Subscription;

  /** لا نعيد تصفير الصفحة إذا رجع المستخدم من صفحة تفاصيل المتجر حتى يعود لقسم المتاجر بنفس حالته. */
  private preserveNextViewEnter = false;
  private previousTrackedUrl = '';
  private routerEventsSub?: Subscription;

  ionViewWillEnter() {
    if (this.preserveNextViewEnter) {
      this.preserveNextViewEnter = false;
      this.ensureRealtimeIfSectionOpen();
      return;
    }
    this.backToHome(); // سيقوم بتصفير الحالة كلما دخلت الصفحة من التابس
  }

  ionViewWillLeave() {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  categories$: Observable<any[] | null> | undefined;
  selectedCategory: string | null = null;
  
  @HostBinding('class.category-selected')
  get isCategorySelected() {
    return !!this.selectedCategory;
  }
  
  selectedCategoryName: string = '';
  filteredAds$: Observable<any[]> | undefined;
  adsList: any[] = [];
  lastVisible: any = null;
  hasMore: boolean = true;
  isLoadingPage: boolean = false;
  // --- متغيرات نتائج البحث مع Infinite Scroll ---
  searchList: any[] = [];
  searchLastVisible: any = null;
  searchHasMore: boolean = true;
  isLoadingSearch: boolean = false;
  searchResults$: Observable<any[]> | undefined;
  searchText: string = ''; // سيتم ربطه بـ ngModel في الـ HTML
  private searchQueryTokens: string[] = [];
  private readonly searchSynonymGroupsRaw: string[][] = [
    ['توصيل', 'نقل', 'مشوار', 'سواق', 'سائق', 'سياره', 'سيارة', 'تاكسي', 'تكسي', 'delivery', 'transport'],
    ['تعليم', 'تعليمي', 'مدرس', 'مدرسه', 'مدرسة', 'ماده', 'مادة', 'درس', 'دروس', 'education', 'teacher', 'tutor'],
    ['منتج', 'منتجات', 'بيع', 'شراء', 'سعر', 'بضاعه', 'بضاعة', 'product', 'products', 'item'],
    ['متجر', 'متاجر', 'سوبر', 'ماركت', 'محل', 'محلات', 'سوق', 'store', 'market', 'shop'],
    ['خدمه', 'خدمة', 'خدمات', 'صيانة', 'تصليح', 'تركيب', 'service', 'services', 'repair'],
    ['دليفري', 'ديليفري', 'delivery'],
    ['واتساب', 'whatsapp', 'واتس', 'wts'],
    ['القاهره', 'القاهرة', 'cairo'],
    ['اسكندريه', 'الاسكندريه', 'الإسكندرية', 'alex', 'alexandria'],
  ];
  private searchSynonymGroups: string[][] = [];
  private searchHaystackCache = new Map<string, { haystack: string; words: string[] }>();

  // --- متغيرات زر المدينة ---
  showCityPopover: boolean = false;
  selectedCityLabel: string = 'الكل';
  /** فلتر جغرافي للشبكة — يعتمد Firebase بالكامل */
  private homeGeoIsAll = true;
  private readonly homeFlatCityIds = new Set<string>();
  private readonly homeArabicTokens = new Set<string>();
  /** إذا اختار المستخدم المدينة من الزر لا نفرض مدينة الحساب مرة ثانية قبل الرجوع للواجهة الرئيسية. */
  private cityChosenExplicitSinceHub = false;
  deliveryCategories = DELIVERY_CATEGORY.items;
  selectedDeliveryCategory: string = 'all';
  educationStages = EDUCATION_CATEGORY.items;
  educationSubjects: string[] = [];
  selectedEducationStage: string = 'all';
  selectedEducationSubject: string = 'all';
  selectedOtherService: string = 'all';
  otherServices = OTHER_SERVICES_DATA.items;
  productCategories = PRODUCTS_CATEGORY.items;
  productSubcategories: string[] = [];
  selectedProductCategory: string = 'all';
  selectedProductSubcategory: string = 'all';

  /** أعداد الإعلانات (بعد فلتر المدينة والحالة) لكل تاب فرعي */
  deliveryTabCounts: Record<string, number | undefined> = {};
  educationStageTabCounts: Record<string, number | undefined> = {};
  educationSubjectTabCounts: Record<string, number | undefined> = {};
  otherTabCounts: Record<string, number | undefined> = {};
  productCategoryTabCounts: Record<string, number | undefined> = {};
  productSubcategoryTabCounts: Record<string, number | undefined> = {};
  storeTypes = [...STORES_CATEGORIES_DATA.items];
  selectedStoreType: string = 'all';
  storeTypeTabCounts: Record<string, number | undefined> = {};
  private tabCountsRequestId = 0;
  /** تخزين مؤقت للإعلانات المصفّاة (نوع + مدينة) لتفادي إعادة الجلب عند تغيير التاب الفرعي فقط */
  private tabCountsPoolCache: { adType: string; cityLabel: string; pool: any[] } | null = null;

  /** مزامنة كاملة دورية — الإعلانات المحذوفة من السحابة لا تصل عبر الدلتا */
  private readonly homeAdsFullSyncIntervalMs = 7 * 24 * 60 * 60 * 1000;

  constructor() {
    addIcons({ 
      'car': car, 'school': school, 'construct': construct, 
      'cart': cart, 'storefront': storefront, 'grid': grid,
      'car-sport': carSport, 'chevron-forward-outline': chevronForwardOutline,
      'alert-circle-outline': alertCircleOutline, 'call': call,
      'logo-whatsapp': logoWhatsapp,
      'location-outline': locationOutline,
      'globe-outline': globeOutline,
      'search-outline': searchOutline,
      'close-outline': closeOutline,
      'car-sport-outline': carSportOutline,
      'school-outline': schoolOutline,
      'grid-outline': gridOutline,
      'storefront-outline': storefrontOutline,
      'cart-outline': cartOutline,
      'construct-outline': constructOutline,
      'car-outline': carOutline,
      'chevron-down-circle-outline': chevronDownCircleOutline,
      basket, bandage, restaurant, shirt, tv, hammer, bed, bicycle, bus,
      medkit, 'hardware-chip': hardwareChip,
    });
    this.searchSynonymGroups = this.searchSynonymGroupsRaw.map((group) =>
      Array.from(new Set(group.map((g) => this.normalizeText(g)).filter(Boolean)))
    );
  }

  ngOnDestroy(): void {
    this.taxonomySub?.unsubscribe();
    this.routerEventsSub?.unsubscribe();
    this.homeAdsRt.stop();
  }

  ngOnInit() {
    this.taxonomySub = this.taxonomy.bundle$.subscribe((b) => {
      this.deliveryCategories = b.deliveryItems;
      this.educationStages = b.educationItems;
      this.otherServices = b.otherItems;
      this.productCategories = b.productItems;
      this.storeTypes = b.storeItems;
      const stage = this.educationStages.find((s: any) => s.id === this.selectedEducationStage);
      if (this.selectedEducationStage !== 'all') {
        this.educationSubjects = stage?.subjects || [];
      }
      const pc = this.productCategories.find((c: any) => c.id === this.selectedProductCategory);
      if (this.selectedProductCategory !== 'all') {
        this.productSubcategories = pc?.subcategories || [];
      }
    });

    window.addEventListener('reset-mota7-home', () => this.backToHome());

    // عند العودة من صفحة تفاصيل المتجر نحافظ على حالة قسم المتاجر (التصنيف المختار، القائمة، المدينة...)
    this.previousTrackedUrl = this.router.url.split('?')[0];
    this.routerEventsSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => {
        const curr = (event.urlAfterRedirects || event.url).split('?')[0];
        if (
          curr === '/tabs/home' &&
          /^\/tabs\/home\/store\//.test(this.previousTrackedUrl)
        ) {
          this.preserveNextViewEnter = true;
        }
        this.previousTrackedUrl = curr;
      });
    runInInjectionContext(this.injector, () => {
      const cacheKey = FirestoreCacheService.KEYS.CATEGORIES_HOME;
      const cachedCats = this.fCache.get<any[]>(cacheKey);
      const isFresh = this.fCache.isFresh(cacheKey, FirestoreCacheService.FRESH_TTL.CATEGORIES);

      // إذا الكاش طازج → استخدمه فقط بدون الاتصال بـ Firestore
      if (isFresh && cachedCats) {
        this.categories$ = of(cachedCats);
        return;
      }

      // الكاش قديم أو غير موجود → جلب من Firestore
      const categoriesRef = collection(this.firestore, 'Categories');
      const q = query(categoriesRef, orderBy('order', 'asc'));
      this.categories$ = collectionData(q, { idField: 'id' }).pipe(
        map((rows: any[] | undefined) => {
          if (rows == null) return null;
          const mapped = rows.map((c) => ({ ...c, icon: resolveTaxonomyIcon(c?.icon) }));
          this.fCache.set(cacheKey, mapped);
          return mapped;
        }),
        startWith(cachedCats ?? null),
        catchError((err) => {
          console.error('Failed to load Categories from Firestore:', err);
          return of(cachedCats ?? null);
        })
      );
    });

    // معالجة زر الرجوع في الموبايل
    this.setupBackButtonHandler();

    /** تسخين كاش الأقسام في الخلفية بعد فتح التطبيق — لا يعطل الواجهة */
    setTimeout(() => void this.warmAdsCachesInBackground(), 1800);
  }

  /**
   * جلب كل أنواع الإعلانات وتخزينها محلياً بينما المستخدم على الشبكة الرئيسية،
   * فيفتح القسم بسرعة دون «فراغ» مؤقت.
   */
  private async warmAdsCachesInBackground(): Promise<void> {
    if (this.selectedCategory) {
      return;
    }
    const types = ['delivery', 'education', 'other', 'product', 'store'] as const;
    for (const t of types) {
      const cacheKey = FirestoreCacheService.adsListCacheKey(t);
      if (this.fCache.isFresh(cacheKey, FirestoreCacheService.FRESH_TTL.ADS_LIST)) {
        continue;
      }
      try {
        await this.syncAdsFromNetwork(t);
      } catch (e) {
        console.warn('[home] warm ads cache:', t, e);
      }
    }
  }

  // --- دوال زر المدينة ---
  toggleCityPopover() {
    this.showCityPopover = !this.showCityPopover;
  }

  closeCityPopover() {
    this.showCityPopover = false;
  }

  /** نص زر الكبسولة: يُحسب في المحدد (محافظة / مدينة / محافظة+(عدد)) */
  private formatHubCapsuleFromSelection(sel: HubGeoSelectionEmit): string {
    if (sel.isAll) {
      return 'الكل';
    }
    const label = String(sel.hubButtonLabel ?? '').trim();
    return label || 'مدينة';
  }

  /** من كرت المتجر: محافظة قصيرة + عدد معرفات التغطية */
  private formatChipCapsule(hubGovShort: string, cityCount: number, filterFallback: string): string {
    const g = hubGovShort.trim();
    if (g && cityCount > 0) {
      return `${g} ${cityCount}`;
    }
    if (g) {
      return g;
    }
    return filterFallback.trim() || 'مدينة';
  }

  onHubGeoSelection(sel: HubGeoSelectionEmit): void {
    this.cityChosenExplicitSinceHub = true;
    this.homeGeoIsAll = !!sel.isAll;
    this.homeFlatCityIds.clear();
    this.homeArabicTokens.clear();
    for (const id of sel.flatCityIds || []) this.homeFlatCityIds.add(id);
    for (const t of sel.arabicTokens || []) this.homeArabicTokens.add(t);
    this.selectedCityLabel = this.formatHubCapsuleFromSelection(sel);
    this.tabCountsPoolCache = null;
    this.loadAdsForCategory(this.selectedCategory);
    if (this.searchText.length >= 2) {
      this.loadSearchResults();
    }
  }

  onCityFilterFromChip(payload: {
    coverageCityIds?: string[];
    cityLabel?: string;
    hubButtonLabel?: string;
    cityCount?: number;
  }) {
    this.cityChosenExplicitSinceHub = true;
    const ids = (payload.coverageCityIds || []).filter(Boolean);
    const filterText = String(payload.cityLabel ?? '').trim();
    const hubBtn = String(payload.hubButtonLabel ?? '').trim();
    const explicitCount =
      typeof payload.cityCount === 'number' && Number.isFinite(payload.cityCount)
        ? Math.max(0, Math.floor(payload.cityCount))
        : 0;
    const cityCount = explicitCount > 0 ? explicitCount : ids.length > 0 ? ids.length : filterText ? 1 : 0;
    if (ids.length > 0) {
      this.homeGeoIsAll = false;
      this.homeFlatCityIds.clear();
      for (const id of ids) this.homeFlatCityIds.add(id);
      this.homeArabicTokens.clear();
      if (filterText) this.homeArabicTokens.add(filterText);
    } else {
      this.homeGeoIsAll = false;
      this.homeFlatCityIds.clear();
      this.homeArabicTokens.clear();
      if (filterText) this.homeArabicTokens.add(filterText);
    }
    this.selectedCityLabel = this.formatChipCapsule(hubBtn, cityCount, filterText);
    this.showCityPopover = false;
    this.tabCountsPoolCache = null;
    this.loadAdsForCategory(this.selectedCategory);
    if (this.searchText.length >= 2) {
      this.loadSearchResults();
    }
  }

  /** @deprecated — للتوافق إن وُجد استدعاء نصّي قديم */
  selectCity(city: string) {
    this.onCityFilterFromChip({ coverageCityIds: [], cityLabel: city });
  }

  // --- دوال الفلاتر ---
  selectDeliveryCategory(categoryId: string) {
    this.selectedDeliveryCategory = categoryId;
    this.syncAdsListWithPool();
  }

  selectEducationStage(stageId: string) {
    this.selectedEducationStage = stageId;
    this.selectedEducationSubject = 'all';
    const stage = this.educationStages.find((s: any) => s.id === stageId);
    this.educationSubjects = stageId !== 'all' ? (stage?.subjects || []) : [];
    // تحديث أعداد المواد للقسم المختار
    void this.refreshSectionTabCounts();
  }

  selectEducationSubject(subject: string) {
    this.selectedEducationSubject = subject;
    this.syncAdsListWithPool();
  }

  selectOtherService(serviceId: string) {
    this.selectedOtherService = serviceId;
    this.syncAdsListWithPool();
  }

  selectProductCategory(categoryId: string) {
    this.selectedProductCategory = categoryId;
    this.selectedProductSubcategory = 'all';
    const cat = this.productCategories.find((c: any) => c.id === categoryId);
    this.productSubcategories = categoryId !== 'all' ? (cat?.subcategories || []) : [];
    // تحديث أعداد الأقسام الفرعية للمنتجات
    void this.refreshSectionTabCounts();
  }

  selectProductSubcategory(sub: string) {
    this.selectedProductSubcategory = sub;
    this.syncAdsListWithPool();
  }

  selectStoreType(typeId: string) {
    this.selectedStoreType = typeId;
    this.syncAdsListWithPool();
  }

  openService(service: any) {
    const enteringFromHub = !this.selectedCategory;
    this.selectedCategory = typeof service === 'string' ? service : (service.id || service.nameAr);
    this.selectedCategoryName = typeof service === 'string' ? this.getStaticName(service) : service.nameAr;
    this.resetFilters();

    if (this.selectedCategoryName === 'نقل وتوصيل' || this.selectedCategory === 'transportation') {
      this.selectedCategory = 'transportation';
    }
    void this.openCategoryWithOptionalCityHydrate(this.selectedCategory, enteringFromHub);
  }

  /**
   * عند أول دخول من شبكة الأقسام: ربط فلتر المدينة بحقل city في ملف تعريف المستخدم (خارجة/داخلة) إن وجد،
   * ثم تحميل الإعلانات حتى يتطابق نص الزر مع الفلترة.
   */
  private async openCategoryWithOptionalCityHydrate(
    categoryId: string | null,
    enteringFromHub: boolean
  ): Promise<void> {
    if (!categoryId) return;
    if (enteringFromHub && !this.cityChosenExplicitSinceHub && this.homeGeoIsAll) {
      await this.tryApplyLoggedInUserCityFilter();
    }
    this.loadAdsForCategory(categoryId);
  }

  private async tryApplyLoggedInUserCityFilter(): Promise<void> {
    try {
      const u = this.auth.currentUser;
      const email = u?.email ?? '';
      if (!email.includes('@')) return;
      const key = email.split('@')[0];
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', key))
      );
      if (!snap.exists()) return;
      const d = snap.data() as Record<string, unknown>;
      const cid = String(d['city_id'] ?? '').trim();
      const cname = String(d['city'] ?? '').trim();
      if (cid) {
        this.homeGeoIsAll = false;
        this.homeFlatCityIds.clear();
        this.homeArabicTokens.clear();
        this.homeFlatCityIds.add(cid);
        if (cname) this.homeArabicTokens.add(cname);
        const gna = String(d['governorate_name_ar'] ?? '').trim();
        const govShort = gna ? governorateDisplayShort(gna) : '';
        this.selectedCityLabel = (cname || govShort || 'مدينتي').trim();
        this.tabCountsPoolCache = null;
        return;
      }
      const canon = normalizeProfileCityToShoppingCheckout(d['city']);
      if (canon !== 'الخارجة' && canon !== 'الداخلة') return;
      this.homeGeoIsAll = false;
      this.homeFlatCityIds.clear();
      this.homeArabicTokens.clear();
      this.homeArabicTokens.add(canon);
      this.selectedCityLabel = canon;
      this.tabCountsPoolCache = null;
    } catch {
      /* ignore */
    }
  }

  private resetFilters() {
    this.selectedDeliveryCategory = 'all';
    this.selectedEducationStage = 'all';
    this.selectedEducationSubject = 'all';
    this.educationSubjects = [];
    this.selectedOtherService = 'all';
    this.selectedProductCategory = 'all';
    this.selectedProductSubcategory = 'all';
    this.productSubcategories = [];
    this.selectedStoreType = 'all';
  }

  private loadAdsForCategory(categoryId: string | null) {
    if (!categoryId) return;

    let adType = categoryId;
    if (categoryId === 'transportation') adType = 'delivery';
    else if (categoryId === 'education') adType = 'education';
    else if (categoryId === 'other_services') adType = 'other';
    else if (categoryId === 'products') adType = 'product';
    else if (categoryId === 'stores_types') adType = 'store';

    // إعادة ضبط الحالة للتحميل الأول — نفترض التحميل حتى يقرر الكاش/الشبكة خلاف ذلك
    this.adsList = [];
    this.lastVisible = null;
    this.hasMore = true;
    this.isLoadingPage = true;

    // refreshSectionTabCounts سيقوم بجلب البيانات وتحديث adsList داخلياً
    void this.refreshSectionTabCounts();
  }

  backToHome() {
    this.homeAdsRt.stop();
    this.selectedCategory = null;
    this.selectedCategoryName = '';
    this.resetFilters();
    this.filteredAds$ = undefined;
    this.selectedCityLabel = 'الكل';
    this.homeGeoIsAll = true;
    this.homeFlatCityIds.clear();
    this.homeArabicTokens.clear();
    this.cityChosenExplicitSinceHub = false;
    this.showCityPopover = false;
    this.clearSearch();
    this.tabCountsPoolCache = null;
    this.deliveryTabCounts = {};
    this.educationStageTabCounts = {};
    this.educationSubjectTabCounts = {};
    this.otherTabCounts = {};
    this.productCategoryTabCounts = {};
    this.productSubcategoryTabCounts = {};
    this.storeTypeTabCounts = {};
  }

  /** الرجوع بالجهاز يخص «الرئيسية» فقط — خارجها نمرّر للمعالجات الأخرى (مثل my-ads / edit-profile). */
  private isCurrentRouteHomeTab(): boolean {
    const path = this.router.url.split('?')[0].split('#')[0];
    return path === '/tabs/home' || path === '/tabs' || /^\/tabs\/home\/?$/.test(path);
  }

  // معالجة زر الرجوع في الموبايل
  private setupBackButtonHandler(): void {
    this.platform.backButton.subscribeWithPriority(10, async (processNextHandler) => {
      if (!this.isCurrentRouteHomeTab()) {
        processNextHandler();
        return;
      }
      if (this.selectedCategory) {
        this.backToHome();
      } else {
        await this.showExitConfirmation();
      }
    });
  }

  // عرض رسالة تأكيد الخروج بشكل عصري
  private async showExitConfirmation() {
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الخروج',
      message: 'هل تريد الخروج من التطبيق وإغلاقه؟',
      mode: 'ios',
      cssClass: 'exit-confirm-alert',
      buttons: [
        {
          text: 'إلغاء',
          role: 'cancel',
          cssClass: 'cancel-button'
        },
        {
          text: 'تأكيد الخروج',
          role: 'confirm',
          cssClass: 'confirm-button',
          handler: async () => {
            await App.exitApp();
          }
        }
      ]
    });
    
    await alert.present();
  }

  // يتم استدعاء هذه الدالة من الـ (input) في الـ HTML
  onSearchInput() {
    if (this.searchText.trim().length >= 2) {
      this.loadSearchResults();
    } else {
      this.searchResults$ = undefined;
      this.searchList = [];
      this.searchHasMore = true;
      this.searchLastVisible = null;
    }
  }

  clearSearch() {
    this.searchText = '';
    this.searchResults$ = undefined;
    this.searchQueryTokens = [];
    this.searchHaystackCache.clear();
  }

  onGlobalClick() {
    if (this.searchText) {
      this.clearSearch();
    }
  }

  goToCart(): void {
    void this.navCtrl.navigateForward('/tabs/cart', {
      animated: true,
      animationDirection: 'forward',
    });
  }

  /**
   * trackBy للقوائم الكبيرة (الإعلانات والبحث) — يتفادى إعادة بناء الكروت عند
   * كل scroll/تحميل لاحق ويُحسّن أداء التمرير بشكل واضح.
   */
  trackByAdId(_index: number, ad: any): string | number {
    return ad?.id || ad?.ad_id || _index;
  }

  /** trackBy لتبويبات التصنيفات الفرعية (id ثابت) */
  trackByItemId(_index: number, item: any): string | number {
    return item?.id ?? _index;
  }

  /** trackBy لقوائم نصية ثابتة (مواد تعليمية، تصنيفات منتج فرعية...) */
  trackByValue(_index: number, value: string): string {
    return value;
  }

  private async loadSearchResults() {
    this.searchList = [];
    this.searchLastVisible = null;
    this.searchHasMore = true;
    this.isLoadingSearch = false;
    this.searchHaystackCache.clear();
    this.searchQueryTokens = this.tokenizeText(this.searchText);
    await this.fetchSearchPageSearch();
  }

  private normalizeText(input: any): string {
    return (input ?? '').toString()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }


  private isCityMatchAd(ad: any): boolean {
    return adMatchesHomeGeoFilter({
      ad,
      isAll: this.homeGeoIsAll,
      flatCityIds: this.homeFlatCityIds,
      arabicTokens: this.homeArabicTokens,
    });
  }

  /** نفس شروط العرض في القائمة: مفعل + المدينة المختارة */
  private passesBaseHomeFilters(ad: any): boolean {
    return ad?.status === 'active' && this.isCityMatchAd(ad);
  }

  private mapCategoryToAdType(categoryId: string): string | null {
    switch (categoryId) {
      case 'transportation':
        return 'delivery';
      case 'education':
        return 'education';
      case 'other_services':
        return 'other';
      case 'products':
        return 'product';
      case 'stores_types':
        return 'store';
      default:
        return null;
    }
  }

  /**
   * قيم `ad_type` في Firestore قديمة أو حديثة — نجلب كل المتحقق منها ثم نوحّدها للواجهة.
   * نستخدم orderBy(documentId()) وليس created_at حتى لا تُستبعد مستندات بلا حقل created_at.
   */
  private firestoreAdTypeVariants(logicalType: string): string[] {
    switch (logicalType) {
      case 'other':
        return ['other', 'other_services'];
      case 'store':
        return ['store', 'stores', 'shop'];
      default:
        return [logicalType];
    }
  }

  private normalizeFetchedAdRow(d: { id: string; data: () => Record<string, unknown> }): any {
    const raw = Object.assign({ id: d.id }, d.data() || {}) as Record<string, unknown>;
    raw['ad_type'] = normalizeAdTypeValue(raw['ad_type']);
    return raw;
  }

  /** كل من where/orderBy/Timestamp/query/collection/getDocs يُراقَب من Angular Fire — تنفيذ الدفعة داخل السياق. */
  private getAdsDocsSnap(buildConstraints: () => QueryConstraint[]): Promise<QuerySnapshot> {
    return runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'ads'), ...buildConstraints()))
    );
  }

  /** توحيد نوع الإعلان من الكاش المحلي (بعد ترقية التطبيق أو بيانات قديمة) */
  private withNormalizedAdType(ad: any): any {
    if (!ad || typeof ad !== 'object') {
      return ad;
    }
    return { ...ad, ad_type: normalizeAdTypeValue(ad.ad_type) };
  }

  private async fetchAllRawAdsByType(adType: string): Promise<any[]> {
    const variants = this.firestoreAdTypeVariants(adType);
    const byId = new Map<string, any>();
    const pageSize = 400;
    for (const variant of variants) {
      let lastVisible: any = null;
      for (;;) {
        const snap = await this.getAdsDocsSnap(() => {
          const constraints: QueryConstraint[] = [
            where('ad_type', '==', variant),
            orderBy(documentId()),
            limit(pageSize),
          ];
          if (lastVisible) {
            constraints.push(startAfter(lastVisible));
          }
          return constraints;
        });
        if (snap.empty) {
          break;
        }
        for (const d of snap.docs) {
          byId.set(d.id, this.normalizeFetchedAdRow(d));
        }
        if (snap.docs.length < pageSize) {
          break;
        }
        lastVisible = snap.docs[snap.docs.length - 1];
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) => createdAtMsForSort(b) - createdAtMsForSort(a)
    );
  }

  private mergeAdsById(base: any[], deltaRows: any[]): any[] {
    const map = new Map<string, any>();
    for (const a of base) {
      const id = String(a?.id ?? a?.ad_id ?? '').trim();
      if (id) map.set(id, a);
    }
    for (const u of deltaRows) {
      const id = String(u?.id ?? u?.ad_id ?? '').trim();
      if (id) map.set(id, u);
    }
    return Array.from(map.values()).sort(
      (a, b) => createdAtMsForSort(b) - createdAtMsForSort(a)
    );
  }

  /**
   * إعلانات غيّرت على السحابة بعد highWaterMs (حقول updated_at فعلياً).
   * قراءات Firestore = عدد المستندات المُرجعة فقط (+ صفحات الترقيم).
   */
  private async fetchDeltaRawAdsByType(adType: string, sinceMs: number): Promise<any[]> {
    if (sinceMs <= 0) {
      return [];
    }
    const variants = this.firestoreAdTypeVariants(adType);
    const merged = new Map<string, any>();
    const pageSize = 300;
    for (const variant of variants) {
      let lastDoc: QueryDocumentSnapshot | undefined;
      for (;;) {
        const snap = await this.getAdsDocsSnap(() => {
          const sinceTs = Timestamp.fromMillis(sinceMs);
          const constraints: QueryConstraint[] = [
            where('ad_type', '==', variant),
            where('updated_at', '>', sinceTs),
            orderBy('updated_at'),
            orderBy(documentId()),
            limit(pageSize),
          ];
          if (lastDoc) {
            constraints.push(startAfter(lastDoc));
          }
          return constraints;
        });
        if (snap.empty) {
          break;
        }
        for (const d of snap.docs) {
          merged.set(d.id, this.normalizeFetchedAdRow(d));
        }
        if (snap.docs.length < pageSize) {
          break;
        }
        lastDoc = snap.docs[snap.docs.length - 1] as QueryDocumentSnapshot;
      }
    }
    return Array.from(merged.values());
  }

  private async fullSyncAndPersistAds(adType: string): Promise<any[]> {
    const raw = await this.fetchAllRawAdsByType(adType);
    const cacheKey = FirestoreCacheService.adsListCacheKey(adType);
    this.fCache.set(cacheKey, raw);
    this.fCache.setHomeAdsSyncMeta(adType, {
      highWaterMs: computeHighWaterMsFromAds(raw),
      lastFullSyncMs: Date.now(),
    });
    return raw;
  }

  /**
   * مزامنة ذكية: دلتا بـ updated_at إن وُجدت ميتا صالحة، وإلا جلب كامل.
   * مزامنة كاملة تُفرض دورياً (أسبوع) أو عند فشل الدلتا/نقص الميتا.
   */
  private async syncAdsFromNetwork(adType: string): Promise<any[]> {
    const cacheKey = FirestoreCacheService.adsListCacheKey(adType);
    const cached = this.fCache.get<any[]>(cacheKey) ?? [];
    let meta = this.fCache.getHomeAdsSyncMeta(adType);

    /** ترقية من إصدارات قديمة: كاش إعلانات بدون ملف ميتا */
    if (!meta && cached.length > 0) {
      const hw = computeHighWaterMsFromAds(cached.map((a) => this.withNormalizedAdType(a)));
      if (hw > 0) {
        meta = {
          highWaterMs: hw,
          lastFullSyncMs: this.fCache.getTimestamp(cacheKey) ?? Date.now(),
        };
        this.fCache.setHomeAdsSyncMeta(adType, meta);
      }
    }

    if (cached.length === 0) {
      return await this.fullSyncAndPersistAds(adType);
    }
    if (
      !meta ||
      meta.highWaterMs <= 0 ||
      Date.now() - meta.lastFullSyncMs > this.homeAdsFullSyncIntervalMs
    ) {
      return await this.fullSyncAndPersistAds(adType);
    }

    const metaFixed = meta;

    try {
      const delta = await this.fetchDeltaRawAdsByType(adType, metaFixed.highWaterMs);
      if (delta.length === 0) {
        return cached;
      }
      const merged = this.mergeAdsById(cached, delta);
      const hw = computeHighWaterMsFromAds(merged);
      this.fCache.set(cacheKey, merged);
      this.fCache.setHomeAdsSyncMeta(adType, {
        highWaterMs: hw,
        lastFullSyncMs: metaFixed.lastFullSyncMs,
      });
      return merged;
    } catch (e) {
      console.warn('[home] delta sync failed, full sync:', adType, e);
      return await this.fullSyncAndPersistAds(adType);
    }
  }

  /** تطبيق نتيجة الاستماع اللحظي على الكاش المعروض (بعد فلترة المدينة/النشاط). */
  private applyRealtimeSnapshot(adType: string, raw: any[]): void {
    const cat = this.selectedCategory;
    if (!cat || this.mapCategoryToAdType(cat) !== adType) {
      return;
    }
    const cityLabel = this.selectedCityLabel;
    const pool = raw
      .map((ad) => slimAdForHomeFeed(this.withNormalizedAdType(ad), adType))
      .filter((ad) => this.passesBaseHomeFilters(ad));
    this.tabCountsPoolCache = { adType, cityLabel, pool };
    this.applyTabCountsForCategory(cat, pool);
    this.syncAdsListWithPool();
    this.isLoadingPage = false;
  }

  /**
   * استماع لحظي لنوع الإعلان: إضافة / تعديل / حذف تنعكس على الكارتات فوراً.
   * عند فشل الاستماع يُستخدم syncAdsFromNetwork احتياطياً.
   */
  private ensureRealtimeForSection(adType: string): void {
    const reqId = ++this.tabCountsRequestId;
    this.homeAdsRt.start(
      adType,
      (raw) => {
        if (reqId !== this.tabCountsRequestId) {
          return;
        }
        if (this.mapCategoryToAdType(this.selectedCategory ?? '') !== adType) {
          return;
        }
        this.applyRealtimeSnapshot(adType, raw);
      },
      async () => {
        try {
          const raw = await this.syncAdsFromNetwork(adType);
          if (reqId !== this.tabCountsRequestId) {
            return;
          }
          if (this.mapCategoryToAdType(this.selectedCategory ?? '') !== adType) {
            return;
          }
          this.applyRealtimeSnapshot(adType, raw);
        } catch (e) {
          console.error('[home] realtime fallback sync', e);
          this.isLoadingPage = false;
        }
      }
    );
  }

  private ensureRealtimeIfSectionOpen(): void {
    const adType = this.mapCategoryToAdType(this.selectedCategory ?? '');
    if (adType) {
      this.ensureRealtimeForSection(adType);
    }
  }

  private applyTabCountsForCategory(cat: string, pool: any[]): void {
    this.deliveryTabCounts = {};
    this.educationStageTabCounts = {};
    this.educationSubjectTabCounts = {};
    this.otherTabCounts = {};
    this.productCategoryTabCounts = {};
    this.productSubcategoryTabCounts = {};
    this.storeTypeTabCounts = {};

    if (cat === 'transportation') {
      this.deliveryTabCounts['all'] = pool.length;
      for (const item of this.deliveryCategories) {
        this.deliveryTabCounts[item.id] = pool.filter((a) => a.category_id === item.id).length;
      }
      return;
    }

    if (cat === 'education') {
      this.educationStageTabCounts['all'] = pool.length;
      for (const stage of this.educationStages) {
        this.educationStageTabCounts[stage.id] = pool.filter((a) => a.category_id === stage.id).length;
      }
      if (this.selectedEducationStage !== 'all') {
        const stagePool = pool.filter((a) => a.category_id === this.selectedEducationStage);
        this.educationSubjectTabCounts['all'] = stagePool.length;
        for (const sub of this.educationSubjects) {
          this.educationSubjectTabCounts[sub] = stagePool.filter((a) => a?.details?.subject === sub).length;
        }
      }
      return;
    }

    if (cat === 'other_services') {
      this.otherTabCounts['all'] = pool.length;
      for (const item of this.otherServices) {
        this.otherTabCounts[item.id] = pool.filter((a) => a.category_id === item.id).length;
      }
      return;
    }

    if (cat === 'products') {
      this.productCategoryTabCounts['all'] = pool.length;
      for (const item of this.productCategories) {
        this.productCategoryTabCounts[item.id] = pool.filter((a) => a.category_id === item.id).length;
      }
      if (this.selectedProductCategory !== 'all') {
        const catPool = pool.filter((a) => a.category_id === this.selectedProductCategory);
        this.productSubcategoryTabCounts['all'] = catPool.length;
        for (const sub of this.productSubcategories) {
          this.productSubcategoryTabCounts[sub] = catPool.filter((a) => a.sub_category_name === sub).length;
        }
      }
      return;
    }

    if (cat === 'stores_types') {
      this.storeTypeTabCounts['all'] = pool.length;
      for (const item of this.storeTypes) {
        this.storeTypeTabCounts[item.id] = pool.filter((a) => a.category_id === item.id).length;
      }
    }
  }

  private async refreshSectionTabCounts(): Promise<void> {
    const cat = this.selectedCategory;
    if (!cat) {
      this.isLoadingPage = false;
      return;
    }
    const adType = this.mapCategoryToAdType(cat);
    if (!adType) {
      this.isLoadingPage = false;
      return;
    }

    const cityLabel = this.selectedCityLabel;
    const memCache = this.tabCountsPoolCache;
    if (memCache && memCache.adType === adType && memCache.cityLabel === cityLabel) {
      this.applyTabCountsForCategory(cat, memCache.pool);
      this.syncAdsListWithPool();
      this.isLoadingPage = false;
      this.ensureRealtimeForSection(adType);
      return;
    }

    const cacheKey = FirestoreCacheService.adsListCacheKey(adType);
    const cached = this.fCache.get<any[]>(cacheKey);
    const isFresh = this.fCache.isFresh(cacheKey, FirestoreCacheService.FRESH_TTL.ADS_LIST);

    const poolFromCachedRows = (rows: any[]): any[] =>
      rows
        .map((ad) => slimAdForHomeFeed(this.withNormalizedAdType(ad), adType))
        .filter((ad) => this.passesBaseHomeFilters(ad));

    // إذا الكاش طازج (< 5 دقائق) → اعرض من الجهاز ثم إبقاء الاستماع اللحظي نشطاً
    if (isFresh && cached && Array.isArray(cached) && cached.length > 0) {
      const pool = poolFromCachedRows(cached);
      this.tabCountsPoolCache = { adType, cityLabel, pool };
      this.applyTabCountsForCategory(cat, pool);
      this.syncAdsListWithPool();
      this.isLoadingPage = false;
      this.ensureRealtimeForSection(adType);
      return;
    }

    // كاش قديم: عرض فوري من الجهاز ثم يحدث الـ snapshot التالي من الشبكة
    if (cached && Array.isArray(cached) && cached.length > 0) {
      const pool = poolFromCachedRows(cached);
      this.tabCountsPoolCache = { adType, cityLabel, pool };
      this.applyTabCountsForCategory(cat, pool);
      this.syncAdsListWithPool();
      this.isLoadingPage = false;
      this.ensureRealtimeForSection(adType);
      return;
    }

    // لا كاش: انتظار أول snapshot من الاستماع (أو الرجوع الاحتياطي)
    this.isLoadingPage = true;
    this.ensureRealtimeForSection(adType);
  }

  /**
   * تحديث قائمة الإعلانات المعروضة (adsList) بناءً على التبويب الفرعي المختار
   * من خلال مجمع الإعلانات (Pool) الموجود في الذاكرة.
   */
  private syncAdsListWithPool() {
    if (!this.tabCountsPoolCache) return;
    
    const cat = this.selectedCategory;
    let filtered = this.tabCountsPoolCache.pool;

    // تصفية حسب القسم الفرعي المختار
    if (cat === 'transportation' && this.selectedDeliveryCategory !== 'all') {
      filtered = filtered.filter(a => a.category_id === this.selectedDeliveryCategory);
    } else if (cat === 'education') {
      if (this.selectedEducationStage !== 'all') {
        filtered = filtered.filter(a => a.category_id === this.selectedEducationStage);
      }
      if (this.selectedEducationSubject !== 'all') {
        filtered = filtered.filter(a => a?.details?.subject === this.selectedEducationSubject);
      }
    } else if (cat === 'other_services' && this.selectedOtherService !== 'all') {
      filtered = filtered.filter(a => a.category_id === this.selectedOtherService);
    } else if (cat === 'products') {
      if (this.selectedProductCategory !== 'all') {
        filtered = filtered.filter(a => a.category_id === this.selectedProductCategory);
      }
      if (this.selectedProductSubcategory !== 'all') {
        filtered = filtered.filter(a => a.sub_category_name === this.selectedProductSubcategory);
      }
    } else if (cat === 'stores_types' && this.selectedStoreType !== 'all') {
      filtered = filtered.filter(a => a.category_id === this.selectedStoreType);
    }

    this.adsList = sortHomeFeedAdsForDisplay(filtered);
    this.hasMore = false; // بما أننا جلبنا الكل في الـ Pool فلا نحتاج Infinite Scroll هنا
  }

  private tokenizeText(text: string): string[] {
    const normalized = this.normalizeText(text);
    if (!normalized) return [];
    const tokens = normalized
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length >= 1);
    return Array.from(new Set(tokens));
  }

  private expandTokenAlternatives(token: string): string[] {
    const tk = this.normalizeText(token);
    if (!tk) return [];
    const expanded = new Set<string>([tk]);
    for (const group of this.searchSynonymGroups) {
      if (group.some((g) => g === tk || g.includes(tk) || tk.includes(g))) {
        group.forEach((g) => expanded.add(g));
      }
    }
    // صيغة مع/بدون "ال" التعريف
    if (tk.startsWith('ال') && tk.length > 3) expanded.add(tk.slice(2));
    if (!tk.startsWith('ال') && tk.length > 2) expanded.add(`ال${tk}`);
    return Array.from(expanded);
  }

  private getAdTypeLabel(adType: string): string {
    switch (adType) {
      case 'delivery':
        return 'توصيل نقل delivery';
      case 'education':
        return 'تعليم تعليمية education';
      case 'other':
        return 'خدمة خدمات other';
      case 'product':
        return 'منتج منتجات product';
      case 'store':
        return 'متجر متاجر store';
      default:
        return '';
    }
  }

  private getCategoryLabel(ad: any): string {
    const adType = ad?.ad_type;
    const catId = ad?.category_id;
    if (!catId) return '';
    if (adType === 'delivery') {
      const item = this.deliveryCategories.find(i => i.id === catId);
      return item?.nameAr || '';
    }
    if (adType === 'education') {
      const item = this.educationStages.find(i => i.id === catId);
      const subject = ad?.details?.subject;
      return [item?.nameAr, subject].filter(Boolean).join(' ');
    }
    if (adType === 'other') {
      const item = this.otherServices.find(i => i.id === catId);
      return item?.nameAr || '';
    }
    if (adType === 'product') {
      const item = this.productCategories.find(i => i.id === catId);
      const sub = ad?.sub_category_name;
      return [item?.nameAr, sub].filter(Boolean).join(' ');
    }
    if (adType === 'store') {
      const st = this.storeTypes.find((i) => i.id === catId);
      const parts = [st?.nameAr, ad?.store_name].filter(Boolean);
      return parts.join(' — ') || ad?.store_name || '';
    }
    return '';
  }

  private buildSearchHaystack(ad: any): string {
    const typeLabel = this.getAdTypeLabel(ad?.ad_type);
    const categoryLabel = this.getCategoryLabel(ad);
    const data = [
      ad?.ad_type,
      typeLabel,
      categoryLabel,
      ad?.store_name,
      ad?.owner_name,
      ad?.city,
      ad?.category_id,
      ad?.sub_category_name,
      ad?.delivery_match_key,
      ad?.education_match_key,
      ad?.other_match_key,
      ad?.details?.title,
      ad?.details?.short_desc,
      ad?.details?.full_details,
      ad?.details?.description,
      ad?.details?.subject,
      ad?.details?.product_name,
      ad?.details?.service_name,
      ad?.details?.vehicle_name,
      ad?.details?.teacher_name,
      ad?.details?.provider_name
    ].filter(Boolean);
    return data.join(' ');
  }

  private editDistance(a: string, b: string, maxDistance = 2): number {
    if (a === b) return 0;
    const al = a.length;
    const bl = b.length;
    if (Math.abs(al - bl) > maxDistance) return maxDistance + 1;
    if (!al) return bl;
    if (!bl) return al;

    const prev = new Array<number>(bl + 1);
    const curr = new Array<number>(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;

    for (let i = 1; i <= al; i++) {
      curr[0] = i;
      let rowMin = curr[0];
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        );
        if (curr[j] < rowMin) rowMin = curr[j];
      }
      if (rowMin > maxDistance) return maxDistance + 1;
      for (let j = 0; j <= bl; j++) prev[j] = curr[j];
    }
    return prev[bl];
  }

  private getSearchIndexForAd(ad: any): { haystack: string; words: string[] } {
    const adId = String(ad?.id || ad?.ad_id || '');
    const cacheKey = adId || JSON.stringify([ad?.ad_type, ad?.owner_name, ad?.city, ad?.category_id]);
    const cached = this.searchHaystackCache.get(cacheKey);
    if (cached) return cached;

    const haystack = this.normalizeText(this.buildSearchHaystack(ad));
    const words = haystack ? Array.from(new Set(haystack.split(' ').filter(Boolean))) : [];
    const payload = { haystack, words };
    this.searchHaystackCache.set(cacheKey, payload);
    return payload;
  }

  private tokenMatchScore(token: string, haystack: string, haystackWords: string[]): number {
    if (!token) return 0;
    const alternatives = this.expandTokenAlternatives(token);
    let bestScore = 0;

    for (const alt of alternatives) {
      if (!alt) continue;
      if (
        haystack.includes(` ${alt} `) ||
        haystack.startsWith(`${alt} `) ||
        haystack.endsWith(` ${alt}`) ||
        haystack === alt
      ) {
        bestScore = Math.max(bestScore, 120);
      } else if (haystack.includes(alt)) {
        bestScore = Math.max(bestScore, 95);
      }

      for (const word of haystackWords) {
        if (!word) continue;
        if (word === alt) {
          bestScore = Math.max(bestScore, 125);
          continue;
        }
        if (word.startsWith(alt) || alt.startsWith(word)) {
          bestScore = Math.max(bestScore, 90);
          continue;
        }
        if (word.includes(alt) || alt.includes(word)) {
          bestScore = Math.max(bestScore, 70);
          continue;
        }
        const distance = this.editDistance(alt, word, 2);
        if (distance <= 1) {
          bestScore = Math.max(bestScore, 65);
        } else if (distance === 2 && alt.length >= 5 && word.length >= 5) {
          bestScore = Math.max(bestScore, 45);
        }
      }
    }

    return bestScore;
  }

  private computeAdSearchScore(ad: any, tokens: string[]): number {
    if (!tokens.length) return 0;
    const { haystack, words } = this.getSearchIndexForAd(ad);
    if (!haystack) return 0;

    let total = 0;
    let matchedTokens = 0;
    for (const token of tokens) {
      const tokenScore = this.tokenMatchScore(token, haystack, words);
      if (tokenScore > 0) {
        matchedTokens++;
        total += tokenScore;
      }
    }
    if (matchedTokens === 0) return 0;

    const coverage = matchedTokens / tokens.length;
    if (coverage < 0.55) return 0;
    const coverageBoost = coverage >= 1 ? 1.25 : coverage >= 0.8 ? 1.1 : 1;
    return Math.round(total * coverageBoost);
  }

  private getStaticName(id: string): string {
    const names: { [key: string]: string } = {
      'transportation': 'نقل وتوصيل',
      'education': 'خدمات تعليمية',
      'other_services': 'خدمات أخرى',
      'stores_types': 'المتاجر',
      'products': 'المنتجات'
    };
    return names[id] || 'قسم غير معروف';
  }

  private async fetchSearchPageSearch(event?: any) {
    if (this.isLoadingSearch || !this.searchHasMore) {
      if (event?.target) event.target.complete();
      return;
    }
    this.isLoadingSearch = true;
    try {
      const snapshot = await runInInjectionContext(this.injector, () => {
        const adsRef = collection(this.firestore, 'ads');
        let qBase: any;
        qBase = query(adsRef, orderBy('created_at', 'desc'), limit(20));
        const qFinal = this.searchLastVisible ? query(qBase, startAfter(this.searchLastVisible)) : qBase;
        return getDocs(qFinal);
      });
      const pageDocs = snapshot.docs || [];
      if (pageDocs.length === 0) {
        this.searchHasMore = false;
        if (event?.target) event.target.complete();
        this.isLoadingSearch = false;
        return;
      }
      this.searchLastVisible = pageDocs[pageDocs.length - 1];
      const pageAds = pageDocs.map((d) => {
        const data: any = d.data() as any;
        return Object.assign({ id: d.id }, data || {});
      });
      const queryTokens = this.searchQueryTokens.length
        ? this.searchQueryTokens
        : this.tokenizeText(this.searchText);
      const scored = pageAds
        .filter((ad: any) => ad.status === 'active' && this.isCityMatchAd(ad))
        .map((ad: any) => ({ ad, score: this.computeAdSearchScore(ad, queryTokens) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.ad);

      const merged = [...this.searchList, ...scored];
      const dedupMap = new Map<string, any>();
      for (const ad of merged) {
        const id = String(ad?.id || ad?.ad_id || '');
        if (!id || !dedupMap.has(id)) dedupMap.set(id || JSON.stringify(ad), ad);
      }
      this.searchList = sortHomeFeedAdsForDisplay(Array.from(dedupMap.values()));
      if (pageDocs.length < 20) this.searchHasMore = false;
    } catch (err) {
      console.error('Error fetching search page:', err);
      this.searchHasMore = false;
    } finally {
      if (event?.target) event.target.complete();
      this.isLoadingSearch = false;
    }
  }

  async loadMoreSearch(event: any) {
    if (!this.searchText || this.searchText.trim().length < 2) {
      if (event?.target) event.target.complete();
      return;
    }
    await this.fetchSearchPageSearch(event);
  }

  // دالة معالجة سحب الشاشة لأسفل لعمل refresh
  async handleRefresh(event: any) {
    this.tabCountsPoolCache = null;
    if (this.selectedCategory) {
      const adType = this.mapCategoryToAdType(this.selectedCategory);
      if (adType) {
        this.homeAdsRt.stop();
        this.fCache.remove(FirestoreCacheService.adsListCacheKey(adType));
        this.fCache.removeHomeAdsSyncMeta(adType);
      }
      await this.refreshSectionTabCounts();
    } else if (this.searchText.length >= 2) {
      await this.loadSearchResults();
    }
    event.target.complete();
  }

  /**
   * قيود Firestore لقائمة الرئيسية: الفلترة حسب التاب الفرعي على الخادم
   * حتى تكون أول صفحة (ولاحقاً الترقيم) ممتلئة بإعلانات مطابقة فعلياً.
   */
  private buildHomeFeedQueryConstraints(adType: string): QueryConstraint[] {
    const c: QueryConstraint[] = [where('ad_type', '==', adType)];
    const cat = this.selectedCategory;

    if (cat === 'transportation' && this.selectedDeliveryCategory !== 'all') {
      c.push(where('category_id', '==', this.selectedDeliveryCategory));
    }
    if (cat === 'education' && this.selectedEducationStage !== 'all') {
      c.push(where('category_id', '==', this.selectedEducationStage));
    }
    if (cat === 'education' && this.selectedEducationSubject !== 'all') {
      c.push(where('details.subject', '==', this.selectedEducationSubject));
    }
    if (cat === 'other_services' && this.selectedOtherService !== 'all') {
      c.push(where('category_id', '==', this.selectedOtherService));
    }
    if (cat === 'products' && this.selectedProductCategory !== 'all') {
      c.push(where('category_id', '==', this.selectedProductCategory));
    }
    if (cat === 'products' && this.selectedProductSubcategory !== 'all') {
      c.push(where('sub_category_name', '==', this.selectedProductSubcategory));
    }
    if (cat === 'stores_types' && this.selectedStoreType !== 'all') {
      c.push(where('category_id', '==', this.selectedStoreType));
    }

    c.push(orderBy('created_at', 'desc'));
    c.push(limit(20));
    return c;
  }

  private async fetchAdsPage(adType: string, event?: any) {
    if (this.isLoadingPage || !this.hasMore) {
      if (event?.target) event.target.complete();
      return;
    }
    this.isLoadingPage = true;
    try {
      const snapshot = await runInInjectionContext(this.injector, () => {
        const adsRef = collection(this.firestore, 'ads');
        const qBase = query(adsRef, ...this.buildHomeFeedQueryConstraints(adType));
        const qFinal = this.lastVisible ? query(qBase, startAfter(this.lastVisible)) : qBase;
        return getDocs(qFinal);
      });
      const pageDocs = snapshot.docs || [];
      if (pageDocs.length === 0) {
        this.hasMore = false;
        if (event?.target) event.target.complete();
        this.isLoadingPage = false;
        return;
      }
      this.lastVisible = pageDocs[pageDocs.length - 1];
      const pageAds = pageDocs.map((d) =>
        slimAdForHomeFeed(Object.assign({ id: d.id }, d.data() || {}), adType)
      );
      const filtered = pageAds.filter(
        (ad: any) => ad.status === 'active' && this.isCityMatchAd(ad)
      );
      const merged = [...this.adsList, ...filtered];
      this.adsList = sortHomeFeedAdsForDisplay(merged);
      if (pageDocs.length < 20) this.hasMore = false;
    } catch (err) {
      console.error('Error fetching ads page:', err);
      this.hasMore = false;
    } finally {
      if (event?.target) event.target.complete();
      this.isLoadingPage = false;
    }
  }

  async loadMore(event: any) {
    if (!this.selectedCategory) {
      if (event?.target) event.target.complete();
      return;
    }
    let adType = this.selectedCategory;
    if (adType === 'transportation') adType = 'delivery';
    else if (adType === 'education') adType = 'education';
    else if (adType === 'other_services') adType = 'other';
    else if (adType === 'products') adType = 'product';
    else if (adType === 'stores_types') adType = 'store';
    await this.fetchAdsPage(adType, event);
  }

}
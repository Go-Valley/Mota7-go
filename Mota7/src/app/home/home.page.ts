import { Component, OnInit, OnDestroy, inject, EnvironmentInjector, runInInjectionContext, HostBinding } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { IonicModule, Platform, AlertController } from '@ionic/angular';
import { App } from '@capacitor/app';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData, query, orderBy, where, getDocs, limit, startAfter } from '@angular/fire/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import { Observable, of, Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { map, catchError, filter } from 'rxjs/operators';
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
    StoreHomeCardComponent
  ]
})
export class HomePage implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private platform = inject(Platform);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private taxonomy = inject(AppTaxonomyService);
  private taxonomySub?: Subscription;

  /** لا نعيد تصفير الصفحة إذا رجع المستخدم من صفحة تفاصيل المتجر حتى يعود لقسم المتاجر بنفس حالته. */
  private preserveNextViewEnter = false;
  private previousTrackedUrl = '';
  private routerEventsSub?: Subscription;

  ionViewWillEnter() {
    if (this.preserveNextViewEnter) {
      this.preserveNextViewEnter = false;
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

  /** رسالة عند الاعتماد الكامل على الثوابت (فشل جلب التصنيفات من Firestore) */
  taxonomyLoadWarning: string | null = null;
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
  }

  ngOnInit() {
    this.taxonomySub = this.taxonomy.bundle$.subscribe((b) => {
      this.deliveryCategories = b.deliveryItems;
      this.educationStages = b.educationItems;
      this.otherServices = b.otherItems;
      this.productCategories = b.productItems;
      this.storeTypes = b.storeItems;
      if (!b.loadedFromFirebase) {
        this.taxonomyLoadWarning =
          'اهلأ بيك على "مُتاح"';
      } else {
        this.taxonomyLoadWarning = null;
      }
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
      const categoriesRef = collection(this.firestore, 'Categories');
      const q = query(categoriesRef, orderBy('order', 'asc'));
      this.categories$ = collectionData(q, { idField: 'id' }).pipe(
        map((rows: any[] | undefined) =>
          rows != null ? rows.map((c) => ({ ...c, icon: resolveTaxonomyIcon(c?.icon) })) : null
        ),
        catchError((err) => {
          console.error('Failed to load Categories from Firestore:', err);
          return of(null);
        })
      );
    });

    // معالجة زر الرجوع في الموبايل
    this.setupBackButtonHandler();
  }

  // --- دوال زر المدينة ---
  toggleCityPopover() {
    this.showCityPopover = !this.showCityPopover;
  }

  closeCityPopover() {
    this.showCityPopover = false;
  }

  selectCity(city: string) {
    this.selectedCityLabel = city;
    this.showCityPopover = false;
    // مسح الكاش لإجبار إعادة الجلب من الخادم لمدينة جديدة
    this.tabCountsPoolCache = null;
    this.loadAdsForCategory(this.selectedCategory);
    // إذا كان هناك بحث نشط عند تغيير المدينة، يتم تحديث نتائجه
    if (this.searchText.length >= 2) {
      this.loadSearchResults();
    }
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
    this.selectedCategory = typeof service === 'string' ? service : (service.id || service.nameAr);
    this.selectedCategoryName = typeof service === 'string' ? this.getStaticName(service) : service.nameAr;
    this.resetFilters();
    
    if (this.selectedCategoryName === 'نقل وتوصيل' || this.selectedCategory === 'transportation') {
      this.selectedCategory = 'transportation';
    }
    this.loadAdsForCategory(this.selectedCategory);
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

    // إعادة ضبط الحالة للتحميل الأول
    this.adsList = [];
    this.lastVisible = null;
    this.hasMore = true;
    this.isLoadingPage = false;

    // refreshSectionTabCounts سيقوم بجلب البيانات وتحديث adsList داخلياً
    void this.refreshSectionTabCounts();
  }

  backToHome() {
    this.selectedCategory = null;
    this.selectedCategoryName = '';
    this.resetFilters();
    this.filteredAds$ = undefined;
    this.selectedCityLabel = 'الكل';
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

  private normalizeCity(input: any): string {
    const normalized = this.normalizeText(input);
    // Normalize common Egyptian city writing variants.
    return normalized
      .replace(/^محافظه\s+/g, '')
      .replace(/^محافظة\s+/g, '')
      .replace(/^مدينه\s+/g, '')
      .replace(/^مدينة\s+/g, '')
      .replace(/^مركز\s+/g, '')
      .trim();
  }

  private isCityMatch(adCity: any): boolean {
    if (this.selectedCityLabel === 'الكل') return true;
    const selected = this.normalizeCity(this.selectedCityLabel);
    const ad = this.normalizeCity(adCity);
    if (!selected) return true;
    if (!ad) return false;
    return ad === selected || ad.includes(selected) || selected.includes(ad);
  }

  /** نفس شروط العرض في القائمة: مفعل + المدينة المختارة */
  private passesBaseHomeFilters(ad: any): boolean {
    return ad?.status === 'active' && this.isCityMatch(ad.city);
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

  private async fetchAllRawAdsByType(adType: string): Promise<any[]> {
    const all: any[] = [];
    let lastVisible: any = null;
    const pageSize = 300;
    await runInInjectionContext(this.injector, async () => {
      const adsRef = collection(this.firestore, 'ads');
      for (;;) {
        const qBase = query(
          adsRef,
          where('ad_type', '==', adType),
          orderBy('created_at', 'desc'),
          limit(pageSize)
        );
        const qFinal = lastVisible ? query(qBase, startAfter(lastVisible)) : qBase;
        const snap = await getDocs(qFinal);
        if (snap.empty) {
          break;
        }
        for (const d of snap.docs) {
          all.push(Object.assign({ id: d.id }, d.data() || {}));
        }
        if (snap.docs.length < pageSize) {
          break;
        }
        lastVisible = snap.docs[snap.docs.length - 1];
      }
    });
    return all;
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
      return;
    }
    const adType = this.mapCategoryToAdType(cat);
    if (!adType) {
      return;
    }

    const cityLabel = this.selectedCityLabel;
    const cache = this.tabCountsPoolCache;
    if (cache && cache.adType === adType && cache.cityLabel === cityLabel) {
      this.applyTabCountsForCategory(cat, cache.pool);
      this.syncAdsListWithPool();
      return;
    }

    const reqId = ++this.tabCountsRequestId;
    try {
      this.isLoadingPage = true;
      const raw = await this.fetchAllRawAdsByType(adType);
      if (reqId !== this.tabCountsRequestId) {
        return;
      }
      // تحويل الإعلانات إلى النسخة الخفيفة وتصفيتها حسب المدينة
      const pool = raw
        .map(ad => slimAdForHomeFeed(ad, adType))
        .filter((ad) => this.passesBaseHomeFilters(ad));
        
      this.tabCountsPoolCache = { adType, cityLabel, pool };
      this.applyTabCountsForCategory(cat, pool);
      this.syncAdsListWithPool();
    } catch (e) {
      console.error('refreshSectionTabCounts', e);
    } finally {
      this.isLoadingPage = false;
    }
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
        .filter((ad: any) => ad.status === 'active' && this.isCityMatch(ad.city))
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
    this.tabCountsPoolCache = null; // مسح الكاش لإجبار إعادة التحميل من الخادم
    if (this.selectedCategory) {
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
        (ad: any) => ad.status === 'active' && this.isCityMatch(ad.city)
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
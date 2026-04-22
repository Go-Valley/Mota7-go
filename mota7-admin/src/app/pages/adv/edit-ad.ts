import { Component, Input, OnInit, inject, DestroyRef, Injector, NgZone } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ToastController, LoadingController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import { cameraOutline, trashOutline } from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { normalizeUserFreeText, readIonTextInputValueFromEvent } from '../../core/utils/ion-text-input.util';
import { CloudinaryUploadService } from '../../services/cloudinary-upload.service';
import { CloudinaryCleanupService } from '../../services/cloudinary-cleanup.service';
import { STORES_CATEGORIES_DATA } from '@mota7-app/core/constants/stores-data';
import { DELIVERY_CATEGORY } from '@mota7-app/core/constants/delivery-data';
import { EDUCATION_CATEGORY } from '@mota7-app/core/constants/educational-data';
import { OTHER_SERVICES_DATA } from '@mota7-app/core/constants/other-services-data';
import { PRODUCTS_CATEGORY } from '@mota7-app/core/constants/products-data';
import { tryParseCloudinaryPublicIdFromUrl } from '../../core/utils/cloudinary-public-id.util';
import { AppTaxonomyService } from '@mota7-app/core/services/app-taxonomy.service';

@Component({
  selector: 'app-edit-ad-modal',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent],
  templateUrl: './edit-ad.html',
  styleUrls: ['./edit-ad.scss']
})
export class EditAdModal implements OnInit {
  @Input() ad: any;

  private modalCtrl = inject(ModalController);
  private firestore = inject(Firestore);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private uploadSvc = inject(CloudinaryUploadService);
  private cloudinaryCleanup = inject(CloudinaryCleanupService);
  private injector = inject(Injector);
  private ngZone = inject(NgZone);
  private destroyRef = inject(DestroyRef);
  /** لا نحقن الخدمة في الحقل — فشل الحقن على WebView يمنع إنشاء المودال بالكامل */
  private taxonomy: AppTaxonomyService | null = null;

  /**
   * قوائم فرعية من Firestore (Categories/...) لبناء الـ select وحساب *_match_key بأسماء عربية صحيحة.
   */
  private dynamicOtherItems: Array<{ id: string; nameAr: string }> = [];
  private dynamicDeliveryItems: Array<{ id: string; nameAr: string }> = [];
  private dynamicEducationItems: Array<{ id: string; nameAr: string; subjects?: string[] }> = [];
  private dynamicProductItems: Array<{ id: string; nameAr: string; subcategories?: string[] }> = [];
  private dynamicStoreItems: Array<{ id: string; nameAr: string }> = [];

  editData: any = {};
  /** موازية لـ details.images — لحذف الملف من Cloudinary عند إزالة صورة */
  productImagePublicIds: string[] = [];

  /** مدن الإعلان كما في تطبيق المستخدم (ملف المستخدم / الرئيسية) */
  private readonly adCityBaseOptions = ['الخارجة', 'الداخلة'];

  /**
   * قوائم الاختيار مُخزَّنة كمرجع ثابت — تجنّب getters تعيد مصفوفة جديدة كل change detection
   * (كانيسبب تجميد/حلقة مع ion-select و *ngFor).
   */
  storeCategoryItemsForSelect: Array<{ id: string; nameAr: string }> = [];
  deliveryCategoryItemsForSelect: Array<{ id: string; nameAr: string }> = [];
  educationStageItemsForSelect: Array<{ id: string; nameAr: string }> = [];
  otherServiceCategoryItemsForSelect: Array<{ id: string; nameAr: string }> = [];
  productMainCategoryItemsForSelect: Array<{ id: string; nameAr: string }> = [];
  educationSubjectOptionsForSelect: string[] = [];
  productSubCategoryOptionsForSelect: string[] = [];
  citySelectOptions: string[] = [];

  constructor() {
    addIcons({ cameraOutline, trashOutline });
  }

  /**
   * بناء قوائم الـ ion-select مرّة واحدة فقط عند فتح المودال — مع حماية من القيم القديمة.
   * تُستدعى مرّة في ngOnInit فقط؛ لا تستدعى من (ionChange) أبداً (وإلا حلقة لانهائية مع *ngFor).
   */
  private buildAllCategoryListsOnce(): void {
    const cid = (this.editData?.category_id || '').toString();
    const adType = this.editData?.ad_type;

    if (adType === 'store') {
      const base =
        this.dynamicStoreItems.length > 0
          ? this.dynamicStoreItems
          : STORES_CATEGORIES_DATA.items.map((i) => ({ id: i.id, nameAr: i.nameAr }));
      this.storeCategoryItemsForSelect = this.itemsWithLegacyGuard(
        base,
        cid,
        '— تصنيف قديم، يُنصح باختيار نوع من القائمة المحدثة'
      );
    } else if (adType === 'delivery') {
      const base =
        this.dynamicDeliveryItems.length > 0
          ? this.dynamicDeliveryItems
          : DELIVERY_CATEGORY.items.map((i) => ({ id: i.id, nameAr: i.nameAr }));
      this.deliveryCategoryItemsForSelect = this.itemsWithLegacyGuard(
        base,
        cid,
        '— تصنيف قديم'
      );
    } else if (adType === 'education') {
      const base =
        this.dynamicEducationItems.length > 0
          ? this.dynamicEducationItems.map((i) => ({ id: i.id, nameAr: i.nameAr }))
          : EDUCATION_CATEGORY.items.map((i) => ({ id: i.id, nameAr: i.nameAr }));
      this.educationStageItemsForSelect = this.itemsWithLegacyGuard(
        base,
        cid,
        '— مرحلة قديمة'
      );
      this.rebuildEducationSubjectOptions();
    } else if (adType === 'other') {
      const base =
        this.dynamicOtherItems.length > 0
          ? this.dynamicOtherItems
          : OTHER_SERVICES_DATA.items.map((i) => ({ id: i.id, nameAr: i.nameAr }));
      this.otherServiceCategoryItemsForSelect = this.itemsWithLegacyGuard(
        base,
        cid,
        '— نوع خدمة قديم'
      );
    } else if (adType === 'product') {
      const base =
        this.dynamicProductItems.length > 0
          ? this.dynamicProductItems.map((i) => ({ id: i.id, nameAr: i.nameAr }))
          : PRODUCTS_CATEGORY.items.map((i) => ({ id: i.id, nameAr: i.nameAr }));
      this.productMainCategoryItemsForSelect = this.itemsWithLegacyGuard(
        base,
        cid,
        '— قسم قديم'
      );
      this.rebuildProductSubCategoryOptions();
    }
  }

  /** trackBy آمنة لـ *ngFor على عناصر التصنيف (id ثابت) */
  trackByCategoryId(_i: number, item: { id: string }): string {
    return item?.id ?? String(_i);
  }

  /** trackBy لقوائم النصوص (المواد، الفئات، المدن) */
  trackByString(_i: number, val: string): string {
    return val ?? String(_i);
  }

  private rebuildEducationSubjectOptions(): void {
    const id = this.editData?.category_id;
    const cat =
      this.dynamicEducationItems.find((c) => c.id === id) ||
      EDUCATION_CATEGORY.items.find((c) => c.id === id);
    const base = cat?.subjects?.length ? [...cat.subjects] : [];
    const cur = (this.editData?.details?.subject || '').trim();
    if (cur && !base.includes(cur)) {
      this.educationSubjectOptionsForSelect = [cur, ...base];
    } else {
      this.educationSubjectOptionsForSelect = base;
    }
  }

  private rebuildProductSubCategoryOptions(): void {
    const id = this.editData?.category_id;
    const cat =
      this.dynamicProductItems.find((c) => c.id === id) ||
      PRODUCTS_CATEGORY.items.find((c) => c.id === id);
    const base = cat?.subcategories?.length ? [...cat.subcategories] : [];
    const cur = (this.editData?.sub_category_name || '').trim();
    if (cur && !base.includes(cur)) {
      this.productSubCategoryOptionsForSelect = [cur, ...base];
    } else {
      this.productSubCategoryOptionsForSelect = base;
    }
  }

  private rebuildCitySelectOptions(): void {
    const c = (this.editData?.city || '').trim();
    if (c && !this.adCityBaseOptions.includes(c)) {
      this.citySelectOptions = [c, ...this.adCityBaseOptions];
    } else {
      this.citySelectOptions = [...this.adCityBaseOptions];
    }
  }

  private itemsWithLegacyGuard(
    base: Array<{ id: string; nameAr: string }>,
    currentId: string | undefined,
    legacySuffix: string
  ): Array<{ id: string; nameAr: string }> {
    const ids = new Set(base.map((x) => x.id));
    if (typeof currentId === 'string' && currentId.trim() && !ids.has(currentId.trim())) {
      return [{ id: currentId, nameAr: `(${currentId}) ${legacySuffix}` }, ...base];
    }
    return base;
  }

  /**
   * يُستدعى عند تغيير المرحلة فعلياً من المستخدم (لا نلمس قائمة المراحل الأم — فقط المواد).
   * نتجاهل أي استدعاء إذا لم تتغير القيمة عن آخر معالَجة (يحمي من ionChange المتكرّر).
   */
  private lastEducationCategoryId: string | null = null;
  onEducationStageIonChange(): void {
    const cur = (this.editData?.category_id || '').toString();
    if (this.lastEducationCategoryId === cur) return;
    this.lastEducationCategoryId = cur;
    const subs =
      this.dynamicEducationItems.find((c) => c.id === cur)?.subjects ||
      EDUCATION_CATEGORY.items.find((c) => c.id === cur)?.subjects ||
      [];
    const subj = (this.editData?.details?.subject || '').trim();
    if (subj && subs.length && !subs.includes(subj)) {
      this.editData.details.subject = '';
    }
    this.rebuildEducationSubjectOptions();
  }

  private lastProductCategoryId: string | null = null;
  onProductMainCategoryIonChange(): void {
    const cur = (this.editData?.category_id || '').toString();
    if (this.lastProductCategoryId === cur) return;
    this.lastProductCategoryId = cur;
    const subs =
      this.dynamicProductItems.find((c) => c.id === cur)?.subcategories ||
      PRODUCTS_CATEGORY.items.find((c) => c.id === cur)?.subcategories ||
      [];
    const sub = (this.editData?.sub_category_name || '').trim();
    if (sub && subs.length && !subs.includes(sub)) {
      this.editData.sub_category_name = '';
    }
    this.rebuildProductSubCategoryOptions();
  }

  ngOnInit() {
    if (this.ad) {
      try {
        this.editData = JSON.parse(JSON.stringify(this.ad)) as any;
      } catch {
        this.editData = { ...(this.ad as object) } as any;
        if (this.ad && typeof this.ad === 'object' && 'details' in this.ad) {
          this.editData.details = {
            ...((this.ad as any).details && typeof (this.ad as any).details === 'object'
              ? (this.ad as any).details
              : {}),
          };
        }
      }

      if (!this.editData.details) this.editData.details = {};
      if (!this.editData.details.images) this.editData.details.images = [];

      if (this.editData.ad_type === 'product') {
        const imgs = Array.isArray(this.editData.details.images) ? [...this.editData.details.images] : [];
        const rawIds = this.editData.details.images_cloudinary_public_ids;
        const idArr = Array.isArray(rawIds) ? rawIds : [];
        this.editData.details.images = imgs;
        this.productImagePublicIds = imgs.map((_, i) => (typeof idArr[i] === 'string' ? idArr[i] : ''));
      }

      if (this.editData.ad_type === 'store') {
        this.editData.logo = this.editData.logo || '';
        this.editData.logo_cloudinary_public_id = this.editData.logo_cloudinary_public_id || '';
      }

      this.rebuildCitySelectOptions();
      this.lastEducationCategoryId = (this.editData?.category_id || '').toString();
      this.lastProductCategoryId = (this.editData?.category_id || '').toString();
    }

    try {
      this.taxonomy = this.injector.get(AppTaxonomyService);
    } catch (err) {
      this.taxonomy = null;
      console.error('EditAdModal: failed to resolve AppTaxonomyService — using static category lists', err);
    }

    if (this.taxonomy) {
      this.taxonomy.bundle$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (b) => {
            this.ngZone.run(() => {
              this.dynamicOtherItems = (b?.otherItems ?? [])
                .map((i: any) => ({
                  id: String(i?.id ?? ''),
                  nameAr: String(i?.nameAr ?? ''),
                }))
                .filter((i) => !!i.id);
              this.dynamicDeliveryItems = (b?.deliveryItems ?? [])
                .map((i: any) => ({
                  id: String(i?.id ?? ''),
                  nameAr: String(i?.nameAr ?? ''),
                }))
                .filter((i) => !!i.id);
              this.dynamicEducationItems = (b?.educationItems ?? []).map((i: any) => ({
                id: String(i?.id ?? ''),
                nameAr: String(i?.nameAr ?? ''),
                subjects: Array.isArray(i?.subjects) ? [...i.subjects] : [],
              })).filter((i) => !!i.id);
              this.dynamicProductItems = (b?.productItems ?? []).map((i: any) => ({
                id: String(i?.id ?? ''),
                nameAr: String(i?.nameAr ?? ''),
                subcategories: Array.isArray(i?.subcategories) ? [...i.subcategories] : [],
              })).filter((i) => !!i.id);
              this.dynamicStoreItems = (b?.storeItems ?? [])
                .map((i: any) => ({
                  id: String(i?.id ?? ''),
                  nameAr: String(i?.nameAr ?? ''),
                }))
                .filter((i) => !!i.id);

              if (this.editData?.ad_type) {
                this.buildAllCategoryListsOnce();
                this.rebuildEducationSubjectOptions();
                this.rebuildProductSubCategoryOptions();
              }
            });
          },
          error: (err) => {
            console.error('EditAdModal: taxonomy bundle$ error', err);
          },
        });
    }

    if (this.ad) {
      this.buildAllCategoryListsOnce();
    }
  }

  /** مزامنة ion-input/textarea مع IME؛ القالب يستخدم [ngModel] أحادي + هذا المعالج فقط لتحديث النموذج من الحدث (لا تستخدم [(ngModel)] هنا — صراع مع الحذف على أندرويد). */
  onEditIonInput(ev: Event, path: string): void {
    const v = readIonTextInputValueFromEvent(ev);
    const parts = path.split('.');
    let o: any = this.editData;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (o[key] == null || typeof o[key] !== 'object') {
        o[key] = {};
      }
      o = o[key];
    }
    const leaf = parts[parts.length - 1];
    const cur = o[leaf];
    if (Object.is(cur, v) || String(cur ?? '') === String(v)) {
      return;
    }
    o[leaf] = v;
  }

  private sanitizeEditStringsBeforeSave(): void {
    const e = this.editData;
    e.city = normalizeUserFreeText(e.city ?? '');
    e.owner_phone = normalizeUserFreeText(e.owner_phone ?? '');
    e.store_name = normalizeUserFreeText(e.store_name ?? '');
    e.owner_name = normalizeUserFreeText(e.owner_name ?? '');
    e.sub_category_name = normalizeUserFreeText(e.sub_category_name ?? '');
    if (!e.details) {
      return;
    }
    const d = e.details;
    d.driver_name = normalizeUserFreeText(d.driver_name ?? '');
    d.teacher_name = normalizeUserFreeText(d.teacher_name ?? '');
    d.subject = normalizeUserFreeText(d.subject ?? '');
    d.whatsapp_phone = normalizeUserFreeText(d.whatsapp_phone ?? '');
    d.provider_name = normalizeUserFreeText(d.provider_name ?? '');
    d.title = normalizeUserFreeText(d.title ?? '');
    d.short_desc = normalizeUserFreeText(d.short_desc ?? '');
    d.full_details = normalizeUserFreeText(d.full_details ?? '');
  }

  async removeProductImage(index: number) {
    const urls = this.editData.details.images as string[];
    const url = urls[index];
    const toDelete = new Set<string>();
    const pid = this.productImagePublicIds[index];
    if (typeof pid === 'string' && pid.trim()) {
      toDelete.add(pid.trim());
    }
    if (typeof url === 'string' && url.includes('res.cloudinary.com')) {
      const parsed = tryParseCloudinaryPublicIdFromUrl(url);
      if (parsed?.startsWith('products/')) {
        toDelete.add(parsed);
      }
    }
    if (toDelete.size) {
      await this.cloudinaryCleanup.deletePublicIds([...toDelete]).catch(() => {});
    }
    this.editData.details.images.splice(index, 1);
    this.productImagePublicIds.splice(index, 1);
  }

  async onProductImageFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const loader = await this.loadingCtrl.create({ message: 'جاري رفع الصورة...', mode: 'ios' });
    await loader.present();
    try {
      const { url, publicId } = await this.uploadSvc.uploadImage(file, 'products');
      this.editData.details.images.push(url);
      this.productImagePublicIds.push(publicId);
      await this.showToast('تمت إضافة الصورة', 'success');
    } catch (e) {
      console.error(e);
      await this.showToast('فشل رفع الصورة', 'danger');
    } finally {
      loader.dismiss();
    }
  }

  async onStoreLogoFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const loader = await this.loadingCtrl.create({ message: 'جاري رفع اللوجو...', mode: 'ios' });
    await loader.present();
    try {
      const oldId =
        typeof this.editData.logo_cloudinary_public_id === 'string'
          ? this.editData.logo_cloudinary_public_id.trim()
          : '';
      const { url, publicId } = await this.uploadSvc.uploadImage(file, 'stores');
      if (oldId) {
        await this.cloudinaryCleanup.deletePublicIds([oldId]).catch(() => {});
      }
      this.editData.logo = url;
      this.editData.logo_cloudinary_public_id = publicId;
      await this.showToast('تم تحديث لوجو المتجر', 'success');
    } catch (e) {
      console.error(e);
      await this.showToast('فشل رفع اللوجو', 'danger');
    } finally {
      loader.dismiss();
    }
  }

  async removeStoreLogo() {
    const toDelete = new Set<string>();
    const oldId =
      typeof this.editData.logo_cloudinary_public_id === 'string'
        ? this.editData.logo_cloudinary_public_id.trim()
        : '';
    if (oldId) {
      toDelete.add(oldId);
    }
    const logo = this.editData.logo;
    if (typeof logo === 'string' && logo.includes('res.cloudinary.com')) {
      const parsed = tryParseCloudinaryPublicIdFromUrl(logo);
      if (parsed?.startsWith('stores/')) {
        toDelete.add(parsed);
      }
    }
    if (toDelete.size) {
      await this.cloudinaryCleanup.deletePublicIds([...toDelete]).catch(() => {});
    }
    this.editData.logo = '';
    this.editData.logo_cloudinary_public_id = '';
  }

  async saveChanges() {
    try {
      const docId = this.ad.id || this.ad.ad_id;
      
      if (!docId) {
        this.showToast('عذراً، لم يتم العثور على معرف الإعلان', 'danger');
        return;
      }

      this.sanitizeEditStringsBeforeSave();

      const adRef = doc(this.firestore, 'ads', docId);

      // البيانات الأساسية المشتركة
      const updatePayload: any = {
        "city": this.editData.city || '',
        "owner_phone": this.editData.owner_phone || '',
        "updated_at": serverTimestamp()
      };

      // 1. إعلانات التوصيل
      if (this.editData.ad_type === 'delivery') {
        updatePayload["category_id"] = this.editData.category_id || ''; 
        updatePayload["details.driver_name"] = this.editData.details.driver_name || '';
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        updatePayload["details.can_travel"] = !!this.editData.details.can_travel;
        updatePayload["details.for_rent"] = !!this.editData.details.for_rent;
        updatePayload["details.is_available"] = !!this.editData.details.is_available;

        const dDyn = this.dynamicDeliveryItems.find((i) => i.id === this.editData.category_id);
        const dItem = DELIVERY_CATEGORY.items.find((i) => i.id === this.editData.category_id);
        const typeAr = dDyn?.nameAr || dItem?.nameAr || this.editData.category_id || 'توصيل';
        updatePayload["delivery_match_key"] = `${typeAr}_${this.editData.city}`;
      } 
      
      // 2. إعلانات التعليم
      else if (this.editData.ad_type === 'education') {
        updatePayload["details.teacher_name"] = this.editData.details.teacher_name || '';
        updatePayload["details.subject"] = this.editData.details.subject || '';
        updatePayload["category_id"] = this.editData.category_id || ''; 
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        updatePayload["is_available"] = !!this.editData.is_available;

        const eduDyn = this.dynamicEducationItems.find((i) => i.id === this.editData.category_id);
        const eduItem = EDUCATION_CATEGORY.items.find((i) => i.id === this.editData.category_id);
        const stageAr = eduDyn?.nameAr || eduItem?.nameAr || this.editData.category_id || 'تعليم';

        updatePayload["education_match_key"] = `${stageAr}+${this.editData.details.subject}+${this.editData.city}`;
      }
      
      // 3. الخدمات الأخرى
      else if (this.editData.ad_type === 'other') {
        updatePayload["details.provider_name"] = this.editData.details.provider_name || '';
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        updatePayload["is_available"] = !!this.editData.is_available;
        updatePayload["category_id"] = this.editData.category_id || '';

        // نُفضّل البحث في القائمة الديناميكية (Firestore) لاستخراج الاسم الصحيح
        // للفروع المضافة حديثاً، ثم نرتدّ للقائمة الثابتة احتياطاً.
        const dynItem = this.dynamicOtherItems.find((i) => i.id === this.editData.category_id);
        const oItem = OTHER_SERVICES_DATA.items.find((i) => i.id === this.editData.category_id);
        const currentNameAr =
          dynItem?.nameAr || oItem?.nameAr || this.editData.category_id || 'خدمات أخرى';
        updatePayload["other_match_key"] = `${currentNameAr}_${this.editData.city}`;
      }

      // 4. المتاجر
      else if (this.editData.ad_type === 'store') {
        updatePayload["store_name"] = this.editData.store_name || '';
        updatePayload["owner_name"] = this.editData.owner_name || '';
        updatePayload["category_id"] = this.editData.category_id || '';
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        updatePayload["logo"] = this.editData.logo || '';
        updatePayload["logo_cloudinary_public_id"] = this.editData.logo_cloudinary_public_id || '';

        const storeDyn = this.dynamicStoreItems.find((i) => i.id === this.editData.category_id);
        const storeItem = STORES_CATEGORIES_DATA.items.find((i) => i.id === this.editData.category_id);
        const currentStoreAr = storeDyn?.nameAr || storeItem?.nameAr || this.editData.category_id || 'متجر';
        updatePayload["store_match_key"] = `${currentStoreAr}_${this.editData.city}`;
      }

      // 5. المنتجات (التعديل بناءً على الحقول الكاملة)
      else if (this.editData.ad_type === 'product') {
        updatePayload["details.title"] = this.editData.details.title || '';
        updatePayload["details.short_desc"] = this.editData.details.short_desc || '';
        updatePayload["details.full_details"] = this.editData.details.full_details || '';
        updatePayload["details.price"] = Number(this.editData.details.price) || 0;
        updatePayload["details.condition"] = this.editData.details.condition || 'مستعمل';
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        const imgs = (this.editData.details.images || []).filter(
          (u: unknown) => typeof u === 'string' && u.trim()
        ) as string[];
        if (imgs.length === 0) {
          updatePayload["details.images"] = ['assets/mota7.png'];
          updatePayload["details.images_cloudinary_public_ids"] = [];
        } else {
          updatePayload["details.images"] = imgs;
          updatePayload["details.images_cloudinary_public_ids"] = imgs.map(
            (_u: string, i: number) => this.productImagePublicIds[i] || ''
          );
        }
        updatePayload["sub_category_name"] = this.editData.sub_category_name || '';
        updatePayload["category_id"] = this.editData.category_id || '';

        const pDyn = this.dynamicProductItems.find((i) => i.id === this.editData.category_id);
        const pItem = PRODUCTS_CATEGORY.items.find((i) => i.id === this.editData.category_id);
        const currentProductAr = pDyn?.nameAr || pItem?.nameAr || this.editData.category_id || 'منتجات';
        const subCat = this.editData.sub_category_name || '';
        
        updatePayload["product_match_key"] = `${currentProductAr}+${subCat}+${this.editData.city}`;
      }

      await updateDoc(adRef, updatePayload);

      this.showToast('تم حفظ التعديلات بنجاح', 'success');
      this.modalCtrl.dismiss(this.editData);
    } catch (error) {
      console.error("Update Error:", error);
      this.showToast('فشل في تحديث البيانات، يرجى المحاولة لاحقاً', 'danger');
    }
  }

  async showToast(msg: string, color: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      color: color,
      position: 'bottom',
      mode: 'ios'
    });
    toast.present();
  }

  close() {
    this.modalCtrl.dismiss();
  }
}
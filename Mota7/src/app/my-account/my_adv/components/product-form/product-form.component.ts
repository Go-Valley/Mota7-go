import { ChangeDetectorRef, Component, OnInit, ViewChild, inject, Input, EnvironmentInjector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, IonInput, IonTextarea, LoadingController, ToastController, NavController, ModalController, AlertController, ActionSheetController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, limit, getDocs } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { PRODUCTS_CATEGORY } from '../../../../core/constants/products-data';
import { AppTaxonomyService } from '../../../../core/services/app-taxonomy.service';
import { addIcons } from 'ionicons';
import { 
  cameraOutline, trashOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline,
  shieldCheckmark, checkmarkCircle
} from 'ionicons/icons';
import { ImageService } from 'src/app/image.service';
import { NewAdNtfyService } from 'src/app/core/services/new-ad-ntfy.service';
import { enqueueSparkAdFcmSavedJob } from 'src/app/core/services/spark-ad-fcm-job.service';
import { CloudinaryCleanupService } from 'src/app/core/services/cloudinary-cleanup.service';
import {
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../../../../core/utils/order-form-fields.util';
import { applyOrderPhoneInputState } from '../../../../core/utils/egyptian-phone-order.util';
import {
  AD_FORM_DISMISS_FOR_SUBSCRIPTION_PLANS_ROLE,
  checkOwnerAdQuota,
  presentOwnerAdQuotaExceeded,
  tierFromUserDoc,
} from '../../../../core/utils/user-ad-quota.util';
import { canonicalTierForFirestore } from '../../../../core/utils/verification-tiers.util';
import { SubscriptionsModalBridgeService } from 'src/app/core/services/subscriptions-modal-bridge.service';

@Component({
  selector: 'app-product-form',
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ProductFormComponent implements OnInit {
  @Input() editAdData: any; 
  @ViewChild('inputShortDesc', { read: IonInput }) private inputShortDesc?: IonInput;
  @ViewChild('inputFullDetails', { read: IonTextarea }) private inputFullDetails?: IonTextarea;
  @ViewChild('inputPrice', { read: IonInput }) private inputPrice?: IonInput;
  @ViewChild('inputWhatsappPhone', { read: IonInput }) private inputWhatsappPhone?: IonInput;

  mainCategories: any[] = [...PRODUCTS_CATEGORY.items];
  subCategories: string[] = [];
  isSubmitting = false; 
  isEditMode = false;
  userVerificationStatus: string = 'none';
  fetchedOwnerName: string = ''; // متغير جديد لحفظ الاسم المسجل تلقائياً

  /** عرض/إدخال السعر كنص (أعداد صحيحة فقط) — منفصل عن القيمة المحفوظة */
  priceInputStr = '';
  /** تحذير فوري عند كتابة حرف أو رمز غير رقمي في السعر */
  priceLiveWarning: string | null = null;
  private static readonly PRICE_LETTERS_MSG = 'لايمكن قبول حروف - ارقام فقط';
  private static readonly PRICE_INVALID_START_MSG = 'مبلغ غير صحيح';
  private static readonly SHORT_DESC_MAX_LEN = 30;

  /** يوازي productData.images بنفس الترتيب (لحذف Cloudinary عند إزالة صورة) */
  imagePublicIds: (string | null)[] = [];

  productData = {
    main_cat_id: '',
    sub_cat_name: '',
    short_desc: '',
    full_details: '',
    price: null as number | null,
    condition: 'غير محدد',
    whatsappEnabled: true,
    whatsappPhone: '',
    contactPhone: '',
    images: [] as string[],
    lat: 0,
    lng: 0,
    city: ''
  };

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private actionSheetCtrl = inject(ActionSheetController);
  private injector = inject(EnvironmentInjector);
  private newAdNtfy = inject(NewAdNtfyService);
  private subsModalBridge = inject(SubscriptionsModalBridgeService);
  private cloudinaryCleanup = inject(CloudinaryCleanupService);
  private cdr = inject(ChangeDetectorRef);
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);

  private currentStore: any = null; 

  constructor(
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private imageService: ImageService
  ) {
    addIcons({ 
      cameraOutline, trashOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline,
      shieldCheckmark, checkmarkCircle
    });
  }

  async ngOnInit() {
    this.taxonomy.bundle$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((b) => {
      this.mainCategories = b.productItems;
      this.onMainCategoryChange(false);
      this.cdr.markForCheck();
    });

    if (this.editAdData) {
      this.isEditMode = true;
      this.fillFormForEdit();
    } else {
      await this.loadUserProfile();
    }
  }

  fillFormForEdit() {
    const d = this.editAdData;
    // استرجاع الاسم المخزن سابقاً في حالة التعديل
    this.fetchedOwnerName = d.owner_name || '';
    this.userVerificationStatus = canonicalTierForFirestore(
      d.verification_level ?? d.is_verified
    );
    const rawPrice = d.details?.price;
    let priceNum: number | null = null;
    let priceStr = '';
    if (rawPrice != null && rawPrice !== '') {
      const n = Math.trunc(Number(rawPrice));
      if (Number.isFinite(n) && n >= 1) {
        priceNum = n;
        priceStr = String(n);
      }
    }
    this.priceInputStr = priceStr;
    this.priceLiveWarning = null;

    const imgs = [...(d.details?.images || [])];
    const existingIds = (d.details?.images_cloudinary_public_ids as string[] | undefined) || [];
    this.productData = {
      main_cat_id: d.category_id || '',
      sub_cat_name: d.sub_category_name || '',
      short_desc: this.clampShortDesc(d.details?.short_desc || ''),
      full_details: d.details?.full_details || '',
      price: priceNum,
      condition: d.details?.condition || 'غير محدد',
      whatsappEnabled: !!d.details?.whatsapp_phone,
      whatsappPhone: d.details?.whatsapp_phone || '',
      contactPhone: d.owner_phone || '',
      images: imgs,
      lat: d.location?.lat || 0,
      lng: d.location?.lng || 0,
      city: d.city || ''
    };
    this.imagePublicIds = imgs.map((_, i) => existingIds[i] || null);
    this.onMainCategoryChange(false); 
  }

  async loadUserProfile() {
    const user = this.auth.currentUser;
    if (user && user.email) {
      const userKey = user.email.split('@')[0];
      try {
        const userDoc = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', userKey))
        );
        if (userDoc.exists()) {
          const data = userDoc.data();
          // جلب الاسم من fullName أو name كما في بياناتك
          this.fetchedOwnerName = data['fullName'] || data['name'] || 'مستخدم متاح';
          this.productData.contactPhone = data['phone'] || '';
          this.productData.whatsappPhone = data['phone'] || '';
          this.productData.city = data['city'] || 'الخارجة';
          this.userVerificationStatus = tierFromUserDoc(data as Record<string, unknown>);
        }
      } catch (e) {
        console.error("Error loading profile:", e);
      }
    }
  }

  /**
   * تحويل الأرقام من أي شكل شائع (عربية، فارسية، هندية، بعرض كامل…) إلى 0-9،
   * مع إزالة أحرف الاتجاه الخفيفة التي تسبب فشل التعرف على Android/WebView.
   */
  private toEnglishDigits(value: unknown): string {
    let s = String(value ?? '')
      .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g, '');
    let out = '';
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      let d: number | null = null;
      if (cp >= 0x0660 && cp <= 0x0669) {
        d = cp - 0x0660;
      } else if (cp >= 0x06f0 && cp <= 0x06f9) {
        d = cp - 0x06f0;
      } else if (cp >= 0xff10 && cp <= 0xff19) {
        d = cp - 0xff10;
      } else if (cp >= 0x0966 && cp <= 0x096f) {
        d = cp - 0x0966;
      } else if (cp >= 0x0ce6 && cp <= 0x0cef) {
        d = cp - 0x0ce6;
      } else if (cp >= 0x0be6 && cp <= 0x0bef) {
        d = cp - 0x0be6;
      }
      if (d !== null) {
        out += String(d);
      } else {
        out += ch;
      }
    }
    return out;
  }

  /** اعتراض مفتاح غير رقمي — تحذير فوري (مثل سلوك الرقم 0). */
  onProductPriceKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    if (ev.isComposing) {
      return;
    }
    const key = ev.key;
    if (key.length !== 1) {
      return;
    }
    const asDigit = this.toEnglishDigits(key);
    if (/^[0-9]$/.test(asDigit)) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.priceLiveWarning = ProductFormComponent.PRICE_LETTERS_MSG;
  }

  /**
   * السعر: أرقام فقط؛ قراءة من الـ native input (مهم مع IME عربي / WebView)
   * حتى لا تُعتبر الخانة فارغة بينما القيمة موجودة في الـ shadow DOM.
   */
  onProductPriceInput(ev: Event): void {
    const raw = readIonTextInputValueFromEvent(ev);
    this.applyProductPriceFromRaw(raw);
  }

  /**
   * السعر: أرقام فقط؛ عند أول حرف غير رقم تظهر رسالة فوراً ولا يُحتفظ بالحروف؛ لا يبدأ بـ 0.
   */
  private applyProductPriceFromRaw(raw: string): void {
    const english = this.toEnglishDigits(raw || '');
    const hasNonDigit = /\D/.test(english);
    const digitsOnly = english.replace(/\D/g, '');
    const normalized = digitsOnly.replace(/^0+/, '') || '';
    const leadingZeroAttempt = digitsOnly.length > 0 && digitsOnly[0] === '0';

    if (hasNonDigit) {
      this.priceLiveWarning = ProductFormComponent.PRICE_LETTERS_MSG;
    } else if (leadingZeroAttempt) {
      this.priceLiveWarning = ProductFormComponent.PRICE_INVALID_START_MSG;
    } else {
      this.priceLiveWarning = null;
    }

    this.priceInputStr = normalized;
    this.productData.price =
      normalized === '' ? null : parseInt(normalized, 10);
      
    if (this.inputPrice) {
      this.inputPrice.value = normalized;
    }
  }

  onMainCategoryChange(resetSub = true) {
    const selected = this.mainCategories.find(c => c.id === this.productData.main_cat_id);
    this.subCategories = selected ? selected.subcategories : [];
    if (resetSub) this.productData.sub_cat_name = '';
  }

  onShortDescInput(ev: Event): void {
    const v = readIonTextInputValueFromEvent(ev);
    if (v.length > ProductFormComponent.SHORT_DESC_MAX_LEN) {
      void this.syncShortDescNativeValue(this.productData.short_desc);
      this.cdr.markForCheck();
      return;
    }
    this.productData.short_desc = v;
  }

  get shortDescRemaining(): number {
    const n = this.productData.short_desc?.length ?? 0;
    return Math.max(0, ProductFormComponent.SHORT_DESC_MAX_LEN - n);
  }

  get shortDescHintText(): string {
    const r = this.shortDescRemaining;
    if (r === 0) {
      return 'تنبيه: وصلت للحد الأقصى — لا يمكن إضافة المزيد من الأحرف.';
    }
    if (r === 1) {
      return 'متبقي للكتابة: حرف واحد.';
    }
    if (r === 2) {
      return 'متبقي للكتابة: حرفان.';
    }
    return `متبقي للكتابة: ${r} أحرف.`;
  }

  private clampShortDesc(s: string): string {
    return String(s ?? '').slice(0, ProductFormComponent.SHORT_DESC_MAX_LEN);
  }

  private async syncShortDescNativeValue(v: string): Promise<void> {
    if (!this.inputShortDesc) {
      return;
    }
    try {
      const el = await this.inputShortDesc.getInputElement();
      if (el && el.value !== v) {
        el.value = v;
      }
    } catch {
      /* ignore */
    }
  }

  onFullDetailsInput(ev: Event): void {
    this.productData.full_details = readIonTextInputValueFromEvent(ev);
  }

  onWhatsappPhoneChange(val: string): void {
    const raw = val || '';
    const st = applyOrderPhoneInputState(raw);
    this.productData.whatsappPhone = st.cleaned;
    
    if (this.inputWhatsappPhone) {
      this.inputWhatsappPhone.value = st.cleaned;
    }
  }

  private async syncFreeTextFieldsFromNativeInputs(): Promise<void> {
    if (this.inputShortDesc) {
      try {
        const el = await this.inputShortDesc.getInputElement();
        const v = el?.value;
        if (typeof v === 'string') {
          if (v.length > ProductFormComponent.SHORT_DESC_MAX_LEN) {
            await this.syncShortDescNativeValue(this.productData.short_desc);
          } else {
            this.productData.short_desc = v;
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (this.inputFullDetails) {
      try {
        const el = await this.inputFullDetails.getInputElement();
        const v = el?.value;
        if (typeof v === 'string') {
          this.productData.full_details = v;
        }
      } catch {
        /* ignore */
      }
    }
  }

  async onImagesSelected(event: any) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (this.productData.images.length + files.length > 3) {
      this.presentToast('الحد الأقصى 3 صور فقط');
      return;
    }

    const loader = await this.loadingCtrl.create({ 
      message: 'جاري رفع الصور...', 
      mode: 'ios' 
    });
    await loader.present();

    try {
      for (let file of files) {
        const { url, publicId } = await this.imageService.uploadToCloudinary(file, 'products');
        if (url) {
          this.productData.images.push(url);
          this.imagePublicIds.push(publicId || null);
        }
      }
      this.presentToast('تمت إضافة الصور بنجاح');
    } catch (error: any) {
      this.presentToast('حدث خطأ أثناء المعالجة: ' + (error.message || 'حاول مرة أخرى'));
    } finally {
      loader.dismiss();
      event.target.value = ''; 
    }
  }

  async removeImage(index: number): Promise<void> {
    const pid = this.imagePublicIds[index];
    if (pid) {
      await this.cloudinaryCleanup.deletePublicIds([pid]).catch(() => {});
    }
    this.productData.images.splice(index, 1);
    this.imagePublicIds.splice(index, 1);
    this.cdr.detectChanges();
  }

  async getUserStores(): Promise<any[]> {
    const phone = String(this.productData.contactPhone || '').trim();
    if (!phone) return [];
    const snapshot = await runInInjectionContext(this.injector, () => {
      const adsRef = collection(this.firestore, 'ads');
      const q = query(adsRef, where('owner_phone', '==', phone), where('ad_type', '==', 'store'));
      return getDocs(q);
    });
    const stores: any[] = snapshot.docs.map(d => ({ ...(d.data() as any), ad_id: d.id as string }));
    const activeStores = stores.filter((s: any) => s && s.status === 'active');
    const uniqueByName: Record<string, any> = {};
    for (const s of activeStores) {
      const name = s.store_name || s.storeName;
      if (name && !uniqueByName[name]) uniqueByName[name] = s;
    }
    return Object.values(uniqueByName);
  }

  async presentStoresChoice(stores: any[]) {
    const buttons = [
      { text: 'إضافة كإعلان عام', handler: () => { this.currentStore = null; this.saveProduct(false); } },
      ...stores.map(s => ({ text: `إضافة ضمن متجر: ${s.store_name}`, handler: () => { this.currentStore = s; this.saveProduct(true); } })),
      { text: 'إلغاء', role: 'cancel' }
    ];
    const sheet = await this.actionSheetCtrl.create({ header: 'اختيار طريقة إضافة المنتج', mode: 'ios', buttons });
    await sheet.present();
  }

  async onAddProductClick() {
    const user = this.auth.currentUser;
    if (!user) { this.presentToast('يرجى تسجيل الدخول أولاً'); return; }
    const stores = await this.getUserStores();
    if (stores.length > 0) {
      await this.presentStoresChoice(stores);
    } else {
      this.currentStore = null;
      this.saveProduct(false);
    }
  }

// 2. تحديث دالة الحفظ لتشمل حقل reject_reason وتوحيد الهيكلية
async saveProduct(isStoreProduct: boolean = false) {
  await this.syncFreeTextFieldsFromNativeInputs();
  this.productData.short_desc = this.clampShortDesc(
    normalizeUserFreeText(this.productData.short_desc)
  );
  await this.syncShortDescNativeValue(this.productData.short_desc);
  this.productData.full_details = normalizeUserFreeText(this.productData.full_details);
  if (!this.productData.main_cat_id || !this.productData.short_desc) {
    this.presentToast('يرجى إكمال الحقول الإجبارية');
    return;
  }

  const priceDigits = this.toEnglishDigits(this.priceInputStr).replace(/\D/g, '');
  const priceNorm = priceDigits.replace(/^0+/, '') || '';
  const resolvedPrice = priceNorm === '' ? null : parseInt(priceNorm, 10);
  if (resolvedPrice !== null && resolvedPrice < 1) {
    this.presentToast(ProductFormComponent.PRICE_INVALID_START_MSG);
    return;
  }
  this.productData.price = resolvedPrice;
  this.priceInputStr = priceNorm;
  this.priceLiveWarning = null;

  const user = this.auth.currentUser;
  if (!user) {
    this.presentToast('يرجى تسجيل الدخول أولاً');
    return;
  }

  const loader = await this.loadingCtrl.create({ 
    message: this.isEditMode ? 'جاري التحديث...' : 'جاري الإضافة...', 
    mode: 'ios' 
  });
  await loader.present();

  try {
    const adId = this.isEditMode ? (this.editAdData.id || this.editAdData.ad_id) : `${this.productData.contactPhone}_${this.productData.main_cat_id}-${Date.now()}`;
    let ntfySnapshot: Record<string, unknown> | null = null;

    const verifyTier = canonicalTierForFirestore(this.userVerificationStatus);

    await runInInjectionContext(this.injector, async () => {
      const adPayload: any = {
        ad_id: adId,
        userId: user.uid,
        owner_name: this.fetchedOwnerName,
        owner_phone: this.productData.contactPhone,
        category_id: this.productData.main_cat_id,
        sub_category_name: this.productData.sub_cat_name,
        ad_type: 'product',
        verification_level: verifyTier,
        is_verified: verifyTier,
        sort_order: 999,
        city: this.productData.city,
        location: { lat: this.productData.lat, lng: this.productData.lng },
        isStoreProduct: isStoreProduct,
        updated_at: serverTimestamp(),
        details: (() => {
          const hasUserImages = this.productData.images && this.productData.images.length > 0;
          const imgs = hasUserImages ? [...this.productData.images] : ['assets/mota7.png'];
          const ids = hasUserImages
            ? this.productData.images.map((_, i) => this.imagePublicIds[i] ?? '')
            : [];
          return {
            short_desc: this.productData.short_desc,
            full_details: this.productData.full_details,
            price: this.productData.price,
            condition: this.productData.condition,
            images: imgs,
            images_cloudinary_public_ids: ids.some((x) => !!x) ? ids : [],
            whatsapp_phone: this.productData.whatsappEnabled ? this.productData.whatsappPhone : null,
          };
        })(),
      };

      /** زر العربة معطّل حتى يفعّله الأدمن من لوحة «إعلان المنتج» بعد الموافقة. */
      adPayload.cart_enabled = false;

      if (isStoreProduct && this.currentStore) {
        adPayload.storeId = this.currentStore.ad_id || this.currentStore.id;
        adPayload.storeName = this.currentStore.store_name || this.currentStore.storeName;
      }

      if (this.isEditMode) {
        ntfySnapshot = {
          ad_type: adPayload.ad_type,
          category_id: adPayload.category_id,
          sub_category_name: adPayload.sub_category_name,
          details: { ...adPayload.details },
          store_name: adPayload.storeName,
          owner_name: adPayload.owner_name,
        };
        adPayload.status = 'pending';
        adPayload.admin_reason = '';
        await updateDoc(doc(this.firestore, 'ads', adId), adPayload);
        await enqueueSparkAdFcmSavedJob(this.firestore, adId);
      } else {
        const userKey = user.email!.split('@')[0];
        const quota = await checkOwnerAdQuota(
          this.firestore,
          this.injector,
          this.productData.contactPhone,
          userKey,
          user.uid
        );
        if (!quota.ok) {
          await loader.dismiss();
          await presentOwnerAdQuotaExceeded(this.alertCtrl, {
            onOpenSubscriptionPlans: async () => {
              await this.modalCtrl.dismiss(
                undefined,
                AD_FORM_DISMISS_FOR_SUBSCRIPTION_PLANS_ROLE
              );
              await this.navCtrl.navigateRoot('/tabs/my-account');
              this.subsModalBridge.requestOpen();
            },
            quotaAdminContact: {
              firestore: this.firestore,
              injector: this.injector,
              userDocId: userKey,
              contactPhoneFallback: this.productData.contactPhone,
            },
          });
          return;
        }
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        adPayload.status = 'pending';
        adPayload.created_at = serverTimestamp();
        adPayload.expiry_date = expiry;
        adPayload.admin_reason = '';
        adPayload.call_clicks = 0;
        adPayload.whatsapp_clicks = 0;
        adPayload.impression_count = 0;
        adPayload.stats = { views: 0, calls: 0, whatsapp: 0, ratings: 0 };
        await setDoc(doc(this.firestore, 'ads', adId), adPayload);
        await enqueueSparkAdFcmSavedJob(this.firestore, adId);
        ntfySnapshot = {
          ad_type: adPayload.ad_type,
          category_id: adPayload.category_id,
          sub_category_name: adPayload.sub_category_name,
          details: { ...adPayload.details },
          store_name: adPayload.storeName,
          owner_name: adPayload.owner_name,
        };
      }
    });

    await loader.dismiss();
    this.presentToast(this.isEditMode ? 'تم التحديث بنجاح' : 'تم الإرسال للمراجعة');
    await this.modalCtrl.dismiss({ confirmed: true }, 'confirm');
    
    if (ntfySnapshot) {
      if (this.isEditMode) {
        void this.newAdNtfy.notifyAfterAdUpdated(user.uid, ntfySnapshot);
      } else {
        void this.newAdNtfy.notifyAfterNewAdSubmitted(user.uid, ntfySnapshot);
      }
    }
    if (!this.isEditMode) {
      this.navCtrl.navigateRoot('/my-ads');
    }

  } catch (e) {
    console.error("Save Product Error:", e);
    await loader.dismiss();
    this.presentToast('حدث خطأ أثناء الحفظ - تواصل مع الإدارة');
  }
}

  async close() { await this.modalCtrl.dismiss(null, 'cancel'); }
  async presentToast(m: string) {
    const t = await this.toastCtrl.create({ message: m, duration: 2000, mode: 'ios', position: 'bottom' });
    await t.present();
  }
}

import { Component, OnInit, ViewChild, inject, Input, EnvironmentInjector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, IonInput, LoadingController, ToastController, NavController, ModalController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { STORES_CATEGORIES_DATA } from '../../../../core/constants/stores-data';
import { AppTaxonomyService, type TaxonomyBundle } from '../../../../core/services/app-taxonomy.service';
import { ImageService } from 'src/app/image.service';
import { NewAdNtfyService } from 'src/app/core/services/new-ad-ntfy.service';
import { CloudinaryCleanupService } from 'src/app/core/services/cloudinary-cleanup.service';
import { findDuplicateAd, presentDuplicateAdAlert } from 'src/app/core/utils/duplicate-ad.util';
import { tierFromUserDoc } from 'src/app/core/utils/user-ad-quota.util';
import { canonicalTierForFirestore } from 'src/app/core/utils/verification-tiers.util';
import {
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../../../../core/utils/order-form-fields.util';
import {
  applyOrderPhoneInputState,
  ORDER_PHONE_DIGITS_ONLY_MSG,
  orderPhoneToEnglishDigits,
} from '../../../../core/utils/egyptian-phone-order.util';
import {
  blockDigitsOnlyBeforeInput,
  blockDigitsOnlyKeyDown,
  blockDigitsOnlyPaste,
  DIGITS_ONLY_BLOCKED_MSG,
} from '../../../../core/utils/mota7-digits-only-input.util';

import type { CoverageMultiEmit } from 'src/app/shared/governorate-city-selector/governorate-city-selector.component';
import { GovernorateCitySelectorComponent } from 'src/app/shared/governorate-city-selector/governorate-city-selector.component';
import { uniqSortedCityIds } from 'src/app/core/utils/service-order-coverage-match.util';
import { Mota7DigitsOnlyIonInputDirective } from 'src/app/shared/directives/mota7-digits-only-ion-input.directive';
import {
  applyCoverageMultiEmitToAdForm,
  ensureCoverageCityIdsForAdSubmit,
  hydrateAdFormUserCityFromProfile,
  loadUserGovernorateContextForAdForm,
} from 'src/app/core/utils/ad-form-user-city.util';
import { GovernorateService } from 'src/app/core/services/governorate.service';
import {
  type AdminAdOwnerContext,
  adFormOwnerUserDocId,
  adFormPendingSuccessMessage,
  adFormSuccessNavigateAfterSave,
  loadAdFormOwnerUserDoc,
  resolveAdFormSubmitOwner,
} from 'src/app/core/utils/admin-ad-owner-context.util';

import { addIcons } from 'ionicons';
import { camera, callOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline, shieldCheckmark, checkmarkCircle } from 'ionicons/icons';
import { VerificationBadgeComponent } from '../../../../shared/verification-badge/verification-badge.component';

@Component({
  selector: 'app-store-form',
  templateUrl: './store-form.component.html',
  styleUrls: ['./store-form.component.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    VerificationBadgeComponent,
    GovernorateCitySelectorComponent,
    Mota7DigitsOnlyIonInputDirective,
  ],
})
export class StoreFormComponent implements OnInit {
  @Input() editAdData: any;
  /** إنشاء إعلان من لوحة الأدمن نيابةً عن مستخدم */
  @Input() adminOwnerContext: AdminAdOwnerContext | null = null;
  @ViewChild('inputStoreName', { read: IonInput }) private inputStoreName?: IonInput;
  @ViewChild('inputWhatsappPhone', { read: IonInput }) private inputWhatsappPhone?: IonInput;
  isEditMode = false;
  whatsappPhoneLiveWarning: string | null = null;

  readonly onWhatsappDigitsOnlyWarn = (msg: string): void => {
    this.whatsappPhoneLiveWarning = msg;
  };

  storeCategories: any[] = [...STORES_CATEGORIES_DATA.items];
  isSubmitting = false; 
  ownerRealName: string = '';
  userVerificationStatus: string = 'none'; // متغير حالة التوثيق (طبقة فعّالة من المستخدم أو الإعلان)
  /** لعرض شارة التوثيق بنفس منطق الكروت (نوافذ الصلاحية) */
  storeBadgeValidFrom: unknown = null;
  storeBadgeValidUntil: unknown = null;
  logoCloudinaryPublicId: string | null = null;

  storeData = {
    category_id: '',
    storeName: '',
    contactPhone: '',
    whatsappEnabled: true,
    whatsappPhone: '',
    logo: '',
    lat: 0,
    lng: 0,
    city: ''
  };

  userGovernorateId: string | null = null;
  userCityId: string | null = null;
  coverageCityIdsForAd: string[] = [];
  coverageGovernorateWholeIdsForAd: string[] = [];

  onCoverageAreas(ev: CoverageMultiEmit): void {
    if (!this.isEditMode) {
      return;
    }
    const applied = applyCoverageMultiEmitToAdForm(
      ev,
      this.coverageCityIdsForAd,
      this.storeData.city,
      this.coverageGovernorateWholeIdsForAd
    );
    const ids = applied.coverageCityIds;
    this.coverageCityIdsForAd = ids.length > 1 ? [ids[0]!] : ids;
    this.coverageGovernorateWholeIdsForAd = applied.coverageGovernorateWholeIds;
    const disp = String(applied.cityDisplay ?? '').trim();
    this.storeData.city =
      this.coverageCityIdsForAd.length === 1 && disp.includes('،')
        ? (disp.split('،').map((s) => s.trim()).filter(Boolean).pop() ?? disp)
        : disp || this.storeData.city;
  }

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private imageService = inject(ImageService);
  private injector = inject(EnvironmentInjector);
  private newAdNtfy = inject(NewAdNtfyService);
  private cloudinaryCleanup = inject(CloudinaryCleanupService);
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);
  private govService = inject(GovernorateService);

  constructor(
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController
  ) {
    addIcons({ camera, callOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline, shieldCheckmark, checkmarkCircle });
  }

  async ngOnInit() {
    this.taxonomy.bundle$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((b: TaxonomyBundle) => {
      this.storeCategories = b.storeItems;
    });

    if (this.editAdData) {
      this.isEditMode = true;
      this.fillFormForEdit();
      await this.applyUserGovernorateContext();
    } else {
      await this.loadUserProfile();
    }
  }

  fillFormForEdit() {
    const d = this.editAdData;
    this.ownerRealName = d.owner_name || ''; 
    this.userVerificationStatus = canonicalTierForFirestore(
      d.verification_level ?? d.is_verified
    ); // جلب الحالة من الإعلان عند التعديل
    this.storeBadgeValidFrom = d.verification_valid_from;
    this.storeBadgeValidUntil = d.verification_valid_until;
    let rawWhatsapp = d.whatsapp_phone || '';
    if (rawWhatsapp.startsWith('20')) {
      rawWhatsapp = '0' + rawWhatsapp.substring(2);
    }

    this.storeData = {
      category_id: d.category_id || '',
      storeName: d.store_name || '',
      contactPhone: d.owner_phone || '',
      whatsappEnabled: !!d.whatsapp_phone,
      whatsappPhone: rawWhatsapp,
      logo: d.logo || '',
      lat: d.location?.lat || 0,
      lng: d.location?.lng || 0,
      city: d.city || ''
    };
    const coverageIds = uniqSortedCityIds(d.coverage_city_ids);
    this.coverageCityIdsForAd = coverageIds.length ? [coverageIds[0]!] : [];
    this.coverageGovernorateWholeIdsForAd = uniqSortedCityIds(d.coverage_governorate_whole_ids);
    const lid = d.logo_cloudinary_public_id;
    this.logoCloudinaryPublicId = typeof lid === 'string' && lid ? lid : null;
  }

  private async applyUserGovernorateContext(): Promise<void> {
    const ctx = await loadUserGovernorateContextForAdForm(
      this.auth,
      this.firestore,
      this.injector,
      adFormOwnerUserDocId(this.auth, this.adminOwnerContext)
    );
    this.userGovernorateId = ctx.userGovernorateId;
    if (ctx.userCityId) {
      this.userCityId = ctx.userCityId;
    }
  }

  async loadUserProfile() {
    const userKey = adFormOwnerUserDocId(this.auth, this.adminOwnerContext);
    if (userKey) {
      const data = await loadAdFormOwnerUserDoc(
        this.firestore,
        this.injector,
        userKey
      );
      if (data) {
        this.ownerRealName =
          String(data['fullName'] ?? data['name'] ?? '').trim() ||
          String(this.adminOwnerContext?.ownerFullName ?? '').trim() ||
          'صاحب متجر';
        this.userVerificationStatus = tierFromUserDoc(data as Record<string, unknown>);
        this.storeBadgeValidFrom = data['verification_valid_from'];
        this.storeBadgeValidUntil = data['verification_valid_until'];
        this.storeData.contactPhone = String(data['phone'] ?? '').trim();
        this.storeData.whatsappPhone = this.storeData.contactPhone;
        const geo = await hydrateAdFormUserCityFromProfile(
          this.govService,
          data as Record<string, unknown>,
          this.isEditMode
        );
        this.userGovernorateId = geo.userGovernorateId;
        this.userCityId = geo.userCityId;
        this.storeData.city = geo.cityDisplay || this.storeData.city;
        this.coverageCityIdsForAd = geo.coverageCityIds;

        const resolved = await ensureCoverageCityIdsForAdSubmit(this.govService, {
          isEditMode: false,
          userGovernorateId: this.userGovernorateId,
          userCityId: this.userCityId,
          cityDisplay: this.storeData.city,
          coverageCityIds: this.coverageCityIdsForAd,
        });
        this.userCityId = resolved.userCityId;
        this.coverageCityIdsForAd = resolved.coverageCityIds;
        if (resolved.coverageCityIds.length && !this.storeData.city.trim() && this.userGovernorateId && this.userCityId) {
          const cityDoc = await this.govService.getCityById(this.userGovernorateId, this.userCityId);
          if (cityDoc?.name) {
            this.storeData.city = cityDoc.name;
          }
        }
      }
    }
  }

  /** حقول الشارة على مساحة اللوجو — مطابقة لحقول الإعلان أو المستخدم */
  storeBadgeTierRaw(): string | undefined {
    if (this.isEditMode && this.editAdData) {
      const d = this.editAdData;
      return d.verification_level ?? d.is_verified;
    }
    return this.userVerificationStatus;
  }

  storeBadgeVerifiedRaw(): string | undefined {
    if (this.isEditMode && this.editAdData) {
      const d = this.editAdData;
      return d.is_verified ?? d.verification_level;
    }
    return this.userVerificationStatus;
  }

  async onLogoUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const loader = await this.loadingCtrl.create({ 
      message: 'جاري معالجة اللوجو...', 
      mode: 'ios' 
    });
    await loader.present();

    try {
      if (this.logoCloudinaryPublicId) {
        await this.cloudinaryCleanup.deletePublicIds([this.logoCloudinaryPublicId]).catch(() => {});
      }
      const { url, publicId } = await this.imageService.uploadToCloudinary(file, 'stores');
      this.storeData.logo = url;
      this.logoCloudinaryPublicId = publicId || null;
      this.presentToast('تم رفع اللوجو بنجاح');
    } catch (error) {
      console.error("Logo upload error:", error);
      this.presentToast('فشل رفع اللوجو، حاول مرة أخرى');
    } finally {
      loader.dismiss();
    }
  }

  onStoreNameInput(ev: Event): void {
    this.storeData.storeName = readIonTextInputValueFromEvent(ev);
  }

  onStoreWhatsappPhoneKeyDown(ev: KeyboardEvent): void {
    blockDigitsOnlyKeyDown(ev, () => {
      this.whatsappPhoneLiveWarning = DIGITS_ONLY_BLOCKED_MSG;
    });
  }

  onStoreWhatsappPhoneBeforeInput(ev: InputEvent): void {
    blockDigitsOnlyBeforeInput(ev, () => {
      this.whatsappPhoneLiveWarning = DIGITS_ONLY_BLOCKED_MSG;
    });
  }

  onStoreWhatsappPhonePaste(ev: ClipboardEvent): void {
    blockDigitsOnlyPaste(
      ev,
      (digits) => this.onStoreWhatsappPhoneChange(digits),
      () => {
        this.whatsappPhoneLiveWarning = DIGITS_ONLY_BLOCKED_MSG;
      }
    );
  }

  onStoreWhatsappPhoneChange(val: string): void {
    const raw = val || '';
    const st = applyOrderPhoneInputState(raw);
    this.storeData.whatsappPhone = st.cleaned;
    this.whatsappPhoneLiveWarning = st.warning;

    if (this.inputWhatsappPhone) {
      this.inputWhatsappPhone.value = st.cleaned;
    }
  }

  private async syncStoreNameFromNativeInput(): Promise<void> {
    if (!this.inputStoreName) {
      return;
    }
    try {
      const el = await this.inputStoreName.getInputElement();
      const v = el?.value;
      if (typeof v === 'string') {
        this.storeData.storeName = v;
      }
    } catch {
      /* ignore */
    }
  }

  async saveStore() {
    await this.syncStoreNameFromNativeInput();
    this.storeData.storeName = normalizeUserFreeText(this.storeData.storeName);
    if (!this.storeData.storeName || !this.storeData.category_id) {
      this.presentToast('يرجى إكمال البيانات الأساسية');
      return;
    }
    const resolvedCity = await ensureCoverageCityIdsForAdSubmit(this.govService, {
      isEditMode: this.isEditMode,
      userGovernorateId: this.userGovernorateId,
      userCityId: this.userCityId,
      cityDisplay: this.storeData.city,
      coverageCityIds: this.coverageCityIdsForAd,
    });
    this.userCityId = resolvedCity.userCityId;
    this.coverageCityIdsForAd = resolvedCity.coverageCityIds;
    if (this.isEditMode && this.coverageCityIdsForAd.length > 1) {
      this.coverageCityIdsForAd = [this.coverageCityIdsForAd[0]!];
    }
    if (!this.coverageCityIdsForAd.length) {
      this.presentToast(
        this.isEditMode
          ? 'يرجى اختيار مدينة المتجر'
          : 'تعذّر تحديد مدينة حسابك — تأكد من إكمال المدينة في الملف الشخصي'
      );
      return;
    }

    const owner = resolveAdFormSubmitOwner(this.auth, this.adminOwnerContext);
    if (!owner.canSubmit) {
      this.presentToast('يرجى تسجيل الدخول أولاً');
      return;
    }

    const loader = await this.loadingCtrl.create({
      message: this.isEditMode ? 'جاري تحديث البيانات...' : 'جاري إنشاء المتجر...',
      mode: 'ios',
    });
    await loader.present();

    try {
      let ntfySnapshot: Record<string, unknown> | null = null;

      if (!this.isEditMode) {
        const duplicate = await runInInjectionContext(this.injector, () =>
          findDuplicateAd({
            firestore: this.firestore,
            phone: this.storeData.contactPhone,
            adType: 'store',
            categoryId: this.storeData.category_id,
          })
        );
        if (duplicate) {
          await loader.dismiss();
          const selectedCat = this.storeCategories.find((c: any) => c?.id === this.storeData.category_id);
          const staticCat = STORES_CATEGORIES_DATA.items.find((c) => c.id === this.storeData.category_id);
          const activityNameAr = String(
            (selectedCat as any)?.nameAr || staticCat?.nameAr || this.storeData.category_id || ''
          ).trim();
          await presentDuplicateAdAlert({
            alertCtrl: this.alertCtrl,
            adType: 'store',
            activityNameAr,
            existingStatus: duplicate.status,
          });
          return;
        }
      }

      const adId = this.isEditMode ? (this.editAdData.ad_id || this.editAdData.id) : `store_${this.storeData.contactPhone}_${Date.now()}`;
      const finalStatus = 'pending';
      const logoUrl = this.storeData.logo || 'assets/mota7.png';
      const verifyTier = canonicalTierForFirestore(this.userVerificationStatus);
      const adPayload: any = {
        ad_id: adId,
        userId: owner.uid,
        owner_name: this.ownerRealName,
        category_id: this.storeData.category_id,
        store_name: this.storeData.storeName,
        owner_phone: this.storeData.contactPhone,
        whatsapp_phone: this.storeData.whatsappEnabled ? this.storeData.whatsappPhone : null,
        logo: logoUrl,
        logo_cloudinary_public_id:
          logoUrl.includes('assets/mota7') || !this.logoCloudinaryPublicId
            ? null
            : this.logoCloudinaryPublicId,
        location: { lat: this.storeData.lat, lng: this.storeData.lng },
        city: this.storeData.city,
        coverage_city_ids: [...this.coverageCityIdsForAd],
        coverage_governorate_whole_ids: [...this.coverageGovernorateWholeIdsForAd],
        ad_type: 'store',
        isStore: true,
        status: finalStatus,
        verification_level: verifyTier,
        is_verified: verifyTier,
        sort_order: 999,
        admin_reason: this.isEditMode ? (this.editAdData.admin_reason || '') : '',
        created_at: this.isEditMode ? this.editAdData.created_at : serverTimestamp(),
        updated_at: serverTimestamp(),
        stats: this.isEditMode
          ? this.editAdData.stats
          : { views: 0, calls: 0, whatsapp: 0, ratings: 0 },
        ...(this.isEditMode
          ? {}
          : {
              call_clicks: 0,
              whatsapp_clicks: 0,
              impression_count: 0,
            }),
      };

      if (!this.isEditMode) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        adPayload.expiry_date = expiryDate;
        ntfySnapshot = {
          ad_type: 'store',
          store_name: adPayload.store_name,
          category_id: adPayload.category_id,
          owner_name: adPayload.owner_name,
        };
      } else {
        adPayload.expiry_date = this.editAdData.expiry_date;
        ntfySnapshot = {
          ad_type: 'store',
          store_name: adPayload.store_name,
          category_id: adPayload.category_id,
          owner_name: adPayload.owner_name,
        };
      }

      await runInInjectionContext(this.injector, async () => {
        const adRef = doc(this.firestore, 'ads', adId);
        await setDoc(adRef, adPayload);
      });

      await loader.dismiss();
      this.presentToast(
        adFormPendingSuccessMessage(this.isEditMode, this.adminOwnerContext)
      );
      await this.modalCtrl.dismiss({ saved: true }, 'confirm');

      if (ntfySnapshot && owner.uid) {
        if (this.isEditMode) {
          void this.newAdNtfy.notifyAfterAdUpdated(owner.uid, ntfySnapshot);
        } else {
          void this.newAdNtfy.notifyAfterNewAdSubmitted(owner.uid, ntfySnapshot);
        }
      }
      if (!this.isEditMode) {
        adFormSuccessNavigateAfterSave(this.navCtrl, this.adminOwnerContext);
      }
    } catch (e: any) {
      if (loader) await loader.dismiss();
      console.error('Error saving store:', e);
      this.presentToast('حدث خطأ أثناءالحفظ - تواصل مع الادارة');
    }
  }

  async close() {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async presentToast(m: string) {
    const t = await this.toastCtrl.create({ 
      message: m, 
      duration: 3000, 
      mode: 'ios', 
      position: 'bottom' 
    });
    await t.present();
  }
}

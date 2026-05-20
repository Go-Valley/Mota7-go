import { Component, OnInit, inject, Input, EnvironmentInjector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, LoadingController, ToastController, NavController, ModalController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { EDUCATION_CATEGORY } from '../../../../core/constants/educational-data';
import { AppTaxonomyService, type TaxonomyBundle } from '../../../../core/services/app-taxonomy.service';
import { NewAdNtfyService } from 'src/app/core/services/new-ad-ntfy.service';
import { SparkAdFcmJobService } from 'src/app/core/services/spark-ad-fcm-job.service';
import { readIonTextInputValueFromEvent } from 'src/app/core/utils/order-form-fields.util';
import { applyOrderPhoneInputState } from 'src/app/core/utils/egyptian-phone-order.util';
import {
  blockDigitsOnlyBeforeInput,
  blockDigitsOnlyKeyDown,
  blockDigitsOnlyPaste,
  DIGITS_ONLY_BLOCKED_MSG,
} from 'src/app/core/utils/mota7-digits-only-input.util';
import { tierFromUserDoc } from 'src/app/core/utils/user-ad-quota.util';
import { canonicalTierForFirestore } from 'src/app/core/utils/verification-tiers.util';
import { findDuplicateAd, presentDuplicateAdAlert } from 'src/app/core/utils/duplicate-ad.util';
import { addIcons } from 'ionicons';
import { schoolOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline, shieldCheckmark, checkmarkCircle } from 'ionicons/icons';
import type { CoverageMultiEmit } from 'src/app/shared/governorate-city-selector/governorate-city-selector.component';
import { GovernorateCitySelectorComponent } from 'src/app/shared/governorate-city-selector/governorate-city-selector.component';
import { uniqSortedCityIds } from 'src/app/core/utils/service-order-coverage-match.util';
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
import { Mota7DigitsOnlyIonInputDirective } from 'src/app/shared/directives/mota7-digits-only-ion-input.directive';

@Component({
  selector: 'app-education-form',
  templateUrl: './education-form.component.html',
  styleUrls: ['./education-form.component.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    GovernorateCitySelectorComponent,
    Mota7DigitsOnlyIonInputDirective,
  ],
})
export class EducationFormComponent implements OnInit {
  @Input() editAdData: any;
  @Input() adminOwnerContext: AdminAdOwnerContext | null = null; 

  eduCategories: any[] = [...EDUCATION_CATEGORY.items];
  availableSubjects: string[] = [];
  isSubmitting = false;
  isEditMode = false;
  currentAdId: string | null = null;
  userVerificationStatus: string = 'none';
  whatsappPhoneLiveWarning: string | null = null;

  readonly onWhatsappDigitsOnlyWarn = (msg: string): void => {
    this.whatsappPhoneLiveWarning = msg;
  };

  eduData = {
    category_id: '',
    teacherName: '',
    subjectName: '',
    description: '',
    location_type: 'مركز تعليمي',
    contactPhone: '',
    isAvailable: true,
    whatsappEnabled: true,
    whatsappPhone: '',
    lat: 0,
    lng: 0,
    city: ''
  };

  userGovernorateId: string | null = null;
  userCityId: string | null = null;
  coverageCityIdsForAd: string[] = [];
  coverageGovernorateWholeIdsForAd: string[] = [];

  onCoverageAreas(ev: CoverageMultiEmit): void {
    const applied = applyCoverageMultiEmitToAdForm(
      ev,
      this.coverageCityIdsForAd,
      this.eduData.city,
      this.coverageGovernorateWholeIdsForAd
    );
    this.coverageCityIdsForAd = applied.coverageCityIds;
    this.coverageGovernorateWholeIdsForAd = applied.coverageGovernorateWholeIds;
    this.eduData.city = applied.cityDisplay;
  }

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private injector = inject(EnvironmentInjector);
  private newAdNtfy = inject(NewAdNtfyService);
  private sparkFcm = inject(SparkAdFcmJobService);
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
    addIcons({ schoolOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline, shieldCheckmark, checkmarkCircle });
  }

  async ngOnInit(): Promise<void> {
    this.taxonomy.bundle$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((b: TaxonomyBundle) => {
      this.eduCategories = b.educationItems;
      this.onCategoryChange();
    });

    if (this.editAdData) {
      this.setupEditData(this.editAdData);
      await this.applyUserGovernorateContext();
    } else {
      await this.loadUserProfile();
    }
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

  setupEditData(ad: any) {
    this.isEditMode = true;
    this.currentAdId = ad.id || ad.ad_id;
    
    let tName = ad.details?.teacher_name || '';
    if (tName && !tName.startsWith('أ/ ')) {
      tName = `أ/ ${tName}`;
    }
  
    this.eduData = {
      category_id: ad.category_id || '',
      teacherName: tName,
      subjectName: ad.details?.subject || '',
      description: ad.details?.description || '',
      location_type: ad.details?.location_type || 'مركز تعليمي',
      contactPhone: ad.owner_phone || '',
      isAvailable: ad.is_available ?? true,
      whatsappEnabled: !!ad.details?.whatsapp_phone,
      whatsappPhone: ad.details?.whatsapp_phone || '',
      lat: ad.location?.lat || 0,
      lng: ad.location?.lng || 0,
      city: ad.city || '',
    };
    this.coverageCityIdsForAd = uniqSortedCityIds(ad.coverage_city_ids);
    this.coverageGovernorateWholeIdsForAd = uniqSortedCityIds(ad.coverage_governorate_whole_ids);
    this.userVerificationStatus = canonicalTierForFirestore(
      ad.verification_level ?? ad.is_verified
    );
    this.onCategoryChange();
  }

  onCategoryChange() {
    const selectedCat = this.eduCategories.find(c => c.id === this.eduData.category_id);
    this.availableSubjects = selectedCat ? selectedCat.subjects : [];
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
        let fullName =
          String(data['fullName'] ?? data['name'] ?? '').trim() ||
          String(this.adminOwnerContext?.ownerFullName ?? '').trim() ||
          'معلم مُتاح';
        if (!fullName.startsWith('أ/ ')) {
          fullName = `أ/ ${fullName}`;
        }
        this.eduData.teacherName = fullName;
        const geo = await hydrateAdFormUserCityFromProfile(
          this.govService,
          data as Record<string, unknown>,
          this.isEditMode
        );
        this.userGovernorateId = geo.userGovernorateId;
        this.userCityId = geo.userCityId;
        this.eduData.city = geo.cityDisplay || this.eduData.city;
        this.coverageCityIdsForAd = geo.coverageCityIds;
        this.eduData.contactPhone = String(data['phone'] ?? '').trim();
        this.eduData.whatsappPhone = this.eduData.contactPhone;
        this.userVerificationStatus = tierFromUserDoc(data as Record<string, unknown>);
      }
    }
  }

  onWhatsappPhoneKeyDown(ev: KeyboardEvent): void {
    blockDigitsOnlyKeyDown(ev, () => {
      this.whatsappPhoneLiveWarning = DIGITS_ONLY_BLOCKED_MSG;
    });
  }

  onWhatsappPhoneBeforeInput(ev: InputEvent): void {
    blockDigitsOnlyBeforeInput(ev, () => {
      this.whatsappPhoneLiveWarning = DIGITS_ONLY_BLOCKED_MSG;
    });
  }

  onWhatsappPhonePaste(ev: ClipboardEvent): void {
    blockDigitsOnlyPaste(
      ev,
      (digits) => this.applyWhatsappPhoneRaw(digits),
      () => {
        this.whatsappPhoneLiveWarning = DIGITS_ONLY_BLOCKED_MSG;
      }
    );
  }

  onWhatsappPhoneInput(ev: Event): void {
    this.applyWhatsappPhoneRaw(readIonTextInputValueFromEvent(ev));
  }

  private applyWhatsappPhoneRaw(raw: string): void {
    const st = applyOrderPhoneInputState(raw);
    this.eduData.whatsappPhone = st.cleaned;
    this.whatsappPhoneLiveWarning = st.warning;
  }

  async saveEduAd() {
    if (!this.eduData.category_id || !this.eduData.subjectName) {
      this.presentToast('يرجى اختيار المرحلة التعليمية والمادة');
      return;
    }
    const resolvedCity = await ensureCoverageCityIdsForAdSubmit(this.govService, {
      isEditMode: this.isEditMode,
      userGovernorateId: this.userGovernorateId,
      userCityId: this.userCityId,
      cityDisplay: this.eduData.city,
      coverageCityIds: this.coverageCityIdsForAd,
    });
    this.userCityId = resolvedCity.userCityId;
    this.coverageCityIdsForAd = resolvedCity.coverageCityIds;
    if (!this.coverageCityIdsForAd.length) {
      this.presentToast('يرجى تحديد المناطق / المدن التي تخدمها ضمن محافظتك');
      return;
    }

    const owner = resolveAdFormSubmitOwner(this.auth, this.adminOwnerContext);
    if (!owner.canSubmit) {
      this.presentToast('يجب تسجيل الدخول أولاً');
      return;
    }

    const loader = await this.loadingCtrl.create({ 
      message: this.isEditMode ? 'جاري الحفظ...' : 'جاري التحقق والحفظ...', 
      mode: 'ios' 
    });
    await loader.present();

    try {
      const selectedCat = this.eduCategories.find(c => c.id === this.eduData.category_id);
      const stageNameAr = selectedCat ? (selectedCat as any).nameAr : this.eduData.category_id;
      const scopeSig = [...this.coverageCityIdsForAd].sort().join('__');
      const education_subject_token = `${stageNameAr}+${this.eduData.subjectName}`;
      const cityLabel = String(this.eduData.city || '').trim();
      const educationMatchKey =
        scopeSig.length > 0
          ? `${stageNameAr}+${this.eduData.subjectName}+SCOPE__${scopeSig}`
          : `${stageNameAr}+${this.eduData.subjectName}+${cityLabel}`;
      let ntfySnapshot: Record<string, unknown> | null = null;

      /**
       * فحص التكرار: نشترط تطابق «المرحلة التعليمية (category_id)» + «المادة (details.subject)» معاً —
       * بصرف النظر عن المدينة أو حالة الإعلان (pending/active/rejected/expired).
       */
      if (!this.isEditMode) {
        const duplicate = await runInInjectionContext(this.injector, () =>
          findDuplicateAd({
            firestore: this.firestore,
            phone: this.eduData.contactPhone,
            adType: 'education',
            categoryId: this.eduData.category_id,
            subject: this.eduData.subjectName,
          })
        );
        if (duplicate) {
          await loader.dismiss();
          await presentDuplicateAdAlert({
            alertCtrl: this.alertCtrl,
            adType: 'education',
            activityNameAr: stageNameAr,
            subjectName: this.eduData.subjectName,
            existingStatus: duplicate.status,
          });
          return;
        }
      }

      await runInInjectionContext(this.injector, async (): Promise<void> => {
        const adId = this.isEditMode ? this.currentAdId! : `${this.eduData.contactPhone}_${Date.now()}`;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);

        const verifyTier = canonicalTierForFirestore(this.userVerificationStatus);

        const adPayload: any = {
          ad_id: adId,
          userId: owner.uid,
          owner_name: this.eduData.teacherName,
          owner_phone: this.eduData.contactPhone,
          category_id: this.eduData.category_id,
          ad_type: 'education',
          education_match_key: educationMatchKey,
          education_subject_token,
          verification_level: verifyTier,
          is_verified: verifyTier,
          sort_order: 999,
          details: {
            teacher_name: this.eduData.teacherName,
            subject: this.eduData.subjectName,
            description: this.eduData.description,
            location_type: this.eduData.location_type,
            whatsapp_phone: this.eduData.whatsappEnabled ? this.eduData.whatsappPhone : null
          },
          location: { lat: this.eduData.lat, lng: this.eduData.lng },
          city: this.eduData.city,
          coverage_city_ids: [...this.coverageCityIdsForAd],
          coverage_governorate_whole_ids: [...this.coverageGovernorateWholeIdsForAd],
          is_available: this.eduData.isAvailable,
          updated_at: serverTimestamp(),
        };

        if (this.isEditMode) {
          adPayload.status = 'pending';
          await updateDoc(doc(this.firestore, 'ads', adId), adPayload);
          await this.sparkFcm.enqueueSparkAdFcmSavedJob(adId);
          ntfySnapshot = {
            ad_type: 'education',
            category_id: adPayload.category_id,
            owner_name: adPayload.owner_name,
            details: { ...adPayload.details },
          };
        } else {
          adPayload.status = 'pending';
          adPayload.created_at = serverTimestamp();
          adPayload.expiry_date = expiry;
          adPayload.reject_reason = '';
          adPayload.call_clicks = 0;
          adPayload.whatsapp_clicks = 0;
          adPayload.impression_count = 0;
          adPayload.stats = { views: 0, calls: 0, whatsapp: 0 };
          await setDoc(doc(this.firestore, 'ads', adId), adPayload);
          await this.sparkFcm.enqueueSparkAdFcmSavedJob(adId);
          ntfySnapshot = {
            ad_type: 'education',
            category_id: adPayload.category_id,
            owner_name: adPayload.owner_name,
            details: { ...adPayload.details },
          };
        }
      });

      this.isSubmitting = true;
      await loader.dismiss();
      this.presentToast(
        adFormPendingSuccessMessage(this.isEditMode, this.adminOwnerContext)
      );
      await this.modalCtrl.dismiss({ submitted: true }, 'confirm');
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

    } catch (e) {
      console.error(e);
      await loader.dismiss();
      this.presentToast('حدث خطأ أثناء الحفظ - تواصل مع الإدارة');
    }
  }
  
  async close() {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async presentToast(m: string) {
    const t = await this.toastCtrl.create({ message: m, duration: 2500, mode: 'ios' });
    await t.present();
  }
}

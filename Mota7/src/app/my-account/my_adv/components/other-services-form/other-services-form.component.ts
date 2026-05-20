import { Component, OnInit, inject, Input, EnvironmentInjector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, LoadingController, ToastController, NavController, ModalController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { OTHER_SERVICES_DATA } from '../../../../core/constants/other-services-data';
import { AppTaxonomyService } from '../../../../core/services/app-taxonomy.service';
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
import { chevronDownOutline, chevronForwardOutline, logoWhatsapp, shieldCheckmark, checkmarkCircle } from 'ionicons/icons';
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
import { Mota7DigitsOnlyIonInputDirective } from 'src/app/shared/directives/mota7-digits-only-ion-input.directive';

@Component({
  selector: 'app-other-services-form',
  templateUrl: './other-services-form.component.html',
  styleUrls: ['./other-services-form.component.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    GovernorateCitySelectorComponent,
    Mota7DigitsOnlyIonInputDirective,
  ],
})
export class OtherServicesFormComponent implements OnInit {
  @Input() editAdData: any; 
  categories: any[] = [...OTHER_SERVICES_DATA.items];
  isEditMode = false;
  currentAdId: string | null = null;
  userVerificationStatus: string = 'none';
  whatsappPhoneLiveWarning: string | null = null;

  readonly onWhatsappDigitsOnlyWarn = (msg: string): void => {
    this.whatsappPhoneLiveWarning = msg;
  };

  serviceData = {
    category_id: '',
    providerName: '', 
    isAvailable: true,
    contactPhone: '',
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
      this.serviceData.city,
      this.coverageGovernorateWholeIdsForAd
    );
    this.coverageCityIdsForAd = applied.coverageCityIds;
    this.coverageGovernorateWholeIdsForAd = applied.coverageGovernorateWholeIds;
    this.serviceData.city = applied.cityDisplay;
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
    addIcons({ chevronDownOutline, chevronForwardOutline, logoWhatsapp, shieldCheckmark, checkmarkCircle });
  }

  async ngOnInit() {
    this.taxonomy.bundle$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((b) => {
      this.categories = b.otherItems;
    });

    if (this.editAdData) {
      this.isEditMode = true;
      this.loadExistingAdData(this.editAdData);
      await this.applyUserGovernorateContext();
    } else {
      // تحميل بيانات البروفايل فور فتح الصفحة
      await this.loadUserProfile();
    }
  }

  private async applyUserGovernorateContext(): Promise<void> {
    const ctx = await loadUserGovernorateContextForAdForm(
      this.auth,
      this.firestore,
      this.injector
    );
    this.userGovernorateId = ctx.userGovernorateId;
    if (ctx.userCityId) {
      this.userCityId = ctx.userCityId;
    }
  }

  loadExistingAdData(ad: any) {
    this.currentAdId = ad.id || ad.ad_id;
    this.serviceData = {
      category_id: ad.category_id || '',
      providerName: ad.details?.provider_name || ad.owner_name || '',
      isAvailable: ad.is_available ?? true,
      contactPhone: ad.owner_phone || '',
      whatsappEnabled: !!ad.details?.whatsapp_phone,
      whatsappPhone: ad.details?.whatsapp_phone || ad.owner_phone || '',
      lat: ad.location?.lat || 0,
      lng: ad.location?.lng || 0,
      city: ad.city || ''
    };
    this.coverageCityIdsForAd = uniqSortedCityIds(ad.coverage_city_ids);
    this.coverageGovernorateWholeIdsForAd = uniqSortedCityIds(ad.coverage_governorate_whole_ids);
    this.userVerificationStatus = canonicalTierForFirestore(
      ad.verification_level ?? ad.is_verified
    );
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
          this.serviceData.contactPhone = data['phone'] || '';
          this.serviceData.whatsappPhone = data['phone'] || '';
          this.serviceData.providerName = data['fullName'] || data['name'] || '';
          this.userVerificationStatus = tierFromUserDoc(data as Record<string, unknown>);
          const geo = await hydrateAdFormUserCityFromProfile(
            this.govService,
            data as Record<string, unknown>,
            this.isEditMode
          );
          this.userGovernorateId = geo.userGovernorateId;
          this.userCityId = geo.userCityId;
          this.serviceData.city = geo.cityDisplay || this.serviceData.city;
          this.coverageCityIdsForAd = geo.coverageCityIds;
          return data;
        }
      } catch (e) {
        console.error("Error loading profile:", e);
      }
    }
    return null;
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
    this.serviceData.whatsappPhone = st.cleaned;
    this.whatsappPhoneLiveWarning = st.warning;
  }

// دالة الحفظ المعدلة اللي هتحل المشكلة
async saveServiceAd() {
  if (!this.serviceData.category_id) {
    this.presentToast('يرجى اختيار نوع الخدمة');
    return;
  }
  const resolvedCity = await ensureCoverageCityIdsForAdSubmit(this.govService, {
    isEditMode: this.isEditMode,
    userGovernorateId: this.userGovernorateId,
    userCityId: this.userCityId,
    cityDisplay: this.serviceData.city,
    coverageCityIds: this.coverageCityIdsForAd,
  });
  this.userCityId = resolvedCity.userCityId;
  this.coverageCityIdsForAd = resolvedCity.coverageCityIds;
  if (!this.coverageCityIdsForAd.length) {
    this.presentToast('يرجى تحديد المناطق / المدن التي تخدمها ضمن محافظتك');
    return;
  }

  const loader = await this.loadingCtrl.create({ 
    message: 'جاري الحفظ...', 
    mode: 'ios' 
  });
  await loader.present();

  try {
    const user = this.auth.currentUser;
    if (!user) {
      await loader.dismiss();
      this.presentToast('يجب تسجيل الدخول أولاً');
      return;
    }

    // محاولة جلب الاسم من البيانات المحملة مسبقاً في ngOnInit أو من الفورم
    let nameToSave = this.serviceData.providerName || 'مستخدم متاح';

    // نجلب اسم الفرع بترتيب أولوية يضمن قيمة صحيحة دائماً:
    // 1) القائمة الديناميكية (Firestore: Categories/other_services) — تلتقط أي فرع جديد فوراً
    // 2) القائمة الثابتة كاحتياط (لو الاشتراك لم يطلق بعد أو فشل)
    // 3) معرّف الفرع نفسه كاحتياط أخير (أفضل من سلسلة فارغة "_city")
    const dynCat = this.categories.find((c: any) => c?.id === this.serviceData.category_id);
    const staticCat = OTHER_SERVICES_DATA.items.find((c) => c.id === this.serviceData.category_id);
    const serviceNameAr = String(
      dynCat?.nameAr || staticCat?.nameAr || this.serviceData.category_id || ''
    ).trim();
    const scopeSig = [...this.coverageCityIdsForAd].sort().join('__');
    const other_service_token = serviceNameAr === 'غير محدد' ? '' : serviceNameAr;
    const cityLabel = String(this.serviceData.city || '').trim();
    const other_match_key =
      scopeSig.length > 0 ? `${serviceNameAr}__SCOPE__${scopeSig}` : `${serviceNameAr}_${cityLabel}`;
    let ntfySnapshot: Record<string, unknown> | null = null;

    /**
     * فحص التكرار: نمنع إضافة خدمة ثانية من نفس النوع (category_id) لنفس المستخدم —
     * بصرف النظر عن حالة الإعلان القديم (pending/active/rejected/expired).
     */
    if (!this.isEditMode) {
      const duplicate = await runInInjectionContext(this.injector, () =>
        findDuplicateAd({
          firestore: this.firestore,
          phone: this.serviceData.contactPhone,
          adType: 'other',
          categoryId: this.serviceData.category_id,
        })
      );
      if (duplicate) {
        await loader.dismiss();
        await presentDuplicateAdAlert({
          alertCtrl: this.alertCtrl,
          adType: 'other',
          activityNameAr: serviceNameAr,
          existingStatus: duplicate.status,
        });
        return;
      }
    }

    const adId = this.isEditMode ? this.currentAdId! : `${this.serviceData.contactPhone}_${this.serviceData.category_id}-${Date.now()}`;

    await runInInjectionContext(this.injector, async () => {
      const verifyTier = canonicalTierForFirestore(this.userVerificationStatus);
      const adPayload: any = {
        ad_id: adId,
        userId: user.uid,
        owner_phone: this.serviceData.contactPhone,
        owner_name: nameToSave,
        ad_type: 'other',
        category_id: this.serviceData.category_id,
        other_match_key: other_match_key,
        other_service_token,
        verification_level: verifyTier,
        is_verified: verifyTier,
        sort_order: 999,
        details: {
          provider_name: nameToSave,
          // نحفظ الاسم العربي للفرع داخل تفاصيل الإعلان كمصدر احتياطي عرض
          // (يستخدمه resolver عرض الكروت في حال غياب القائمة الديناميكية محلياً).
          service_name: serviceNameAr,
          whatsapp_phone: this.serviceData.whatsappEnabled ? this.serviceData.whatsappPhone : null,
          is_available: this.serviceData.isAvailable
        },
        location: { lat: this.serviceData.lat, lng: this.serviceData.lng },
        city: this.serviceData.city,
        coverage_city_ids: [...this.coverageCityIdsForAd],
        coverage_governorate_whole_ids: [...this.coverageGovernorateWholeIdsForAd],
        is_available: this.serviceData.isAvailable,
        updated_at: serverTimestamp()
      };

      if (this.isEditMode) {
        adPayload.status = 'pending';
        await updateDoc(doc(this.firestore, 'ads', adId), adPayload);
        await this.sparkFcm.enqueueSparkAdFcmSavedJob(adId);
        ntfySnapshot = {
          ad_type: 'other_services',
          category_id: adPayload.category_id,
          owner_name: adPayload.owner_name,
          details: { ...adPayload.details },
        };
      } else {
        adPayload.status = 'pending';
        adPayload.created_at = serverTimestamp();
        adPayload.reject_reason = '';
        adPayload.call_clicks = 0;
        adPayload.whatsapp_clicks = 0;
        adPayload.impression_count = 0;
        adPayload.stats = { views: 0, calls: 0, whatsapp: 0 };
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        adPayload.expiry_date = expiry;
        await setDoc(doc(this.firestore, 'ads', adId), adPayload);
        await this.sparkFcm.enqueueSparkAdFcmSavedJob(adId);
        ntfySnapshot = {
          ad_type: 'other_services',
          category_id: adPayload.category_id,
          owner_name: adPayload.owner_name,
          details: { ...adPayload.details },
        };
      }
    });

    await loader.dismiss();
    await this.modalCtrl.dismiss({ submitted: true }, 'confirm');
    this.presentToast(this.isEditMode ? 'تم تحديث البيانات بنجاح' : 'تم إرسال طلبك للمراجعة بنجاح');

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
    if (loader) await loader.dismiss();
    console.error("Firebase Error: ", e);
    this.presentToast('حدث خطأ أثناء الحفظ');
  }
}

async close() {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async presentToast(m: string) {
    const t = await this.toastCtrl.create({ 
      message: m, 
      duration: 2500, 
      mode: 'ios', 
      position: 'bottom' 
    });
    await t.present();
  }
}

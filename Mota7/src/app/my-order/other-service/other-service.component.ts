import { encodeWhatsappText } from 'src/app/core/utils/whatsapp-open.util';
import {
  Component,
  OnInit,
  ViewChild,
  inject,
  Injector,
  runInInjectionContext,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AlertController, IonInput, IonTextarea, LoadingController, ModalController, NavController } from '@ionic/angular';
import { OTHER_SERVICES_DATA } from '../../core/constants/other-services-data';
import { Firestore, collection, query, where, getDocs, Timestamp, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { ServiceOrderPushService } from '../../core/services/service-order-push.service';
import { AppTaxonomyService } from '../../core/services/app-taxonomy.service';
import {
  applyOrderPhoneInputState,
  isOrderPhoneValid,
  ORDER_PHONE_DIGITS_ONLY_MSG,
  ORDER_PHONE_INVALID_MSG,
  orderPhoneToEnglishDigits,
} from '../../core/utils/egyptian-phone-order.util';
import { blockDigitsOnlyPaste } from '../../core/utils/mota7-digits-only-input.util';
import {
  findMatchingNameArItem,
  normalizeUserFreeText,
  presentOrderRequiredFieldAlert,
  readIonTextInputValueFromEvent,
} from '../../core/utils/order-form-fields.util';
import { mergeGuestStoredContactIntoOrderData } from '../../core/utils/guest-order-contact-storage.util';
import type { CoverageMultiEmit } from '../../shared/governorate-city-selector/governorate-city-selector.component';
import { GovernorateService } from '../../core/services/governorate.service';
import {
  applyServiceRequestCoverageFromUserDoc,
  assignServiceRequestCoverageToComponent,
  finalizeServiceRequestCoverageForSubmit,
  hydrateServiceRequestCoverageFromGuestStorage,
  hydrateServiceRequestCoverageFromUserDoc,
  persistGuestOrderContactAfterServiceSubmit,
} from '../../core/utils/service-request-user-city.util';

@Component({
  selector: 'app-other-service',
  templateUrl: './other-service.component.html',
  styleUrls: ['./other-service.component.scss'],
  standalone: false
})
export class OtherServiceComponent implements OnInit {

  /** يُمرَّر من مودال التبويب عند اختيار فرع خدمة من الشبكة السريعة */
  initialSubServiceId?: string;
  initialSubServiceNameAr?: string;
  /** عند true: قبول الطلب دون اختيار فرع (زر «المزيد» ضمن خدمات أخرى) */
  @ViewChild('inputCustomerName', { read: IonInput }) private inputCustomerName?: IonInput;
  @ViewChild('inputCustomerPhone', { read: IonInput }) private inputCustomerPhone?: IonInput;
  @ViewChild('textareaShortNote', { read: IonTextarea }) private textareaShortNote?: IonTextarea;

  /**
   * قائمة الفروع المعروضة للعميل في ion-select.
   * تبدأ من الثوابت كاحتياط فوري، ثم تُستبدل بالقائمة الديناميكية القادمة من
   * Firestore (Categories/other_services) عبر AppTaxonomyService، فتظهر أي
   * فروع جديدة يضيفها الأدمن بدون نشر تطبيق جديد.
   */
  otherItems: Array<{ id: string; nameAr: string; nameEn?: string }> =
    [...OTHER_SERVICES_DATA.items];
  requestCoverageCityIds: string[] = [];
  requestCoverageArabic: string[] = [];
  phoneLiveWarning: string | null = null;

  readonly onPhoneDigitsOnlyWarn = (msg: string): void => {
    this.phoneLiveWarning = msg;
  };
  private loadingCtrl = inject(LoadingController);
  private firestore = inject(Firestore);
  private auth = inject(Auth); 
  private injector = inject(Injector);
  private orderPush = inject(ServiceOrderPushService);
  private taxonomy = inject(AppTaxonomyService);
  private govService = inject(GovernorateService);
  private destroyRef = inject(DestroyRef);

  orderData = {
    customerName: '',
    customerPhone: '',
    subService: '',
    shortNote: '',
    city: ''
  };

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private navCtrl: NavController
  ) {}

  async ngOnInit() {
    // اشتراك مبكّر في الـ taxonomy لجلب أحدث فروع "خدمات أخرى" من Firestore.
    // إذا لم يصدر إصدار بعد لأي سبب نُبقي القائمة الثابتة كاحتياط.
    this.taxonomy.bundle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => {
        const items = (b?.otherItems ?? []).filter((i: any) => i?.id && i?.nameAr);
        if (items.length > 0) {
          this.otherItems = items as Array<{ id: string; nameAr: string; nameEn?: string }>;
          this.applyInitialSubServicePreset();
        }
      });

    await this.loadUserProfile();
    const loggedIn = !!this.auth.currentUser?.email;
    mergeGuestStoredContactIntoOrderData(this.orderData, loggedIn);
    if (!loggedIn) {
      const guestApplied = await hydrateServiceRequestCoverageFromGuestStorage(
        this.govService,
        {
          requestCoverageCityIds: this.requestCoverageCityIds,
          requestCoverageArabic: this.requestCoverageArabic,
          orderCity: this.orderData.city,
        }
      );
      assignServiceRequestCoverageToComponent(this, guestApplied);
    }
    const st = applyOrderPhoneInputState(this.orderData.customerPhone);
    this.orderData.customerPhone = st.cleaned;
    this.phoneLiveWarning = st.warning;

    this.applyInitialSubServicePreset();
  }

  /** مطابقة الفرع المسبق (معرّف Firestore أو اسم عربي) بعد تحميل القائمة */
  private applyInitialSubServicePreset(): void {
    if (this.initialSubServiceId) {
      const byId = this.otherItems.find((i) => i.id === this.initialSubServiceId);
      if (byId) {
        this.orderData.subService = byId.nameAr;
        return;
      }
    }
    if (this.initialSubServiceNameAr) {
      const m = findMatchingNameArItem(this.otherItems, this.initialSubServiceNameAr);
      this.orderData.subService = m?.nameAr ?? this.initialSubServiceNameAr;
    }
  }

  onCustomerPhoneKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) {
      return;
    }
    const key = ev.key;
    if (key.length !== 1) {
      return;
    }
    const asDigit = orderPhoneToEnglishDigits(key);
    if (/^[0-9]$/.test(asDigit)) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.phoneLiveWarning = ORDER_PHONE_DIGITS_ONLY_MSG;
  }

  onCustomerPhoneBeforeInput(ev: InputEvent): void {
    const t = ev.inputType || '';
    if (t !== 'insertText' && t !== 'insertCompositionText') {
      return;
    }
    const chunk = ev.data ?? '';
    if (!chunk) {
      return;
    }
    const english = orderPhoneToEnglishDigits(chunk);
    if (/\D/.test(english)) {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_DIGITS_ONLY_MSG;
    }
  }

  onCustomerPhoneChange(val: string): void {
    const raw = val || '';
    const st = applyOrderPhoneInputState(raw);
    this.orderData.customerPhone = st.cleaned;
    this.phoneLiveWarning = st.warning;

    if (this.inputCustomerPhone) {
      this.inputCustomerPhone.value = st.cleaned;
    }
  }

  onCustomerPhonePaste(ev: ClipboardEvent): void {
    blockDigitsOnlyPaste(
      ev,
      (digits) => this.onCustomerPhoneChange(digits),
      () => {
        this.phoneLiveWarning = ORDER_PHONE_DIGITS_ONLY_MSG;
      }
    );
  }

  onOtherFreeTextInput(ev: Event, field: 'customerName' | 'shortNote'): void {
    this.orderData[field] = readIonTextInputValueFromEvent(ev);
  }

  private async syncFreeTextFieldsFromNativeInputs(): Promise<void> {
    if (this.inputCustomerName) {
      try {
        const el = await this.inputCustomerName.getInputElement();
        const v = el?.value;
        if (typeof v === 'string') {
          this.orderData.customerName = v;
        }
      } catch {
        /* ignore */
      }
    }
    if (this.textareaShortNote) {
      try {
        const el = await this.textareaShortNote.getInputElement();
        const v = el?.value;
        if (typeof v === 'string') {
          this.orderData.shortNote = v;
        }
      } catch {
        /* ignore */
      }
    }
  }

  async loadUserProfile() {
    const user = this.auth.currentUser;
    if (user?.email) {
      const userKey = user.email.split('@')[0];
      try {
        const userDoc = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', userKey))
        );
        if (userDoc.exists()) {
          const data = userDoc.data();
          this.orderData.customerName = data['fullName'] || '';
          this.orderData.customerPhone = data['phone'] || '';
          const hydration = await hydrateServiceRequestCoverageFromUserDoc(
            this.govService,
            data
          );
          const applied = applyServiceRequestCoverageFromUserDoc(hydration, {
            requestCoverageCityIds: this.requestCoverageCityIds,
            requestCoverageArabic: this.requestCoverageArabic,
            orderCity: this.orderData.city,
          });
          assignServiceRequestCoverageToComponent(this, applied);
        }
      } catch (e) {
        console.error("Error loading profile:", e);
      }
    }
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  onRequestCoverage(ev: CoverageMultiEmit): void {
    this.requestCoverageCityIds = [...(ev.cityIds || [])];
    this.requestCoverageArabic = [...(ev.arabicTokens || [])];
    this.orderData.city = (ev.primaryCityDisplay || '').trim() || this.orderData.city;
  }

  async submitOrder() {
    await this.syncFreeTextFieldsFromNativeInputs();
    this.orderData.customerName = normalizeUserFreeText(this.orderData.customerName);
    const phoneSt = applyOrderPhoneInputState(this.orderData.customerPhone);
    this.orderData.customerPhone = phoneSt.cleaned;
    this.phoneLiveWarning = phoneSt.warning;
    this.orderData.subService = (this.orderData.subService || '').trim();
    this.orderData.shortNote = normalizeUserFreeText(this.orderData.shortNote);
    this.orderData.city = (this.orderData.city || '').trim();
    const coverage = finalizeServiceRequestCoverageForSubmit({
      requestCoverageCityIds: this.requestCoverageCityIds,
      requestCoverageArabic: this.requestCoverageArabic,
      orderCityDisplay: this.orderData.city,
    });
    const covIds = coverage.covIds;
    const prefilledCity = this.orderData.city;

    const customerName = this.orderData.customerName;
    const { customerPhone, shortNote } = this.orderData;

    const subMatch = findMatchingNameArItem(this.otherItems, this.orderData.subService);
    if (!subMatch) {
      await presentOrderRequiredFieldAlert(this.alertCtrl, 'الخدمة المطلوبة');
      return;
    }
    const canonicalSub = subMatch.nameAr;

    const missingParts: string[] = [];
    if (!customerName) {
      missingParts.push('الاسم');
    }
    if (!customerPhone) {
      missingParts.push('رقم الهاتف');
    }
    if (!covIds.length && !prefilledCity) {
      missingParts.push('المدينة (من القائمة)');
    }

    if (missingParts.length > 0) {
      const alert = await this.alertCtrl.create({
        header: 'بيانات ناقصة',
        message: `يرجى تعبئة: ${missingParts.join('، ')}`,
        buttons: ['موافق'],
        mode: 'ios'
      });
      await alert.present();
      return;
    }

    if (!isOrderPhoneValid(customerPhone)) {
      const alert = await this.alertCtrl.create({
        header: 'رقم الهاتف غير صحيح',
        message: ORDER_PHONE_INVALID_MSG,
        buttons: ['موافق'],
        mode: 'ios'
      });
      await alert.present();
      return;
    }

    this.orderData.subService = canonicalSub;
    const subService = canonicalSub;

    const city = coverage.cityDisplay;
    const scopeSig = covIds.join('__');
    const other_service_token = subService;
    const other_match_key =
      scopeSig.length > 0 ? `${subService}__SCOPE__${scopeSig}` : `${subService}_${city}`;

    this.orderData.city = city;

    const loader = await this.loadingCtrl.create({ 
      message: 'جاري معالجة طلبك...', 
      mode: 'ios' 
    });
    await loader.present();

    try {
      // --- 1. فحص الحظر (Blacklist Check) ---
      const blockedSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'blocked_users', customerPhone))
      );

      if (blockedSnap.exists()) {
        await loader.dismiss();
        const alert = await this.alertCtrl.create({
          header: 'تنبيه الحظر',
          message: 'نأسف، تم حظر هذا الرقم ولا يمكن إجراء طلبات في الوقت الحالي. يرجى التواصل مع الإدارة لحل المشكلة.',
          mode: 'ios',
          buttons: [
            {
              text: 'إلغاء',
              role: 'cancel'
            },
            {
              text: 'تواصل مع الإدارة',
              handler: () => {
                const msg = encodeWhatsappText("السلام عليكم.. عندي مشكلة حظر لطلبات الخدمات على مُتاح");
                window.open(`whatsapp://send?phone=201002288812&text=${msg}`, '_system');
              }
            }
          ]
        });
        await alert.present();
        return;
      }

      // --- 2. إعداد المعرف الفريد للمستند (Phone + Other Key) ---
      const customDocId = `${customerPhone}_${other_match_key}`;
      const now = Date.now();

      // --- 3. فحص التكرار باستخدام المعرف المباشر ---
      const orderSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'orders', customDocId))
      );
      if (orderSnap.exists()) {
        const existingData = orderSnap.data();
        const hold =
          existingData['pendingHoldExpiresAt']?.toMillis?.() ||
          existingData['expiresAt']?.toMillis?.() ||
          0;

        if (existingData['status'] === 'pending' && hold > now) {
          await loader.dismiss();
          const alert = await this.alertCtrl.create({
            header: 'طلب مكرر',
            message: `لديك طلب نشط بالفعل لهذه الخدمة. يمكنك متابعته من صفحة "طلباتي".`,
            mode: 'ios',
            buttons: ['موافق']
          });
          await alert.present();
          return;
        }
      }

      // --- 4. إرسال الطلب باستخدام setDoc لضمان المعرف الموحد ---
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 1);

      let finalOrder: Record<string, unknown>;
      await runInInjectionContext(this.injector, () => {
        finalOrder = {
          customerName,
          customerPhone,
          subService,
          shortNote: shortNote || '',
          city,
          order_coverage_city_ids: covIds,
          other_service_token,
          other_match_key: other_match_key,
          serviceType: 'other',
          status: 'pending',
          createdAt: Timestamp.now(),
          pendingHoldExpiresAt: Timestamp.fromDate(expiryDate),
        };
        return setDoc(doc(this.firestore, 'orders', customDocId), finalOrder);
      });
      await persistGuestOrderContactAfterServiceSubmit(
        this.govService,
        customerName,
        customerPhone,
        city,
        covIds
      );
      this.orderPush.afterOrderCreated(customDocId, { ...finalOrder! });

      await loader.dismiss();
      await this.modalCtrl.dismiss({ confirmed: true }, 'confirm');
      await this.navCtrl.navigateRoot('/tabs/my-order');

    } catch {
      await loader.dismiss();
      const alert = await this.alertCtrl.create({
        header: 'خطأ',
        message: 'حدثت مشكلة أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.',
        buttons: ['موافق'],
        mode: 'ios'
      });
      await alert.present();
    }
  }
}
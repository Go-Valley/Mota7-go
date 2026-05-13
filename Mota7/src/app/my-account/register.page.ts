import {
  ChangeDetectorRef,
  Component,
  EnvironmentInjector,
  ViewChild,
  inject,
  runInInjectionContext,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { IonInput, IonicModule, LoadingController, NavController, ToastController, Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../top_header/header';
import { subscribeHardwareBackToMyAccount } from '../core/utils/hardware-back-my-account.util';
import {
  applyOrderPhoneInputState,
  getOrderPhoneFieldLiveWarning,
  isOrderPhoneValid,
  ORDER_PHONE_INVALID_MSG,
  orderPhoneRawHasNonDigitChars,
  orderPhoneToEnglishDigits,
  sanitizeOrderPhoneInput,
} from '../core/utils/egyptian-phone-order.util';
import {
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../core/utils/order-form-fields.util';

import {
  GovernorateCitySelectorComponent,
  type SingleCityEmit,
} from '../shared/governorate-city-selector/governorate-city-selector.component';

import { 
  personAddOutline, 
  personOutline, 
  phonePortraitOutline, 
  mailOutline, 
  lockClosedOutline, 
  shieldCheckmarkOutline, 
  chevronForwardOutline,
  locationOutline // أيقونة إضافية للمدينة
} from 'ionicons/icons';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, Mota7HeaderComponent, FormsModule, GovernorateCitySelectorComponent],
})
export class RegisterPage implements OnInit, OnDestroy {
  @ViewChild('inputFullName', { read: IonInput }) private inputFullName?: IonInput;
  @ViewChild('inputPhone', { read: IonInput }) private inputPhone?: IonInput;
  private envInjector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);
  private platform = inject(Platform);
  private hardwareBackSub?: Subscription;

  phoneLiveWarning: string | null = null;
  private readonly fullNameMaxLen = 25;
  selectedCityGeo: SingleCityEmit | null = null;

  // تم إضافة حقل city هنا
  userData = {
    fullName: '',
    phone: '',
    city: '',
    email: '', 
    password: '',
    confirmPassword: ''
  };

  private normalizeFullName(raw: unknown): string {
    return normalizeUserFreeText(raw).slice(0, this.fullNameMaxLen);
  }

  constructor(
    private navCtrl: NavController,
    private auth: Auth, 
    private firestore: Firestore, 
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    addIcons({ 
      personAddOutline, 
      personOutline, 
      phonePortraitOutline, 
      mailOutline, 
      lockClosedOutline, 
      shieldCheckmarkOutline, 
      chevronForwardOutline,
      locationOutline
    });
  }

  ngOnInit() {
    this.hardwareBackSub = subscribeHardwareBackToMyAccount(this.platform, this.navCtrl);
  }

  onRegisterCityPick(ev: SingleCityEmit): void {
    this.selectedCityGeo = ev;
    this.userData.city = ev.cityNameAr || '';
  }

  ngOnDestroy(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = undefined;
  }

  onRegisterPhoneKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    const key = ev.key;
    if (
      key === 'Backspace' ||
      key === 'Delete' ||
      key === 'Tab' ||
      key === 'Enter' ||
      key.startsWith('Arrow') ||
      key === 'Home' ||
      key === 'End'
    ) {
      return;
    }
    // أثناء تركيب IME (عربي/صيني…) لا نمنع هنا — يُعالج في compositionend / ionInput
    if (ev.isComposing) {
      return;
    }
    if (key.length === 1) {
      const asDigit = orderPhoneToEnglishDigits(key);
      if (/^[0-9]$/.test(asDigit)) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
      return;
    }
    // مفاتيح غير حرف واحد (بعض لوحات IME) — إن لم تكن رقماً بعد التحويل نمنع
    const asDigit = orderPhoneToEnglishDigits(key);
    if (asDigit.length === 1 && /^[0-9]$/.test(asDigit)) {
      return;
    }
    if (key !== 'Unidentified' && key.length > 1) {
      ev.preventDefault();
      ev.stopPropagation();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
    }
  }

  onRegisterPhoneBeforeInput(ev: InputEvent): void {
    const t = ev.inputType || '';
    if (!t.startsWith('insert')) {
      return;
    }
    if (t === 'insertLineBreak' || t === 'insertParagraph') {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
      return;
    }
    const chunk = ev.data ?? '';
    if (!chunk) {
      return;
    }
    if (orderPhoneRawHasNonDigitChars(chunk)) {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
    }
  }

  onRegisterPhonePaste(ev: ClipboardEvent): void {
    const text = ev.clipboardData?.getData('text/plain') ?? '';
    if (!text) {
      return;
    }
    if (orderPhoneRawHasNonDigitChars(text)) {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
    }
  }

  /** بعد انتهاء تركيب النص العربي — مزامنة التحذير والتنظيف */
  async onRegisterPhoneCompositionEnd(): Promise<void> {
    await this.syncRegisterPhoneFromNative();
  }

  private async syncRegisterPhoneFromNative(): Promise<void> {
    if (!this.inputPhone) {
      return;
    }
    try {
      const el = await this.inputPhone.getInputElement();
      const raw = el?.value ?? '';
      const englishRaw = orderPhoneToEnglishDigits(String(raw));
      const hadNonDigit = /[^\d]/.test(englishRaw);
      const cleaned = sanitizeOrderPhoneInput(raw);
      this.userData.phone = cleaned;
      this.phoneLiveWarning = getOrderPhoneFieldLiveWarning(cleaned, hadNonDigit);
      if (el && el.value !== cleaned) {
        el.value = cleaned;
      }
      this.cdr.detectChanges();
    } catch {
      /* ignore */
    }
  }

  onFullNameBeforeInput(ev: InputEvent): void {
    const t = ev.inputType || '';
    if (!t.startsWith('insert')) {
      return;
    }
    const data = ev.data;
    if (data == null || data === '') {
      return;
    }
    const target = ev.target as HTMLInputElement | undefined;
    if (!target || typeof target.selectionStart !== 'number') {
      return;
    }
    const start = target.selectionStart;
    const end = target.selectionEnd ?? start;
    const val = target.value ?? '';
    const nextLen = val.length - (end - start) + data.length;
    if (nextLen > this.fullNameMaxLen) {
      ev.preventDefault();
    }
  }

  async onFullNameCompositionEnd(): Promise<void> {
    await this.clampFullNameToMax();
  }

  private async clampFullNameToMax(): Promise<void> {
    const v = this.normalizeFullName(this.userData.fullName);
    this.userData.fullName = v;
    if (!this.inputFullName) {
      return;
    }
    try {
      const el = await this.inputFullName.getInputElement();
      if (el && el.value !== v) {
        el.value = v;
      }
    } catch {
      /* ignore */
    }
    this.cdr.detectChanges();
  }

  /**
   * بدون getInputElement على كل ionInput — يخفّف تعليق المسح مع IME/WebView.
   * الحد الأقصى للطول: beforeinput + compositionend → clampFullNameToMax.
   */
  onFullNameInput(ev: Event): void {
    const v = readIonTextInputValueFromEvent(ev);
    if (this.userData.fullName === v) {
      return;
    }
    this.userData.fullName = v;
  }

  onRegisterPhoneChange(val: string): void {
    const raw = val || '';
    const englishRaw = orderPhoneToEnglishDigits(String(raw));
    const hadNonDigit = /[^\d]/.test(englishRaw);
    const cleaned = sanitizeOrderPhoneInput(raw);
    const warn = getOrderPhoneFieldLiveWarning(cleaned, hadNonDigit);
    
    this.userData.phone = cleaned;
    this.phoneLiveWarning = warn;
    
    if (this.inputPhone) {
      this.inputPhone.value = cleaned;
    }
  }

  goBack() {
    this.navCtrl.navigateRoot('/tabs/my-account');
  }

  goToLogin() {
    this.navCtrl.navigateRoot('/login');
  }

  async performRegister() {
    if (this.inputFullName) {
      try {
        const native = await this.inputFullName.getInputElement();
        this.userData.fullName = this.normalizeFullName(native?.value);
      } catch {
        this.userData.fullName = this.normalizeFullName(this.userData.fullName);
      }
    } else {
      this.userData.fullName = this.normalizeFullName(this.userData.fullName);
    }

    const phoneSt = applyOrderPhoneInputState(this.userData.phone);
    this.userData.phone = phoneSt.cleaned;
    this.phoneLiveWarning = getOrderPhoneFieldLiveWarning(phoneSt.cleaned, false);

    // التحقق من إدخال المدينة أيضاً
    if (!this.userData.fullName || !this.userData.phone || !this.userData.password || !this.selectedCityGeo?.cityId) {
      this.showToast('يرجى ملء جميع البيانات الأساسية');
      return;
    }

    if (this.userData.password !== this.userData.confirmPassword) {
      this.showToast('كلمات المرور غير متطابقة');
      return;
    }

    const finalPhone = this.userData.phone;
    if (!isOrderPhoneValid(finalPhone)) {
      this.showToast(ORDER_PHONE_INVALID_MSG);
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'جاري إنشاء الحساب...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      const systemAuthEmail = `${finalPhone}@mota7.com`;

      const userCredential = await runInInjectionContext(this.envInjector, () =>
        createUserWithEmailAndPassword(this.auth, systemAuthEmail, this.userData.password)
      );

      const uid = userCredential.user.uid;

      await runInInjectionContext(this.envInjector, () =>
        setDoc(doc(this.firestore, 'users', finalPhone), {
          uid: uid,
          fullName: this.userData.fullName,
          phone: finalPhone,
          city: this.selectedCityGeo?.cityNameAr ?? this.userData.city,
          governorate_id: this.selectedCityGeo?.governorateId ?? '',
          city_id: this.selectedCityGeo?.cityId ?? '',
          governorate_name_ar: this.selectedCityGeo?.governorateNameAr ?? '',
          systemEmail: systemAuthEmail,
          personalEmail: this.userData.email || '',
          createdAt: new Date().toISOString(),
          role: 'user',
          isActive: true,
          verification_level: 'empty',
          verifiedStatus: 'empty',
          max_active_ads: 0,
          free_trial_used: false,
        })
      );

      await loading.dismiss();
      this.showToast('تم إنشاء الحساب بنجاح');
      this.navCtrl.navigateRoot('/tabs/my-account');

    } catch (error: any) {
      await loading.dismiss();
      console.error('Registration Error:', error);
      let msg = 'حدث خطأ أثناء التسجيل';
      if (error.code === 'auth/email-already-in-use') msg = 'رقم الهاتف هذا مسجل مسبقاً';
      if (error.code === 'auth/weak-password') msg = 'كلمة المرور يجب ألا تقل عن 6 أحرف';
      this.showToast(msg);
    }
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg, duration: 3000, position: 'bottom', color: 'dark'
    });
    await toast.present();
  }
}
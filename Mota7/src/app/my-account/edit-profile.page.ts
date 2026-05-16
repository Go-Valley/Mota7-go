import {
  ChangeDetectorRef,
  Component,
  EnvironmentInjector,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  IonInput,
  IonicModule,
  ViewWillLeave,
  LoadingController,
  NavController,
  Platform,
  ToastController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import { subscribeHardwareBackToMyAccount } from '../core/utils/hardware-back-my-account.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { 
  chevronForwardOutline, 
  personOutline, 
  phonePortraitOutline, 
  mailOutline, 
  saveOutline,
  cameraOutline,
  lockClosedOutline,
  locationOutline
} from 'ionicons/icons';

// استيرادات الفيربيز
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../core/utils/order-form-fields.util';
import { UserAccountStatusService } from './user-account-status.service';
import {
  GovernorateCitySelectorComponent,
  type SingleCityEmit,
} from '../shared/governorate-city-selector/governorate-city-selector.component';

@Component({
  selector: 'app-edit-profile',
  templateUrl: './edit-profile.page.html',
  styleUrls: ['./edit-profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, GovernorateCitySelectorComponent],
})
export class EditProfilePage implements OnInit, OnDestroy, ViewWillLeave {
  @ViewChild('inputFullName', { read: IonInput }) private inputFullName?: IonInput;

  private readonly fullNameMaxLen = 25;
  private cdr = inject(ChangeDetectorRef);
  private platform = inject(Platform);
  private hardwareBackSub?: Subscription;

  userData = {
    fullName: '',
    phone: '',
    personalEmail: '',
    city: '',
  };

  /** تمييز المدينة في المحدّد بعد التحميل */
  profileGeoSeed: { governorateId: string; cityId: string } | null = null;
  private loadedGeoFields: { governorate_id: string; city_id: string; governorate_name_ar: string } = {
    governorate_id: '',
    city_id: '',
    governorate_name_ar: '',
  };
  selectedCityGeo: SingleCityEmit | null = null;

  /** مودال تغيير كلمة المرور (Firebase Auth — Email/Password) */
  passwordModalOpen = false;
  pwdCurrent = '';
  pwdNew = '';
  pwdConfirm = '';

  private normalizeFullName(raw: unknown): string {
    return normalizeUserFreeText(raw).slice(0, this.fullNameMaxLen);
  }

  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  readonly acct = inject(UserAccountStatusService);

  constructor(
    private navCtrl: NavController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    addIcons({ 
      chevronForwardOutline, 
      personOutline, 
      phonePortraitOutline, 
      mailOutline, 
      saveOutline,
      cameraOutline,
      lockClosedOutline,
      locationOutline
    });
  }

  async ngOnInit() {
    this.hardwareBackSub = subscribeHardwareBackToMyAccount(this.platform, this.navCtrl);
    this.loadUserData();
  }

  ngOnDestroy(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = undefined;
  }

  /** يمنع تحذير aria-hidden عندما يبقى تركيز input داخل outlet أثناء overlay/تنقل */
  ionViewWillLeave(): void {
    this.blurActiveFocus();
  }

  private blurActiveFocus(): void {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el !== document.body) {
      el.blur();
    }
  }

  async loadUserData() {
    const user = this.auth.currentUser;
    if (user && user.email) {
      const userIdentifier = user.email.split('@')[0];
      
      try {
        const userDoc = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', userIdentifier))
        );
        if (userDoc.exists()) {
          const data = userDoc.data();
          this.userData.fullName = this.normalizeFullName(data['fullName'] || '');
          this.userData.phone = data['phone'] || '';
          this.userData.personalEmail = data['personalEmail'] || '';
          this.userData.city = data['city'] || '';
          const gid = String(data['governorate_id'] ?? '').trim();
          const cid = String(data['city_id'] ?? '').trim();
          const gna = String(data['governorate_name_ar'] ?? '').trim();
          this.loadedGeoFields = {
            governorate_id: gid,
            city_id: cid,
            governorate_name_ar: gna,
          };
          if (gid && cid) {
            this.profileGeoSeed = { governorateId: gid, cityId: cid };
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      }
    }
  }

  onProfileCityPick(ev: SingleCityEmit): void {
    this.blurActiveFocus();
    this.selectedCityGeo = ev;
    this.userData.city = ev.cityNameAr || '';
    this.profileGeoSeed = { governorateId: ev.governorateId, cityId: ev.cityId };
    this.loadedGeoFields = {
      governorate_id: ev.governorateId,
      city_id: ev.cityId,
      governorate_name_ar: ev.governorateNameAr || '',
    };
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
   * مزامنة خفيفة فقط — بدون getInputElement على كل ضغطة (كان يسبب تعليق الحذف على WebView/IME).
   * التصحيح عند تجاوز الطول يبقى عبر beforeinput + compositionend → clampFullNameToMax.
   */
  onFullNameInput(ev: Event): void {
    const v = readIonTextInputValueFromEvent(ev);
    if (this.userData.fullName === v) {
      return;
    }
    this.userData.fullName = v;
  }

  openChangePasswordModal(): void {
    if (!this.acct.accountUsable()) {
      void this.showToast('لا يمكن تغيير كلمة المرور — الحساب معطّل');
      return;
    }
    const user = this.auth.currentUser;
    if (!user?.email) {
      void this.showToast('لا يوجد مستخدم مسجّل');
      return;
    }
    this.blurActiveFocus();
    this.clearPasswordFields();
    this.passwordModalOpen = true;
    this.cdr.detectChanges();
  }

  closePasswordModal(): void {
    this.blurActiveFocus();
    this.clearPasswordFields();
    this.passwordModalOpen = false;
  }

  onPasswordModalDismiss(): void {
    this.clearPasswordFields();
    this.passwordModalOpen = false;
  }

  private clearPasswordFields(): void {
    this.pwdCurrent = '';
    this.pwdNew = '';
    this.pwdConfirm = '';
  }

  /**
   * تحديث كلمة المرور في Firebase Authentication بعد إعادة مصادقة بكلمة المرور الحالية.
   * البريد المُستخدم للحساب: {phone}@mota7.com
   */
  async submitPasswordChange(): Promise<void> {
    if (!this.acct.accountUsable()) {
      await this.showToast('لا يمكن تغيير كلمة المرور — الحساب معطّل');
      return;
    }

    const user = this.auth.currentUser;
    const email = user?.email;
    if (!user || !email) {
      await this.showToast('لا يوجد مستخدم مسجّل');
      return;
    }

    const cur = this.pwdCurrent;
    const next = this.pwdNew;
    const conf = this.pwdConfirm;

    if (!cur || !next || !conf) {
      await this.showToast('يرجى تعبئة جميع الحقول');
      return;
    }
    if (next !== conf) {
      await this.showToast('كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }
    if (next === cur) {
      await this.showToast('كلمة المرور الجديدة مطابقة للحالية — اختر كلمة مختلفة');
      return;
    }

    this.blurActiveFocus();
    const loading = await this.loadingCtrl.create({ message: 'جاري تغيير كلمة المرور...' });
    await loading.present();

    try {
      const credential = EmailAuthProvider.credential(email, cur);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, next);

      await loading.dismiss();
      this.clearPasswordFields();
      this.passwordModalOpen = false;
      await this.showToast('تم تغيير كلمة المرور بنجاح على Firebase');
    } catch (e: unknown) {
      await loading.dismiss();
      const code =
        typeof e === 'object' && e !== null && 'code' in e
          ? String((e as { code?: string }).code)
          : '';
      let msg = 'تعذّر تغيير كلمة المرور';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        msg = 'كلمة المرور الحالية غير صحيحة';
      } else if (code === 'auth/weak-password') {
        msg = 'كلمة المرور الجديدة ضعيفة (الحد الأدنى 6 أحرف في Firebase)';
      } else if (code === 'auth/too-many-requests') {
        msg = 'محاولات كثيرة، حاول لاحقاً';
      } else if (code === 'auth/requires-recent-login') {
        msg = 'انتهت صلاحية الجلسة، سجّل الخروج ثم أعد الدخول';
      }
      console.error('submitPasswordChange:', e);
      await this.showToast(msg);
    }
  }

  async saveProfile() {
    if (!this.acct.accountUsable()) {
      await this.showToast('لا يمكن تعديل الملف — الحساب معطّل');
      return;
    }
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

    if (!this.userData.fullName) {
      this.showToast('الاسم مطلوب');
      return;
    }
    if (!String(this.userData.city || '').trim()) {
      await this.showToast('يرجى اختيار المدينة من القائمة');
      return;
    }

    this.blurActiveFocus();
    const loading = await this.loadingCtrl.create({ message: 'جاري حفظ التعديلات...' });
    await loading.present();

    try {
      const user = this.auth.currentUser;
      if (user && user.email) {
        const userIdentifier = user.email.split('@')[0];

        await runInInjectionContext(this.injector, () =>
          updateDoc(doc(this.firestore, 'users', userIdentifier), {
            fullName: this.userData.fullName,
            personalEmail: this.userData.personalEmail,
            city: String(this.userData.city || '').trim(),
            governorate_id: this.selectedCityGeo?.governorateId ?? this.loadedGeoFields.governorate_id ?? '',
            city_id: this.selectedCityGeo?.cityId ?? this.loadedGeoFields.city_id ?? '',
            governorate_name_ar:
              this.selectedCityGeo?.governorateNameAr ?? this.loadedGeoFields.governorate_name_ar ?? '',
          })
        );

        await loading.dismiss();
        this.showToast('تم تحديث الملف الشخصي بنجاح');
        void this.navCtrl.navigateRoot('/tabs/my-account', { animated: true });
      }
    } catch (error) {
      await loading.dismiss();
      console.error("Update Error:", error);
      this.showToast('حدث خطأ أثناء التحديث');
    }
  }

  goBack(): void {
    this.blurActiveFocus();
    void this.navCtrl.navigateRoot('/tabs/my-account', { animated: true });
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({ message: msg, duration: 2000, position: 'bottom', color: 'dark' });
    await toast.present();
  }
}
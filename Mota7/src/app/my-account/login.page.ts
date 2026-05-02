import {
  Component,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
  ViewChild,
  OnInit,
  OnDestroy,
} from '@angular/core';
import {
  IonInput,
  IonicModule,
  NavController,
  LoadingController,
  ToastController,
  Platform,
} from '@ionic/angular';
import type { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
// استيرادات الفيربيز للربط الفعلي
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../top_header/header';
import { subscribeHardwareBackToMyAccount } from '../core/utils/hardware-back-my-account.util';
import {
  applyOrderPhoneInputState,
  isOrderPhoneValid,
  ORDER_PHONE_DIGITS_ONLY_MSG,
  ORDER_PHONE_INVALID_MSG,
  orderPhoneToEnglishDigits,
} from '../core/utils/egyptian-phone-order.util';
import { readIonTextInputValueFromEvent } from '../core/utils/order-form-fields.util';
import {
  getLegacyFirebaseAuth,
  toLegacyLoginEmail,
} from '../core/utils/legacy-firebase-login.util';
import {
  buildMigratedUserFirestoreDoc,
  getLegacyFirestore,
  legacyPhoneNumberToOrderPhone,
} from '../core/utils/legacy-firebase-migration.util';
import {
  migrateLegacyServiceAdsOnce,
  type PrefetchedLegacyServiceRow,
} from '../core/utils/legacy-services-import.util';
import {
  collection as legacyCollection,
  doc as legacyDocRef,
  getDoc as legacyGetDoc,
  getDocs as legacyGetDocs,
  query as legacyQuery,
  where as legacyWhere,
} from 'firebase/firestore';
import { 
  fingerPrintOutline, 
  phonePortraitOutline, 
  lockClosedOutline, 
  chevronForwardOutline 
} from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, Mota7HeaderComponent, FormsModule]
})
export class LoginPage implements OnInit, OnDestroy {

  @ViewChild('inputPhone', { read: IonInput }) private inputPhone?: IonInput;

  // حقن الخدمات الجديدة
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private platform = inject(Platform);
  private hardwareBackSub?: Subscription;

  /** تحذير فوري تحت حقل الهاتف (نفس منطق طلبات الخدمات) */
  phoneLiveWarning: string | null = null;

  // بيانات الدخول المربوطة بالواجهة
  loginData = {
    phone: '',
    password: ''
  };

  constructor(
    private navCtrl: NavController,
    private auth: Auth, // خدمة الحسابات
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    addIcons({ 
      fingerPrintOutline, 
      phonePortraitOutline, 
      lockClosedOutline, 
      chevronForwardOutline 
    });
  }

  ngOnInit(): void {
    this.hardwareBackSub = subscribeHardwareBackToMyAccount(this.platform, this.navCtrl);
  }

  ngOnDestroy(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = undefined;
  }

  // العودة لصفحة حسابي الشخصية وتفريغ الذاكرة
  goBack() {
    this.navCtrl.navigateRoot('/tabs/my-account');
  }

  // الانتقال لصفحة التسجيل مع جعلها هي الصفحة الأساسية الحالية
  goToRegister() {
    this.navCtrl.navigateRoot('/register');
  }

  onLoginPhoneKeyDown(ev: KeyboardEvent): void {
    if (!ev || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) {
      return;
    }
    const key = ev.key;
    if (typeof key !== 'string' || key.length !== 1) {
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

  onLoginPhoneBeforeInput(ev: InputEvent): void {
    const t = ev.inputType || '';
    if (t !== 'insertText' && t !== 'insertCompositionText') {
      return;
    }
    const chunk = ev.data ?? '';
    if (!chunk) {
      return;
    }
    if (/\D/.test(orderPhoneToEnglishDigits(chunk))) {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_DIGITS_ONLY_MSG;
    }
  }

  onLoginPhoneChange(val: string): void {
    const raw = val || '';
    const st = applyOrderPhoneInputState(raw);
    this.loginData.phone = st.cleaned;
    this.phoneLiveWarning = st.warning;
    
    if (this.inputPhone) {
      this.inputPhone.value = st.cleaned;
    }
  }

  /**
   * بعد نجاح المصادقة على المشروع الجديد: فحص isActive، ترحيل خدمات القديم (مرة واحدة)، ثم التوجيه.
   * `prefetchedLegacyServices` يُمرَّر عند مسار ترحيل الحساب لتفادي تسجيل دخول مكرر للمشروع القديم.
   */
  private async completeLoginAfterAuthenticated(
    loading: HTMLIonLoadingElement,
    password: string,
    prefetchedLegacyServices?: PrefetchedLegacyServiceRow[] | null
  ): Promise<void> {
    const userDoc = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'users', this.loginData.phone))
    );

    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData['isActive'] === false) {
        await runInInjectionContext(this.injector, () => signOut(this.auth));
        await loading.dismiss();
        this.showToast('عذراً، هذا الحساب معطل من قبل الإدارة');
        return;
      }
    }

    try {
      await runInInjectionContext(this.injector, () =>
        migrateLegacyServiceAdsOnce({
          firestore: this.firestore,
          auth: this.auth,
          orderPhone: this.loginData.phone,
          password,
          prefetchedLegacyServices: prefetchedLegacyServices ?? null,
        })
      );
    } catch (importErr) {
      console.warn('Legacy services import:', importErr);
    }

    await loading.dismiss();
    this.showToast('تم تسجيل الدخول بنجاح');
    this.navCtrl.navigateRoot('/tabs/my-account');
  }

  private mapPrimaryAuthError(code: string | undefined): string {
    let msg = 'خطأ في رقم الهاتف أو كلمة المرور';
    if (code === 'auth/user-not-found') msg = 'هذا الحساب غير موجود';
    if (code === 'auth/wrong-password') msg = 'كلمة المرور غير صحيحة';
    if (code === 'auth/invalid-credential') msg = 'بيانات الدخول غير صحيحة';
    return msg;
  }

  /** محاولة الدخول على الجديد فشلت لغياب المستخدم؛ نجرّب المشروع القديم ثم ننشئ حساباً على الجديد */
  private async tryLegacyMigrateAndSignIn(
    loading: HTMLIonLoadingElement,
    phone: string,
    systemEmail: string,
    legacyEmail: string,
    password: string
  ): Promise<void> {
    const legacyAuth = getLegacyFirebaseAuth();
    if (!legacyAuth) {
      await loading.dismiss();
      this.showToast(this.mapPrimaryAuthError('auth/user-not-found'));
      return;
    }

    try {
      const legacyCredential = await runInInjectionContext(this.injector, () =>
        signInWithEmailAndPassword(legacyAuth, legacyEmail, password)
      );
      const legacyUid = legacyCredential.user.uid;

      let legacyProfile: Record<string, unknown> | null = null;
      const legacyDb = getLegacyFirestore();
      if (legacyDb) {
        try {
          const legacyUserSnap = await legacyGetDoc(legacyDocRef(legacyDb, 'users', legacyUid));
          if (legacyUserSnap.exists()) {
            legacyProfile = legacyUserSnap.data() as Record<string, unknown>;
          }
        } catch (readErr) {
          console.warn('Legacy Firestore users read:', readErr);
        }
      }

      const rawPhone = legacyProfile?.['phoneNumber'];
      if (rawPhone != null && String(rawPhone).trim().length > 0) {
        const normalizedLegacy = legacyPhoneNumberToOrderPhone(String(rawPhone));
        if (!normalizedLegacy || normalizedLegacy !== phone) {
          await runInInjectionContext(this.injector, () => signOut(legacyAuth));
          await loading.dismiss();
          this.showToast('تأكد أن رقم الهاتف يطابق حسابك في التطبيق القديم');
          return;
        }
      }

      let prefetchedLegacyServices: PrefetchedLegacyServiceRow[] | null = null;
      if (legacyDb) {
        try {
          const svcQ = legacyQuery(
            legacyCollection(legacyDb, 'services'),
            legacyWhere('userId', '==', legacyUid)
          );
          const svcSnap = await legacyGetDocs(svcQ);
          prefetchedLegacyServices = svcSnap.docs.map((d) => ({
            id: d.id,
            data: d.data() as Record<string, unknown>,
          }));
        } catch (prefErr) {
          console.warn('Legacy services prefetch:', prefErr);
        }
      }

      await runInInjectionContext(this.injector, () => signOut(legacyAuth));

      try {
        const userCredential = await runInInjectionContext(this.injector, () =>
          createUserWithEmailAndPassword(this.auth, systemEmail, password)
        );
        const payload = buildMigratedUserFirestoreDoc(
          phone,
          systemEmail,
          userCredential.user.uid,
          legacyProfile
        );
        await runInInjectionContext(this.injector, () =>
          setDoc(doc(this.firestore, 'users', phone), payload)
        );
      } catch (migrateErr: any) {
        if (migrateErr?.code === 'auth/email-already-in-use') {
          const newCred = await runInInjectionContext(this.injector, () =>
            signInWithEmailAndPassword(this.auth, systemEmail, password)
          );
          const existingSnap = await runInInjectionContext(this.injector, () =>
            getDoc(doc(this.firestore, 'users', phone))
          );
          if (!existingSnap.exists()) {
            const payload = buildMigratedUserFirestoreDoc(
              phone,
              systemEmail,
              newCred.user.uid,
              legacyProfile
            );
            await runInInjectionContext(this.injector, () =>
              setDoc(doc(this.firestore, 'users', phone), payload)
            );
          }
        } else {
          throw migrateErr;
        }
      }

      await this.completeLoginAfterAuthenticated(loading, password, prefetchedLegacyServices);
    } catch (e) {
      await loading.dismiss();
      console.error('Legacy login / migrate:', e);
      this.showToast('بيانات الدخول غير صحيحة');
    }
  }

  // دالة تسجيل الدخول الفعلية
  async performLogin() {
    const phoneSt = applyOrderPhoneInputState(this.loginData.phone);
    this.loginData.phone = phoneSt.cleaned;
    this.phoneLiveWarning = phoneSt.warning;

    if (!this.loginData.phone || !this.loginData.password) {
      this.showToast('يرجى إدخال رقم الهاتف وكلمة المرور');
      return;
    }

    if (!isOrderPhoneValid(this.loginData.phone)) {
      this.showToast(ORDER_PHONE_INVALID_MSG);
      return;
    }

    const phone = this.loginData.phone;
    const password = this.loginData.password;
    const systemEmail = `${phone}@mota7.com`;
    const legacyEmail = toLegacyLoginEmail(phone);

    const loading = await this.loadingCtrl.create({
      message: 'جاري تسجيل الدخول...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      await runInInjectionContext(this.injector, () =>
        signInWithEmailAndPassword(this.auth, systemEmail, password)
      );
      await this.completeLoginAfterAuthenticated(loading, password);
    } catch (error: any) {
      console.error('Login Error:', error);
      const code = error?.code as string | undefined;

      const tryLegacy =
        getLegacyFirebaseAuth() &&
        (code === 'auth/user-not-found' || code === 'auth/invalid-credential');

      if (tryLegacy) {
        await this.tryLegacyMigrateAndSignIn(loading, phone, systemEmail, legacyEmail, password);
        return;
      }

      await loading.dismiss();
      this.showToast(this.mapPrimaryAuthError(code));
    }
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 3000,
      position: 'bottom',
      color: 'dark'
    });
    await toast.present();
  }

  forgotPassword() {
    const phoneNumber = '201220883999';
    const message = 'السلام عليكم .. نسيت كلمة السر ومحتاج اعمل إعادة تعيين لكلمة السر';
    const url = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }
}
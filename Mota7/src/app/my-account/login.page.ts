import { ChangeDetectorRef, Component, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { IonicModule, NavController, LoadingController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
// استيرادات الفيربيز للربط الفعلي
import { Auth, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore'; // أضفنا استيرادات الفايرستور
import { Mota7HeaderComponent } from '../top_header/header';
import {
  applyOrderPhoneInputState,
  isOrderPhoneValid,
  ORDER_PHONE_DIGITS_ONLY_MSG,
  ORDER_PHONE_INVALID_MSG,
  orderPhoneToEnglishDigits,
} from '../core/utils/egyptian-phone-order.util';
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
export class LoginPage {

  // حقن الخدمات الجديدة
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);

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

  // العودة لصفحة حسابي الشخصية وتفريغ الذاكرة
  goBack() {
    this.navCtrl.navigateRoot('/tabs/my-account');
  }

  // الانتقال لصفحة التسجيل مع جعلها هي الصفحة الأساسية الحالية
  goToRegister() {
    this.navCtrl.navigateRoot('/register');
  }

  onLoginPhoneKeyDown(ev: KeyboardEvent): void {
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
    this.cdr.detectChanges();
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
      this.cdr.detectChanges();
    }
  }

  onLoginPhoneInput(ev: Event): void {
    const detail = (ev as CustomEvent<{ value?: string }>).detail;
    const st = applyOrderPhoneInputState(detail?.value);
    this.loginData.phone = st.cleaned;
    this.phoneLiveWarning = st.warning;
    this.cdr.detectChanges();
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

    const loading = await this.loadingCtrl.create({
      message: 'جاري تسجيل الدخول...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      // تحويل رقم الهاتف للإيميل النظامي المستخدم في التسجيل
      const systemEmail = `${this.loginData.phone}@mota7.com`;

      const userCredential = await runInInjectionContext(this.injector, () =>
        signInWithEmailAndPassword(this.auth, systemEmail, this.loginData.password)
      );
      const user = userCredential.user;

      // 2. فحص حالة الحساب (isActive) من قاعدة البيانات قبل التحويل
      // نستخدم رقم الهاتف المدخل كمعرف للمستند كما اتفقنا
      const userDoc = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', this.loginData.phone))
      );

      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // إذا كان الحساب معطلاً (isActive === false)
        if (userData['isActive'] === false) {
          await runInInjectionContext(this.injector, () => signOut(this.auth));
          await loading.dismiss();
          this.showToast('عذراً، هذا الحساب معطل من قبل الإدارة');
          return; // التوقف عن إكمال الدخول
        }
      }

      // إذا كان الحساب نشطاً
      await loading.dismiss();
      this.showToast('تم تسجيل الدخول بنجاح');

      // التوجه لصفحة الملف الشخصي
      this.navCtrl.navigateRoot('/tabs/my-account');

    } catch (error: any) {
      await loading.dismiss();
      console.error('Login Error:', error);

      // رسائل خطأ واضحة للمستخدم
      let msg = 'خطأ في رقم الهاتف أو كلمة المرور';
      if (error.code === 'auth/user-not-found') msg = 'هذا الحساب غير موجود';
      if (error.code === 'auth/wrong-password') msg = 'كلمة المرور غير صحيحة';
      if (error.code === 'auth/invalid-credential') msg = 'بيانات الدخول غير صحيحة';
      
      this.showToast(msg);
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
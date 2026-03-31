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
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../core/utils/order-form-fields.util';
import { UserAccountStatusService } from './user-account-status.service';

@Component({
  selector: 'app-edit-profile',
  templateUrl: './edit-profile.page.html',
  styleUrls: ['./edit-profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class EditProfilePage implements OnInit, OnDestroy, ViewWillLeave {
  @ViewChild('inputFullName', { read: IonInput }) private inputFullName?: IonInput;

  private readonly fullNameMaxLen = 20;
  private cdr = inject(ChangeDetectorRef);
  private platform = inject(Platform);
  private hardwareBackSub?: Subscription;

  userData = {
    fullName: '',
    phone: '',
    personalEmail: '',
    city: '' 
  };

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
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      }
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

  changePasswordViaWA() {
    this.blurActiveFocus();
    const adminPhone = '201220883999';
    const message = `مرحبا .. اريد تغيير كلمة المرور الخاصة برقم ${this.userData.phone}`;
    const whatsappUrl = `whatsapp://send?phone=${adminPhone}&text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
            city: this.userData.city
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

  onCitySelectOpen(): void {
    this.blurActiveFocus();
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({ message: msg, duration: 2000, position: 'bottom', color: 'dark' });
    await toast.present();
  }
}
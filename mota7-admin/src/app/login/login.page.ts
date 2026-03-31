import { Component, inject, OnInit, Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule, Platform, AlertController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { Auth, signInWithEmailAndPassword } from '@angular/fire/auth';
import { FingerprintAIO } from '@awesome-cordova-plugins/fingerprint-aio/ngx';
import { readIonTextInputValueFromEvent } from '../core/utils/ion-text-input.util';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
  providers: [FingerprintAIO] 
})
export class LoginPage implements OnInit {
  email: string = '';
  pass: string = '';
  
  readonly ALLOWED_ADMINS = ['hossam@mota7.com', 'ibrahem@mota7.com'];

  private auth: Auth = inject(Auth);
  private injector = inject(Injector);
  private platform = inject(Platform);
  private faio = inject(FingerprintAIO);
  private alertCtrl = inject(AlertController);

  constructor(private router: Router) {}

  onAdminEmailInput(ev: Event): void {
    const v = readIonTextInputValueFromEvent(ev);
    if (this.email === v) {
      return;
    }
    this.email = v;
  }

  onAdminPassInput(ev: Event): void {
    const v = readIonTextInputValueFromEvent(ev);
    if (this.pass === v) {
      return;
    }
    this.pass = v;
  }

  async ngOnInit() {
    await this.platform.ready();
    // FingerprintAIO يعتمد على Cordova — غير متوفر في المتصفح
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    setTimeout(() => {
      this.checkBiometricLogin(true);
    }, 500);
  }

  async login() {
    try {
      const userEmail = this.email.trim();
      const userPass = this.pass.trim();

      const userCredential = await runInInjectionContext(this.injector, () =>
        signInWithEmailAndPassword(this.auth, userEmail, userPass)
      );

      if (userCredential.user) {
        if (this.ALLOWED_ADMINS.includes(userEmail.toLowerCase())) {
          localStorage.setItem('admin_mail', userEmail);
          localStorage.setItem('admin_pass', userPass);
        }

        (document.activeElement as HTMLElement).blur();
        this.router.navigate(['/dashboard']);
      }
    } catch (error: any) {
      const alert = await this.alertCtrl.create({
        header: 'خطأ',
        message: 'البيانات غير صحيحة يا بطل',
        buttons: ['تم']
      });
      await alert.present();
    }
  }

  async checkBiometricLogin(isAutoRun: boolean = false) {
    if (!Capacitor.isNativePlatform()) {
      if (!isAutoRun) {
        const alert = await this.alertCtrl.create({
          header: 'تنبيه',
          message: 'دخول البصمة متاح داخل تطبيق الجوال فقط. من المتصفح استخدم البريد وكلمة المرور.',
          buttons: ['تم'],
        });
        await alert.present();
      }
      return;
    }

    const savedMail = localStorage.getItem('admin_mail');
    const savedPass = localStorage.getItem('admin_pass');

    if (!savedMail || !savedPass) {
      if (!isAutoRun) {
        const alert = await this.alertCtrl.create({
          header: 'تنبيه',
          message: 'يجب تسجيل الدخول يدوياً لأول مرة لتفعيل البصمة',
          buttons: ['تم']
        });
        await alert.present();
      }
      return;
    }

    try {
      // التأكد من جاهزية البصمة
      await this.faio.isAvailable({ requireStrongBiometrics: false });
      
      // إظهار النافذة
      await this.faio.show({
        title: 'تسجيل دخول آمن',
        subtitle: 'استخدم البصمة للدخول السريع',
        description: 'لوحة تحكم متاح برو',
        disableBackup: true, 
      });

      const userCredential = await runInInjectionContext(this.injector, () =>
        signInWithEmailAndPassword(this.auth, savedMail, savedPass)
      );
      if (userCredential.user) {
        this.router.navigate(['/dashboard']);
      }

    } catch {
      if (!isAutoRun) {
        const alert = await this.alertCtrl.create({
          header: 'عذراً',
          message: 'البصمة غير متوفرة حالياً أو تم إلغاؤها',
          buttons: ['تم'],
        });
        await alert.present();
      }
    }
  }
}
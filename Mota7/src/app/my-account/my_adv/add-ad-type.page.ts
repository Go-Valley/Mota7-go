import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ModalController,
  AlertController,
  NavController,
  Platform,
  ViewWillEnter,
} from '@ionic/angular';
import type { Subscription } from 'rxjs';
import { HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY } from '../../core/utils/hardware-back-my-account.util';
import { getDeliveryAdCurrentLocation } from '../../core/utils/delivery-ad-geolocation.util';
import { addIcons } from 'ionicons';
import { 
  storefrontOutline, cartOutline, 
  carOutline, schoolOutline, constructOutline, 
  chevronBackOutline, chevronForwardOutline,
  locationOutline // أضفت أيقونة الموقع لاستخدامها لاحقاً
} from 'ionicons/icons';

// استيراد المكونات
import { StoreFormComponent } from './components/store-form/store-form.component';
import { ProductFormComponent } from './components/product-form/product-form.component';
import { OtherServicesFormComponent } from './components/other-services-form/other-services-form.component';
import { EducationFormComponent } from './components/education-form/education-form.component';
import { DeliveryFormComponent } from './components/delivery-form/delivery-form.component';
import { Mota7HeaderComponent } from '../../top_header/header';
import { UserAccountStatusService } from '../user-account-status.service';

@Component({
  selector: 'app-add-ad-type',
  templateUrl: './add-ad-type.page.html',
  styleUrls: ['./add-ad-type.page.scss'],
  standalone: true,
  imports: [IonicModule,Mota7HeaderComponent, CommonModule]
})
export class AddAdTypePage implements ViewWillEnter, OnDestroy {
  private acct = inject(UserAccountStatusService);
  private platform = inject(Platform);
  private hardwareBackSub?: Subscription;

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private navCtrl: NavController
  ) {
    // تسجيل الأيقونات المطلوبة بشكل صحيح
    addIcons({ 
      'storefront-outline': storefrontOutline, 
      'cart-outline': cartOutline, 
      'car-outline': carOutline, 
      'school-outline': schoolOutline, 
      'construct-outline': constructOutline, 
      'chevron-back-outline': chevronBackOutline, 
      'chevron-forward-outline': chevronForwardOutline,
      'location-outline': locationOutline
    });
  }

  ngOnInit(): void {
    this.hardwareBackSub = this.platform.backButton.subscribeWithPriority(
      HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY,
      () => void this.handlePageBack()
    );
  }

  ngOnDestroy(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = undefined;
  }

  ionViewWillEnter(): void {
    if (!this.acct.accountUsable()) {
      void this.navCtrl.navigateRoot('/login');
    }
  }

  goBack(): void {
    void this.handlePageBack();
  }

  /**
   * زر الرجوع بالجهاز / الهيدر: يغلق مودال النوع إن وُجد، وإلا يفرّغ من المكدس (مثلاً من «إدارة إعلاناتي»)،
   * وإن لم يوجد مكدس ننتقل لتبويب «حسابي» (مسار مودال «نشر إعلان» من الطلب).
   */
  private async handlePageBack(): Promise<void> {
    try {
      const top = await this.modalCtrl.getTop();
      if (top) {
        await top.dismiss();
        return;
      }
    } catch {
      /* نكمل للتنقل */
    }
    const popped = await this.navCtrl.pop();
    if (!popped) {
      void this.navCtrl.navigateRoot('/tabs/my-account', { animated: true });
    }
  }

  async selectType(type: string) {
    if (!this.acct.accountUsable()) {
      void this.navCtrl.navigateRoot('/login');
      return;
    }
    let component: any;

    switch (type) {
      case 'store': component = StoreFormComponent; break;
      case 'product': component = ProductFormComponent; break;
      case 'other': component = OtherServicesFormComponent; break;
      case 'education': component = EducationFormComponent; break;
      case 'delivery': component = DeliveryFormComponent; break;
    }

    if (component) {
      /** يمنع تكديس عدة تنبيهات عند عدة استدعاءات متزامنة لـ dismiss (زر الرجوع بالجهاز) */
      let exitConfirmPending: Promise<boolean> | null = null;

      const modal = await this.modalCtrl.create({
        component: component,
        initialBreakpoint: 0.95,
        breakpoints: [0, 0.95],
        handle: true,
        // طلب صلاحية/قراءة الموقع فقط لإعلان التوصيل — عند الضغط على زر تحديد الموقع داخل النموذج
        componentProps:
          type === 'delivery'
            ? { locationFunc: () => getDeliveryAdCurrentLocation() }
            : {},
        canDismiss: async (_data, role) => {
          if (role === 'confirm') return true;
          if (exitConfirmPending) {
            return exitConfirmPending;
          }
          exitConfirmPending = (async () => {
            try {
              const alert = await this.alertCtrl.create({
                header: 'تأكيد الخروج',
                message: 'هل أنت متأكد؟ سيتم فقدان جميع البيانات المدخلة.',
                mode: 'ios',
                buttons: [
                  { text: 'بقاء', role: 'cancel' },
                  { text: 'خروج', role: 'confirm' }
                ]
              });
              await alert.present();
              const { role: alertRole } = await alert.onDidDismiss();
              return alertRole === 'confirm';
            } finally {
              exitConfirmPending = null;
            }
          })();
          return exitConfirmPending;
        }
      });
      return await modal.present();
    }
  }
}
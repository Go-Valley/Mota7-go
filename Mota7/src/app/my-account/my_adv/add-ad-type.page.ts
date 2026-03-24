import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, AlertController, NavController, ViewWillEnter } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Mota7Location } from '../../plugins/mota7-location.plugin';
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
export class AddAdTypePage implements ViewWillEnter {
  private acct = inject(UserAccountStatusService);

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

  ionViewWillEnter(): void {
    if (!this.acct.accountUsable()) {
      void this.navCtrl.navigateRoot('/login');
    }
  }

  goBack() {
    this.navCtrl.back();
  }

  // هذه الدالة ستمرر للمكونات الفرعية (Modals) لتشغيل الـ GPS من داخلها
  async getCurrentLocation() {
    try {
      if (Capacitor.getPlatform() === 'android') {
        try {
          await Mota7Location.requestLocationAccess();
        } catch (e: unknown) {
          const m = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
          if (m.includes('denied') || m.includes('location permission denied')) {
            alert('يرجى منح صلاحية الموقع من إعدادات التطبيق ثم المحاولة مرة أخرى.');
            return null;
          }
        }
      }

      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        await Geolocation.requestPermissions();
      }
  
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        ...(Capacitor.getPlatform() !== 'web'
          ? { enableLocationFallback: true, timeout: 30000 }
          : {})
      });
  
      const lat = coordinates.coords.latitude;
      const lng = coordinates.coords.longitude;
  
      return { lat, lng }; // نعيد الإحداثيات للمكون الذي طلبها
      
    } catch (error) {
      console.error('خطأ في تحديد الموقع:', error);
      alert('عفواً، تأكد من تفعيل الـ GPS في هاتفك');
      return null;
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
      const modal = await this.modalCtrl.create({
        component: component,
        initialBreakpoint: 0.95,
        breakpoints: [0, 0.95],
        handle: true,
        // تمرير دالة الموقع للمكون لكي يستخدمها زرار "تحديد الموقع" هناك
        componentProps: {
          locationFunc: () => this.getCurrentLocation()
        },
        canDismiss: async (data, role) => {
          if (role === 'confirm') return true;
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
        }
      });
      return await modal.present();
    }
  }
}
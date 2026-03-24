import { Component, OnInit, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  locationOutline, checkmarkCircle, call, logoWhatsapp, 
  timeOutline, shieldCheckmark, carOutline, bicycleOutline, 
  busOutline, airplaneOutline, shieldCheckmarkOutline, ellipsisVerticalOutline,
  calendarOutline, keyOutline, checkmarkDoneCircle, closeCircle
} from 'ionicons/icons';
import { DELIVERY_CATEGORY } from '../../core/constants/delivery-data';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-delivery-card',
  templateUrl: './delivery.html',
  styleUrls: ['./delivery.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class DeliveryCard implements OnInit {
  @Input() ad: any;
  @Output() manage = new EventEmitter<any>();

  private alertCtrl = inject(AlertController);
  private firestore = inject(Firestore);
  private toastCtrl = inject(ToastController);

  constructor() {
    addIcons({ 
      locationOutline, checkmarkCircle, call, logoWhatsapp, 
      timeOutline, shieldCheckmark, carOutline, bicycleOutline, 
      busOutline, airplaneOutline, shieldCheckmarkOutline, ellipsisVerticalOutline,
      calendarOutline, keyOutline, checkmarkDoneCircle, closeCircle
    });
  }

  ngOnInit() {}

  // تعديل دالة الإدارة لتوحيد مسميات الهاتف والاسم للوحة التحكم
  onManage(event: Event) {
    event.stopPropagation();
    if (this.ad) {
      const phoneVal = this.ad.details?.whatsapp_phone || this.ad.owner_phone || '';
      const nameVal = this.ad.details?.driver_name || this.ad.owner_name || 'سائق متاح';

      const adForManage = {
        ...this.ad,
        owner_name: nameVal,
        owner_phone: phoneVal,
        phone: phoneVal, // مسمى إضافي لضمان التوافق مع الأدمن
        whatsapp_phone: phoneVal,
        city: this.ad.city
      };
      this.manage.emit(adForManage);
    }
  }

  // إضافة دالة الاتصال والواتساب
  contact(type: 'call' | 'whatsapp', event: Event) {
    event.stopPropagation();
    const phone = this.ad.details?.whatsapp_phone || this.ad.owner_phone;
    if (!phone) return;

    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else {
      const message = encodeURIComponent(`السلام عليكم .. بتواصل مع حضرتك بخصوص اعلانك (${this.getCategoryName(this.ad.category_id)})`);
      window.open(`https://wa.me/+2${phone}?text=${message}`, '_system');
    }
  }

  getCategoryName(categoryId: string): string {
    const item = DELIVERY_CATEGORY.items.find((i: any) => i.id === categoryId);
    return item ? item.nameAr : 'خدمة نقل';
  }

  getCategoryIcon(categoryId: string): string {
    const category = DELIVERY_CATEGORY.items.find((i: any) => i.id === categoryId);
    if (!category) return 'car-outline';
    return category.icon === 'bicycle' ? 'bicycle-outline' : 
           category.icon === 'bus' ? 'bus-outline' : 'car-outline';
  }

  async onSetExpiry(event: Event) {
    event.stopPropagation();
    
    const currentExpiry = this.ad.expiry_date?.toDate ? this.ad.expiry_date.toDate() : new Date();
    const minDate = new Date().toISOString().split('T')[0];

    const alert = await this.alertCtrl.create({
      header: 'تعديل تاريخ الانتهاء',
      mode: 'ios',
      inputs: [
        {
          name: 'expiry_date',
          type: 'date',
          value: currentExpiry.toISOString().split('T')[0],
          min: minDate
        }
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حفظ',
          handler: async (data) => {
            if (!data.expiry_date) return;
            
            try {
              const newDate = new Date(data.expiry_date);
              const adId = this.ad.ad_id || this.ad.id;
              const adRef = doc(this.firestore, 'ads', adId);
              
              const updateData: any = { expiry_date: newDate };
              
              if (this.ad.status === 'expired' && newDate > new Date()) {
                updateData.status = 'active';
              }

              await updateDoc(adRef, updateData);
              
              this.ad.expiry_date = { toDate: () => newDate };
              if (updateData.status) this.ad.status = updateData.status;

              const toast = await this.toastCtrl.create({
                message: 'تم تحديث تاريخ الانتهاء بنجاح',
                duration: 2000,
                color: 'success',
                mode: 'ios'
              });
              await toast.present();
            } catch (error) {
              console.error('Error updating expiry date:', error);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async editAd() {
    if (this.ad) {
      this.manage.emit({
        action: 'edit',
        ad: this.ad
      });
    }
  }
}
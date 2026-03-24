import { Component, Input, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  logoWhatsapp, call, checkmarkCircle, ribbon, 
  shieldCheckmark, ellipsisVerticalOutline, chevronDownOutline, chevronUpOutline,
  calendarOutline
} from 'ionicons/icons';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-store-card',
  templateUrl: './store.html',
  styleUrls: ['./store.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class StoreCard implements OnInit {
  @Input() ad: any;
  @Output() manage = new EventEmitter<any>();
  
  showProducts: boolean = false;
  private alertCtrl = inject(AlertController);
  private firestore = inject(Firestore);
  private toastCtrl = inject(ToastController);

  constructor() {
    addIcons({
      logoWhatsapp, call, checkmarkCircle, ribbon, 
      shieldCheckmark, ellipsisVerticalOutline,
      chevronDownOutline, chevronUpOutline,
      calendarOutline
    });
  }

  ngOnInit() {}

  // دالة التواصل عبر الاتصال أو الواتساب
  contact(type: 'call' | 'whatsapp', event: Event) {
    event.stopPropagation();
    const phone = this.ad.owner_phone || this.ad.details?.phone;
    if (!phone) return;

    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else {
      const adName = this.ad.details?.store_name || 'المتجر';
      const message = encodeURIComponent(`السلام عليكم .. بتواصل مع حضرتك بخصوص اعلانك (${adName})`);
      window.open(`https://wa.me/+2${phone}?text=${message}`, '_system');
    }
  }

  // دالة فتح بيانات المستخدم (حل مشكلة التضارب مع التاريخ)
  openUserProfile(event: Event) {
    event.stopPropagation();
    event.stopImmediatePropagation(); // ضمان عدم تسرب الحدث للعناصر الأب
    if (this.ad) {
      this.manage.emit({ action: 'view_user', ad: this.ad });
    }
  }

  async editExpiry(event: Event) {
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
              const adRef = doc(this.firestore, 'ads', this.ad.ad_id || this.ad.id);
              
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
              console.error(error);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  toggleProducts(event: Event) {
    event.stopPropagation();
    this.showProducts = !this.showProducts;
  }

  onManage(event: Event) {
    event.stopPropagation();
    this.manage.emit(this.ad);
  }
}
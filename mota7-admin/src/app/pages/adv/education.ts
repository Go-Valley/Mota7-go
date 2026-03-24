import { Component, OnInit, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  locationOutline, checkmarkCircle, call, logoWhatsapp, alertCircleOutline,
  schoolOutline, bookOutline, checkmarkDoneCircle, closeCircle,
  shieldCheckmark, ellipsisVerticalOutline, personOutline, calendarOutline
} from 'ionicons/icons';
import { EDUCATION_CATEGORY } from '../../core/constants/educational-data';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';

@Component({
  selector: 'app-education-card',
  templateUrl: './education.html',
  styleUrls: ['./education.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class EducationCard implements OnInit {
  @Input() ad: any;
  @Output() manage = new EventEmitter<any>();

  private alertCtrl = inject(AlertController);
  private firestore = inject(Firestore);
  private toastCtrl = inject(ToastController);

  constructor() {
    addIcons({
      locationOutline, checkmarkCircle, call, logoWhatsapp, alertCircleOutline,
      schoolOutline, bookOutline, checkmarkDoneCircle, closeCircle,
      shieldCheckmark, ellipsisVerticalOutline, personOutline, calendarOutline
    });
  }

  ngOnInit() {}

  // دالة التواصل عبر الاتصال أو الواتساب
  contact(type: 'call' | 'whatsapp', event: Event) {
    event.stopPropagation();
    const phone = this.ad.details?.whatsapp_phone || this.ad.owner_phone;
    if (!phone) return;

    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else {
      const adTitle = this.ad.details?.subject || this.getStageName(this.ad.category_id);
      const msg = `السلام عليكم.. بتواصل مع حضرتك بخصوص إعلانك على تطبيق متاح (${adTitle})`;
      openWhatsappNative(phone, msg);
    }
  }

  // توحيد بيانات الإدارة لضمان عمل أزرار لوحة التحكم
  onManage(event: Event) {
    event.stopPropagation();
    if (this.ad) {
      const phoneVal = this.ad.details?.whatsapp_phone || this.ad.owner_phone || '';
      const nameVal = this.ad.details?.teacher_name || this.ad.owner_name || 'معلم متاح';
      
      const adForManage = {
        ...this.ad,
        owner_name: nameVal,
        owner_phone: phoneVal,
        phone: phoneVal,
        whatsapp_phone: phoneVal,
        city: this.ad.city
      };
      this.manage.emit(adForManage);
    }
  }

  getStageName(stageId: string): string {
    if (!stageId) return 'خدمة تعليمية';
    const stage = EDUCATION_CATEGORY.items.find((item: any) => item.id === stageId);
    return stage ? stage.nameAr : 'خدمة تعليمية';
  }

  getCategoryIcon(id: string): string {
    switch (id) {
      case 'kindergarten': return 'school-outline';
      case 'primary': return 'book-outline';
      case 'preparatory': return 'school-outline';
      case 'secondary': return 'book-outline';
      default: return 'school-outline';
    }
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

  async openUserProfile(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation(); // هذا يمنع أي حدث آخر من التنفيذ نهائياً على هذا العنصر
  
  if (this.ad) {
    this.manage.emit({ action: 'view_user', ad: this.ad });
  }
}
}
import { Component, OnInit, Input, Output, EventEmitter, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  trashOutline, createOutline, locationOutline, checkmarkCircle, 
  call, logoWhatsapp, alertCircleOutline, carOutline, 
  airplaneOutline, timeOutline, shieldCheckmarkOutline, shieldCheckmark,
  bicycleOutline, busOutline
} from 'ionicons/icons';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { DELIVERY_CATEGORY } from '../../../../core/constants/delivery-data';
import { DeliveryFormComponent } from './delivery-form.component';
import { VerificationModalComponent } from '../verification-modal.component';

@Component({
  selector: 'app-delivery-card',
  templateUrl: './delivery-card.component.html',
  styleUrls: ['./delivery-card.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class DeliveryCardComponent implements OnInit {

  @Input() ad: any;
  @Output() edit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();
  @Output() statusToggle = new EventEmitter<any>(); 

  private alertCtrl = inject(AlertController);
  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private injector = inject(EnvironmentInjector);

  constructor() {
    addIcons({ 
      trashOutline, createOutline, locationOutline, checkmarkCircle, 
      call, logoWhatsapp, alertCircleOutline, carOutline, 
      airplaneOutline, timeOutline, shieldCheckmarkOutline, shieldCheckmark,
      bicycleOutline, busOutline
    });
  }

  ngOnInit() {}

  getCategoryName(categoryId: string): string {
    const category = DELIVERY_CATEGORY.items.find(item => item.id === categoryId);
    return category ? category.nameAr : 'خدمة توصيل';
  }

  getCategoryIcon(categoryId: string): string {
    const category = DELIVERY_CATEGORY.items.find(item => item.id === categoryId);
    if (!category) return 'car-outline';
    if (category.icon === 'bicycle') return 'bicycle-outline';
    if (category.icon === 'bus') return 'bus-outline';
    return 'car-outline';
  }

  async toggleStatus(field: string) {
    if (!this.ad.id || !this.ad.details) return;
    const newValue = !this.ad.details[field];
    this.ad.details[field] = newValue;
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, `ads/${this.ad.id}`), { [`details.${field}`]: newValue })
      );
      this.statusToggle.emit({ id: this.ad.id, field: field, value: newValue });
    } catch (error) {
      console.error("error:", error);
      this.ad.details[field] = !newValue;
    }
  }

  contactAction(type: 'whatsapp' | 'call', event: Event) {
    event.stopPropagation();
    const phone = this.ad?.owner_phone;
    if (!phone) return;
    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else if (type === 'whatsapp') {
      const vehicleName = this.getCategoryName(this.ad.category_id);
      const msg = encodeURIComponent(`السلام عليكم .. محتاج اطلب خدمة نقل وتوصيل (${vehicleName})`);
      const waPhone = this.ad.details?.whatsapp_phone || this.ad.owner_phone;
      window.open(`whatsapp://send?phone=${waPhone}&text=${msg}`, '_system');
    }
  }

  contactAdmin(type: 'pending' | 'rejected' | 'expired', event: Event) {
    event.stopPropagation();
    const adminPhone = '01220883999';
    const deliveryKey = this.ad?.delivery_match_key || this.ad?.category_id || '';
    const ownerPhone = this.ad?.owner_phone || '';

    if (type === 'pending') {
      const msg = encodeURIComponent(`السلام عليكم .. برجاء تفعيل اعلان (${deliveryKey}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    if (type === 'rejected') {
      const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب رفض اعلاني : (${deliveryKey}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب انتهاء اعلاني : (${deliveryKey}) لرقم (${ownerPhone})`);
    window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
  }

  async onEdit() {
    const modal = await this.modalCtrl.create({
      component: DeliveryFormComponent,
      componentProps: {
        editAdData: this.ad 
      },
      mode: 'ios',
      cssClass: 'mota7-modal-style'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data && data.submitted) {
      this.refresh.emit();
    }
  }

 async onDelete() {
    this.delete.emit(this.ad.id || this.ad.ad_id);
  }

  // طلب توثيق الإعلان
  async requestVerification(verificationType: 'gold' | 'blue') {
    const adminPhone = '01220883999';
    const vehicleName = this.getCategoryName(this.ad.category_id);
    const ownerPhone = this.ad?.owner_phone || '';
    
    const verificationName = verificationType === 'gold' ? 'توثيق ذهبي' : 'توثيق أزرق';
    
    const message = `السلام عليكم .. محتاج اوثق اعلاني "${verificationName}" (${vehicleName}) - لرقم (${ownerPhone})`;
    const encodedMessage = encodeURIComponent(message);
    
    window.open(`whatsapp://send?phone=${adminPhone}&text=${encodedMessage}`, '_system');
  }

  // عرض شاشة التوثيق المنبثقة
  async showVerificationModal() {
    const modal = await this.modalCtrl.create({
      component: VerificationModalComponent,
      componentProps: {
        ad: this.ad,
        adType: 'delivery'
      },
      cssClass: 'verification-modal',
      breakpoints: [0, 1.1],
      initialBreakpoint: 1.1
    });

    await modal.present();
  }
}

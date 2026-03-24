import { Component, OnInit, Input, inject, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  locationOutline, checkmarkCircle, call, logoWhatsapp, 
  timeOutline, shieldCheckmark, carOutline, bicycleOutline, 
  busOutline, airplaneOutline, shieldCheckmarkOutline, keyOutline
} from 'ionicons/icons';
import { DELIVERY_CATEGORY } from '../../core/constants/delivery-data';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import { Firestore } from '@angular/fire/firestore';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';

@Component({
  selector: 'app-delivery-home-card',
  templateUrl: './delivery-home-card.component.html',
  styleUrls: ['./delivery-home-card.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class DeliveryHomeCardComponent implements OnInit {
  @Input() ad: any;
  private analytics = inject(Analytics, { optional: true });
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  constructor() {
    addIcons({ 
      locationOutline, checkmarkCircle, call, logoWhatsapp, 
      timeOutline, shieldCheckmark, carOutline, bicycleOutline, 
      busOutline, airplaneOutline, shieldCheckmarkOutline, keyOutline
    });
  }

  ngOnInit() {}

  getCategoryName(id: string): string {
    const item = DELIVERY_CATEGORY.items.find((i: { id: string; nameAr: string }) => i.id === id);
    return item ? item.nameAr : 'خدمة نقل';
  }

  getCategoryIcon(categoryId: string): string {
    const category = DELIVERY_CATEGORY.items.find((i: { id: string; icon: string }) => i.id === categoryId);
    if (!category) return 'car-outline';
    if (category.icon === 'bicycle') return 'bicycle-outline';
    if (category.icon === 'bus') return 'bus-outline';
    return 'car-outline';
  }

  /** سيارة خاصة أو تاكسي — زر السفر */
  get showTravelChip(): boolean {
    const id = this.ad?.category_id;
    return (id === 'private-car' || id === 'taxi') && !!this.ad?.details?.can_travel;
  }

  /** سيارة خاصة — زر الإيجار (مطابق لبطاقة الإدارة) */
  get showRentChip(): boolean {
    return this.ad?.category_id === 'private-car' && !!this.ad?.details?.for_rent;
  }

  /** صفّان: المدينة+متاح الآن | السفر+إيجار */
  get useTwoRowChipLayout(): boolean {
    return this.showTravelChip && this.showRentChip;
  }

  async trackContactClick(ad: any, type: 'call' | 'whatsapp') {
    const adId = ad?.id || ad?.ad_id;
    if (!adId) return;

    try {
      if (this.analytics) {
        logEvent(this.analytics, 'ad_contact_click', {
          ad_id: adId,
          ad_title: ad.title || ad.store_name,
          contact_type: type,
        });
      }
      await commitAdContactClickFirestore(this.firestore, this.injector, ad, type);
    } catch (error) {
      console.error('حدث خطأ أثناء تحديث سجلات النقرات:', error);
    }
  }

  async contactAction(type: 'whatsapp' | 'call', event: Event) {
    event.stopPropagation();
    const phone = this.ad.owner_phone;
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
}

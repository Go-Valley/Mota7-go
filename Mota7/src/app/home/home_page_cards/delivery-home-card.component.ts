import { Component, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, Input, inject, EnvironmentInjector } from '@angular/core';
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
import { AdImpressionTrackDirective } from '../shared/ad-impression-track.directive';
import { AdCardEngagementRowComponent } from '../shared/ad-card-engagement-row.component';

@Component({
  selector: 'app-delivery-home-card',
  templateUrl: './delivery-home-card.component.html',
  styleUrls: ['./delivery-home-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonicModule, CommonModule, AdImpressionTrackDirective, AdCardEngagementRowComponent]
})
export class DeliveryHomeCardComponent implements OnInit, OnChanges {
  @Input() ad: any;
  private analytics = inject(Analytics, { optional: true });
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  /** قيم مشتقّة محسوبة مرّة واحدة (تجنّب استدعاء الدوال في القالب لكل دورة كشف) */
  categoryName: string = 'خدمة نقل';
  categoryIcon: string = 'car-outline';
  showTravelChip = false;
  showRentChip = false;
  useTwoRowChipLayout = false;

  constructor() {
    addIcons({ 
      locationOutline, checkmarkCircle, call, logoWhatsapp, 
      timeOutline, shieldCheckmark, carOutline, bicycleOutline, 
      busOutline, airplaneOutline, shieldCheckmarkOutline, keyOutline
    });
  }

  ngOnInit() {
    this.computeDerived();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ad']) {
      this.computeDerived();
    }
  }

  private computeDerived(): void {
    const id = this.ad?.category_id;
    this.categoryName = this.getCategoryName(id);
    this.categoryIcon = this.getCategoryIcon(id);
    this.showTravelChip = (id === 'private-car' || id === 'taxi') && !!this.ad?.details?.can_travel;
    this.showRentChip = id === 'private-car' && !!this.ad?.details?.for_rent;
    this.useTwoRowChipLayout = this.showTravelChip && this.showRentChip;
  }

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

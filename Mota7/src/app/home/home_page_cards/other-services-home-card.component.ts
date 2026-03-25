import { Component, OnInit, Input, inject, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  call,
  logoWhatsapp,
  checkmarkCircle,
  shieldCheckmark,
  checkmarkDoneCircle,
  closeCircle,
  hammer,
  flash,
  water,
  colorPalette,
  construct,
  business,
  grid,
  card,
  tv,
  flame,
  carSport,
  megaphone,
  cube,
  cog
} from 'ionicons/icons';
import { OTHER_SERVICES_DATA } from '../../core/constants/other-services-data';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import { Firestore } from '@angular/fire/firestore';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';
import { AdImpressionTrackDirective } from '../shared/ad-impression-track.directive';
import { AdCardEngagementRowComponent } from '../shared/ad-card-engagement-row.component';

@Component({
  selector: 'app-other-services-home-card',
  templateUrl: './other-services-home-card.component.html',
  styleUrls: ['./other-services-home-card.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, AdImpressionTrackDirective, AdCardEngagementRowComponent]
})
export class OtherServicesHomeCardComponent implements OnInit {
  @Input() ad: any;
  private analytics = inject(Analytics, { optional: true });
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  constructor() {
    addIcons({
      locationOutline,
      call,
      logoWhatsapp,
      checkmarkCircle,
      shieldCheckmark,
      checkmarkDoneCircle,
      closeCircle,
      hammer,
      flash,
      water,
      colorPalette,
      construct,
      business,
      grid,
      card,
      tv,
      flame,
      carSport,
      megaphone,
      cube,
      cog
    });
  }

  ngOnInit() {}

  getCategoryName(id: string): string {
    if (!id) return 'خدمة أخرى';
    const cat = OTHER_SERVICES_DATA.items.find((c: any) => c.id === id);
    return cat ? cat.nameAr : 'خدمة أخرى';
  }

  getCategoryIcon(id: string): string {
    if (!id) return 'construct';
    return OTHER_SERVICES_DATA.icon || 'construct';
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
    const phone = this.ad?.owner_phone;
    if (!phone) return;

    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else if (type === 'whatsapp') {
      const serviceName = this.getCategoryName(this.ad.category_id);
      const msg = encodeURIComponent(`السلام عليكم .. محتاج اطلب خدمة (${serviceName})`);
      const waPhone = this.ad.details?.whatsapp_phone || phone;
      window.open(`whatsapp://send?phone=${waPhone}&text=${msg}`, '_system');
    }
  }
}

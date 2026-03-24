import { Component, OnInit, Input, inject, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  checkmarkCircle,
  call,
  logoWhatsapp,
  alertCircleOutline,
  schoolOutline,
  bookOutline,
  checkmarkDoneCircle,
  closeCircle,
  shieldCheckmark
} from 'ionicons/icons';
import { EDUCATION_CATEGORY } from '../../core/constants/educational-data';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import { Firestore } from '@angular/fire/firestore';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';

@Component({
  selector: 'app-education-home-card',
  templateUrl: './education-home-card.component.html',
  styleUrls: ['./education-home-card.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class EducationHomeCardComponent implements OnInit {
  @Input() ad: any;
  private analytics = inject(Analytics, { optional: true });
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  constructor() {
    addIcons({
      locationOutline,
      checkmarkCircle,
      call,
      logoWhatsapp,
      alertCircleOutline,
      schoolOutline,
      bookOutline,
      checkmarkDoneCircle,
      closeCircle,
      shieldCheckmark
    });
  }

  ngOnInit() {}

  getStageName(stageId: string): string {
    if (!stageId) return 'خدمة تعليمية';
    const stage = EDUCATION_CATEGORY.items.find((item: { id: string }) => item.id === stageId);
    return stage ? (stage as { nameAr: string }).nameAr : 'خدمة تعليمية';
  }

  // هذه الدالة هي التي كانت تنقص الكود السابق وتسبب خطأ الـ HTML
  getCategoryIcon(id: string): string {
    switch (id) {
      case 'kindergarten':
        return 'school-outline';
      case 'primary':
        return 'book-outline';
      case 'preparatory':
        return 'school-outline';
      case 'secondary':
        return 'book-outline';
      default:
        return 'school-outline';
    }
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
    } else {
      const stageName = this.getStageName(this.ad.category_id);
      const subject = this.ad.details?.subject || '';
      const msg = encodeURIComponent(
        `السلام عليكم .. محتاج اطلب خدمة تعليمية (${stageName} - مادة ${subject})`
      );
      window.open(`whatsapp://send?phone=${phone}&text=${msg}`, '_system');
    }
  }
}

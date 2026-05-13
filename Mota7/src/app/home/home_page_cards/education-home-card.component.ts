import { Component, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, Input, inject, EnvironmentInjector } from '@angular/core';
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
import { AdImpressionTrackDirective } from '../shared/ad-impression-track.directive';
import { AdCardEngagementRowComponent } from '../shared/ad-card-engagement-row.component';
import { VerificationBadgeComponent } from '../../shared/verification-badge/verification-badge.component';
import { formatAdCoverageDisplay } from 'src/app/core/utils/governorate-city-display.util';

@Component({
  selector: 'app-education-home-card',
  templateUrl: './education-home-card.component.html',
  styleUrls: ['./education-home-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonicModule,
    CommonModule,
    AdImpressionTrackDirective,
    AdCardEngagementRowComponent,
    VerificationBadgeComponent,
  ],
})
export class EducationHomeCardComponent implements OnInit, OnChanges {
  @Input() ad: any;
  private analytics = inject(Analytics, { optional: true });
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  /** قيم مشتقّة محسوبة مرّة واحدة لتفادي إعادة الحساب في كل دورة كشف تغيّرات */
  stageName: string = 'خدمة تعليمية';
  categoryIcon: string = 'school-outline';

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
    this.stageName = this.getStageName(id);
    this.categoryIcon = this.getCategoryIcon(id);
  }

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

  coverageDisplay(ad: any): string {
    return formatAdCoverageDisplay(ad ?? {});
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

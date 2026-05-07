import { Component, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef, Input, inject, EnvironmentInjector, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import { Firestore } from '@angular/fire/firestore';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';
import { AdImpressionTrackDirective } from '../shared/ad-impression-track.directive';
import { AdCardEngagementRowComponent } from '../shared/ad-card-engagement-row.component';
import { AppTaxonomyService } from '../../core/services/app-taxonomy.service';
import { VerificationBadgeComponent } from '../../shared/verification-badge/verification-badge.component';
import {
  OtherCategoryItem,
  resolveOtherCategoryIcon,
  resolveOtherCategoryNameAr,
} from '../../core/utils/other-category-display.util';

@Component({
  selector: 'app-other-services-home-card',
  templateUrl: './other-services-home-card.component.html',
  styleUrls: ['./other-services-home-card.component.scss'],
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
export class OtherServicesHomeCardComponent implements OnInit, OnChanges {
  @Input() ad: any;
  private analytics = inject(Analytics, { optional: true });
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /** قائمة الفروع الديناميكية (Categories/other_services) — تتحدّث مباشرة عند تغيّر Firestore */
  private dynamicOtherItems: OtherCategoryItem[] = [];

  /** قيم محسوبة مرّة واحدة لتفادي إعادة الحساب على كل دورة كشف (يُحسِّن السكرول كثيراً) */
  categoryName: string = '';
  categoryIcon: string = '';

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

  ngOnInit() {
    this.taxonomy.bundle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => {
        this.dynamicOtherItems = (b?.otherItems ?? []) as OtherCategoryItem[];
        this.computeDerived();
        this.cdr.markForCheck();
      });
    this.computeDerived();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ad']) {
      this.computeDerived();
    }
  }

  private computeDerived(): void {
    this.categoryName = resolveOtherCategoryNameAr(this.ad, this.dynamicOtherItems);
    this.categoryIcon = resolveOtherCategoryIcon(this.ad, this.dynamicOtherItems);
  }

  getCategoryName(_id?: string): string {
    return this.categoryName;
  }

  getCategoryIcon(_id?: string): string {
    return this.categoryIcon;
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
      const serviceName = this.getCategoryName();
      const msg = encodeURIComponent(`السلام عليكم .. محتاج اطلب خدمة (${serviceName})`);
      const waPhone = this.ad.details?.whatsapp_phone || phone;
      window.open(`whatsapp://send?phone=${waPhone}&text=${msg}`, '_system');
    }
  }
}

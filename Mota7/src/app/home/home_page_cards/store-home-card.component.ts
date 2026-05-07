import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController } from '@ionic/angular';
import { cloudinaryListThumbnailUrl } from 'src/app/core/utils/cloudinary-list-image.util';
import { addIcons } from 'ionicons';
import { AdImpressionTrackDirective } from '../shared/ad-impression-track.directive';
import { AdCardEngagementRowComponent } from '../shared/ad-card-engagement-row.component';
import { locationOutline } from 'ionicons/icons';
import { VerificationBadgeComponent } from '../../shared/verification-badge/verification-badge.component';

@Component({
  selector: 'app-store-home-card',
  templateUrl: './store-home-card.component.html',
  styleUrls: ['./store-home-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonicModule,
    AdImpressionTrackDirective,
    AdCardEngagementRowComponent,
    VerificationBadgeComponent,
  ],
})
export class StoreHomeCardComponent implements OnInit, OnChanges {
  @Input() ad: any;
  /** عند الضغط على شارة المدينة: تصفية قائمة المتاجر في الصفحة الرئيسية حسب هذه المدينة */
  @Output() cityFilter = new EventEmitter<string>();
  private navCtrl = inject(NavController);

  displayName: string = 'مستخدم متاح';
  /** قيم محسوبة مرّة واحدة لتحاشي إعادة الحساب في كل دورة كشف تغيّرات */
  cityDisplay: string = 'غير محدد';
  hasCityForFilter = false;
  logoThumb: string = 'assets/mota7.png';

  constructor() {
    addIcons({ locationOutline });
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
    if (
      this.ad?.owner_name &&
      this.ad.owner_name !== 'غير مسجل' &&
      this.ad.owner_name !== 'مستخدم متاح'
    ) {
      this.displayName = this.ad.owner_name;
    } else {
      this.displayName = 'مستخدم متاح';
    }

    const c = this.ad?.city;
    const cityTrimmed = typeof c === 'string' ? c.trim() : '';
    this.cityDisplay = cityTrimmed || 'غير محدد';
    this.hasCityForFilter = cityTrimmed.length > 0;

    const u = cloudinaryListThumbnailUrl(this.ad?.logo || '');
    this.logoThumb = u || 'assets/mota7.png';
  }

  onCityChipClick(event: Event): void {
    event.stopPropagation();
    if (!this.hasCityForFilter) return;
    this.cityFilter.emit(this.ad.city.trim());
  }

  openStorePage(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.store-city-chip')) {
      return;
    }
    event.stopPropagation();
    const id = this.ad?.id || this.ad?.ad_id;
    if (!id) {
      console.warn('[store-card] محاولة فتح متجر بدون معرّف', this.ad);
      return;
    }
    const url = `/tabs/home/store/${encodeURIComponent(String(id))}`;
    void this.navCtrl.navigateForward(url, {
      state: { ad: this.ad },
      animated: true,
      animationDirection: 'forward',
    });
  }
}

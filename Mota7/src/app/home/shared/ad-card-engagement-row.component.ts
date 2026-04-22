import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOutline, star } from 'ionicons/icons';

@Component({
  selector: 'app-ad-card-engagement-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonicModule],
  templateUrl: './ad-card-engagement-row.component.html',
  styleUrls: ['./ad-card-engagement-row.component.scss'],
})
export class AdCardEngagementRowComponent implements OnInit, OnChanges {
  @Input() ad: any;
  /** إعلانات الخدمات (نقل / تعليم / أخرى) تعرض متوسط تقييم المزود بعد الطلبات */
  @Input() showServiceRating = false;

  /** قيم محسوبة مرّة واحدة لتفادي الـ getter في كل دورة كشف */
  viewCount = 0;
  avgRating: number | null = null;

  ngOnInit(): void {
    addIcons({ eyeOutline, star });
    this.computeDerived();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ad'] || changes['showServiceRating']) {
      this.computeDerived();
    }
  }

  private computeDerived(): void {
    const ic = this.ad?.impression_count;
    const sv = this.ad?.stats?.views;
    const a = typeof ic === 'number' && Number.isFinite(ic) && ic >= 0 ? Math.floor(ic) : 0;
    const b = typeof sv === 'number' && Number.isFinite(sv) && sv >= 0 ? Math.floor(sv) : 0;
    this.viewCount = Math.max(a, b);

    if (!this.showServiceRating) {
      this.avgRating = null;
      return;
    }
    const c = this.ad?.provider_service_rating_count;
    const s = this.ad?.provider_service_rating_sum;
    if (typeof c !== 'number' || c <= 0 || typeof s !== 'number' || !Number.isFinite(s)) {
      this.avgRating = null;
      return;
    }
    const x = s / c;
    this.avgRating = Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
  }
}

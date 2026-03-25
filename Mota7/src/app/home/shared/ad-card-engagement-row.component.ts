import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOutline, star } from 'ionicons/icons';

@Component({
  selector: 'app-ad-card-engagement-row',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './ad-card-engagement-row.component.html',
  styleUrls: ['./ad-card-engagement-row.component.scss'],
})
export class AdCardEngagementRowComponent implements OnInit {
  @Input() ad: any;
  /** إعلانات الخدمات (نقل / تعليم / أخرى) تعرض متوسط تقييم المزود بعد الطلبات */
  @Input() showServiceRating = false;

  ngOnInit(): void {
    addIcons({ eyeOutline, star });
  }

  get viewCount(): number {
    const ic = this.ad?.impression_count;
    const sv = this.ad?.stats?.views;
    const a = typeof ic === 'number' && Number.isFinite(ic) && ic >= 0 ? Math.floor(ic) : 0;
    const b = typeof sv === 'number' && Number.isFinite(sv) && sv >= 0 ? Math.floor(sv) : 0;
    return Math.max(a, b);
  }

  /** متوسط 1–5 أو null */
  get avgRating(): number | null {
    if (!this.showServiceRating) return null;
    const c = this.ad?.provider_service_rating_count;
    const s = this.ad?.provider_service_rating_sum;
    if (typeof c !== 'number' || c <= 0 || typeof s !== 'number' || !Number.isFinite(s)) return null;
    const x = s / c;
    if (!Number.isFinite(x)) return null;
    return Math.round(x * 10) / 10;
  }
}

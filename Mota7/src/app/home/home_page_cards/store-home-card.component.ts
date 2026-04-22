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
  EnvironmentInjector,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController } from '@ionic/angular';
import { Firestore } from '@angular/fire/firestore';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';
import { cloudinaryListThumbnailUrl } from 'src/app/core/utils/cloudinary-list-image.util';
import { addIcons } from 'ionicons';
import { AdImpressionTrackDirective } from '../shared/ad-impression-track.directive';
import { AdCardEngagementRowComponent } from '../shared/ad-card-engagement-row.component';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import {
  logoWhatsapp,
  call,
  checkmarkCircle,
  ribbon,
  shieldCheckmark,
  locationOutline,
} from 'ionicons/icons';

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
  ],
})
export class StoreHomeCardComponent implements OnInit, OnChanges {
  @Input() ad: any;
  /** عند الضغط على شارة المدينة: تصفية قائمة المتاجر في الصفحة الرئيسية حسب هذه المدينة */
  @Output() cityFilter = new EventEmitter<string>();
  private firestore = inject(Firestore);
  private analytics = inject(Analytics, { optional: true });
  private injector = inject(EnvironmentInjector);
  private navCtrl = inject(NavController);

  displayName: string = 'مستخدم متاح';
  /** قيم محسوبة مرّة واحدة لتحاشي إعادة الحساب في كل دورة كشف تغيّرات */
  cityDisplay: string = 'غير محدد';
  hasCityForFilter = false;
  hasStoreContact = false;
  logoThumb: string = 'assets/mota7.png';

  constructor() {
    addIcons({
      call,
      'logo-whatsapp': logoWhatsapp,
      checkmarkCircle,
      ribbon,
      shieldCheckmark,
      locationOutline,
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

    const p = this.ad?.whatsapp_phone ?? this.ad?.owner_phone;
    this.hasStoreContact = typeof p === 'string' ? p.trim().length > 0 : !!p;

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
    if (target?.closest('.store-city-chip, .store-contact-btn')) {
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

  async contactAction(type: 'whatsapp' | 'call', event?: Event) {
    if (event) event.stopPropagation();
    const raw = this.ad?.whatsapp_phone || this.ad?.owner_phone;
    if (raw == null || String(raw).trim() === '') return;
    const phone = String(raw).replace(/\s/g, '');
    await this.trackContactClick(this.ad, type);

    if (type === 'whatsapp') {
      const msg = encodeURIComponent(
        `السلام عليكم، استفسار بخصوص متجر: ${this.ad?.store_name || ''}`
      );
      window.open(`whatsapp://send?phone=${phone}&text=${msg}`, '_system');
    } else {
      window.open(`tel:${phone}`, '_system');
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
}

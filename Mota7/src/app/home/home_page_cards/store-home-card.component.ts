import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from '@angular/fire/firestore';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';
import { slimAdForHomeFeed } from 'src/app/core/utils/ad-home-feed-slim.util';
import { cloudinaryListThumbnailUrl } from 'src/app/core/utils/cloudinary-list-image.util';
import { addIcons } from 'ionicons';
import { ProductHomeCardComponent } from './product-home-card.component';
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
  imports: [
    CommonModule,
    IonicModule,
    ProductHomeCardComponent,
    AdImpressionTrackDirective,
    AdCardEngagementRowComponent,
  ],
})
export class StoreHomeCardComponent implements OnInit {
  @Input() ad: any;
  /** عند الضغط على شارة المدينة: تصفية قائمة المتاجر في الصفحة الرئيسية حسب هذه المدينة */
  @Output() cityFilter = new EventEmitter<string>();
  private firestore = inject(Firestore);
  private analytics = inject(Analytics, { optional: true });
  private injector = inject(EnvironmentInjector);

  displayName: string = 'مستخدم متاح';
  showProducts: boolean = false;
  products: any[] = [];
  productsLoading = false;
  private productsLoaded = false;

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
    if (
      this.ad?.owner_name &&
      this.ad.owner_name !== 'غير مسجل' &&
      this.ad.owner_name !== 'مستخدم متاح'
    ) {
      this.displayName = this.ad.owner_name;
    } else {
      this.displayName = 'مستخدم متاح';
    }
  }

  /** نص المدينة للعرض (نفس منطق بطاقات الخدمات) */
  get cityDisplay(): string {
    const c = this.ad?.city;
    return typeof c === 'string' && c.trim() ? c.trim() : 'غير محدد';
  }

  get hasCityForFilter(): boolean {
    const c = this.ad?.city;
    return typeof c === 'string' && c.trim().length > 0;
  }

  onCityChipClick(event: Event): void {
    event.stopPropagation();
    if (!this.hasCityForFilter) return;
    this.cityFilter.emit(this.ad.city.trim());
  }

  storeLogoThumb(): string {
    const u = cloudinaryListThumbnailUrl(this.ad?.logo || '');
    return u || 'assets/mota7.png';
  }

  /** رقم للتواصل (واتساب أو هاتف المالك) */
  get hasStoreContact(): boolean {
    const p = this.ad?.whatsapp_phone ?? this.ad?.owner_phone;
    return typeof p === 'string' ? p.trim().length > 0 : !!p;
  }

  async toggleProducts(event?: Event) {
    if (event) event.stopPropagation();
    this.showProducts = !this.showProducts;
    if (this.showProducts && !this.productsLoaded) {
      await this.loadStoreProducts();
    }
  }

  /**
   * جلب منتجات المتجر عند الفتح فقط — استعلام محدود بدل اشتراك بكل إعلانات product.
   */
  private async loadStoreProducts(): Promise<void> {
    this.productsLoading = true;
    try {
      const storeId = this.ad?.id || this.ad?.ad_id;
      const storeName = this.ad?.store_name;

      let snap: Awaited<ReturnType<typeof getDocs>> | null = null;

      if (storeId) {
        try {
          snap = await runInInjectionContext(this.injector, () => {
            const adsRef = collection(this.firestore, 'ads');
            const q = query(
              adsRef,
              where('ad_type', '==', 'product'),
              where('storeId', '==', storeId),
              where('status', '==', 'active'),
              where('isStoreProduct', '==', true),
              orderBy('created_at', 'desc'),
              limit(24)
            );
            return getDocs(q);
          });
        } catch (e) {
          console.warn('store products query by storeId (قد تحتاج فهرساً مركباً في Firebase):', e);
        }
      }

      if ((!snap || snap.empty) && storeName) {
        try {
          snap = await runInInjectionContext(this.injector, () => {
            const adsRef = collection(this.firestore, 'ads');
            const q = query(
              adsRef,
              where('ad_type', '==', 'product'),
              where('storeName', '==', storeName),
              where('status', '==', 'active'),
              where('isStoreProduct', '==', true),
              orderBy('created_at', 'desc'),
              limit(24)
            );
            return getDocs(q);
          });
        } catch (e) {
          console.warn('store products query by storeName:', e);
        }
      }

      if (snap && !snap.empty) {
        this.products = snap.docs.map((d) =>
          slimAdForHomeFeed(Object.assign({ id: d.id }, d.data() || {}), 'product')
        );
      } else {
        this.products = [];
      }
      this.productsLoaded = true;
    } catch (e) {
      console.error('loadStoreProducts', e);
      this.products = [];
      this.productsLoaded = true;
    } finally {
      this.productsLoading = false;
    }
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

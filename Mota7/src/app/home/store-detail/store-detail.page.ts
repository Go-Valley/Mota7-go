import {
  Component,
  OnInit,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
} from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import {
  logoWhatsapp,
  call,
  arrowForwardOutline,
  eyeOutline,
  locationOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { slimAdForHomeFeed } from 'src/app/core/utils/ad-home-feed-slim.util';
import { cloudinaryListThumbnailUrl } from 'src/app/core/utils/cloudinary-list-image.util';
import { ProductHomeCardComponent } from '../home_page_cards/product-home-card.component';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import { Mota7HeaderComponent } from 'src/app/top_header/header';

@Component({
  selector: 'app-store-detail',
  templateUrl: './store-detail.page.html',
  styleUrls: ['./store-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ProductHomeCardComponent, Mota7HeaderComponent],
})
export class StoreDetailPage implements OnInit {
  private firestore = inject(Firestore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private injector = inject(EnvironmentInjector);
  private analytics = inject(Analytics, { optional: true });

  ad: any = null;
  products: any[] = [];
  loading = true;
  productsLoading = false;
  error: string | null = null;

  constructor() {
    addIcons({
      call,
      'logo-whatsapp': logoWhatsapp,
      arrowForwardOutline,
      eyeOutline,
      locationOutline,
      alertCircleOutline,
    });
  }

  ngOnInit(): void {
    const storeId = this.route.snapshot.paramMap.get('storeId');
    if (!storeId) {
      this.error = 'معرّف المتجر غير صالح';
      this.loading = false;
      return;
    }

    const fromState = (history.state as { ad?: unknown })?.ad as Record<string, unknown> | undefined;
    if (
      fromState &&
      (fromState['id'] === storeId || fromState['ad_id'] === storeId)
    ) {
      this.ad = fromState;
      this.loading = false;
    }

    void this.loadStoreAndProducts(storeId);
  }

  get viewCount(): number {
    const ic = this.ad?.impression_count;
    const sv = this.ad?.stats?.views;
    const a = typeof ic === 'number' && Number.isFinite(ic) && ic >= 0 ? Math.floor(ic) : 0;
    const b = typeof sv === 'number' && Number.isFinite(sv) && sv >= 0 ? Math.floor(sv) : 0;
    return Math.max(a, b);
  }

  get cityDisplay(): string {
    const c = this.ad?.city;
    return typeof c === 'string' && c.trim() ? c.trim() : 'غير محدد';
  }

  get hasStoreContact(): boolean {
    const p = this.ad?.whatsapp_phone ?? this.ad?.owner_phone;
    return typeof p === 'string' ? p.trim().length > 0 : !!p;
  }

  storeLogoThumb(): string {
    const u = cloudinaryListThumbnailUrl(this.ad?.logo || '');
    return u || 'assets/mota7.png';
  }

  async loadStoreAndProducts(storeId: string): Promise<void> {
    if (!this.ad) {
      this.loading = true;
    }
    this.error = null;
    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'ads', storeId))
      );
      if (!snap.exists()) {
        this.error = 'المتجر غير موجود أو غير متاح';
        this.ad = null;
        this.loading = false;
        return;
      }
      const data = snap.data() || {};
      if (data['ad_type'] !== 'store') {
        this.error = 'هذا الإعلان ليس متجراً';
        this.ad = null;
        this.loading = false;
        return;
      }
      this.ad = { id: snap.id, ...data };
    } catch (e) {
      console.error('store-detail loadStore', e);
      this.error = 'تعذّر تحميل بيانات المتجر';
      this.ad = null;
    } finally {
      this.loading = false;
    }

    if (this.ad) {
      await this.loadStoreProducts();
    }
  }

  private async loadStoreProducts(): Promise<void> {
    this.productsLoading = true;
    this.products = [];
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
              limit(48)
            );
            return getDocs(q);
          });
        } catch (e) {
          console.warn('store detail products by storeId:', e);
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
              limit(48)
            );
            return getDocs(q);
          });
        } catch (e) {
          console.warn('store detail products by storeName:', e);
        }
      }

      if (snap && !snap.empty) {
        this.products = snap.docs.map((d) =>
          slimAdForHomeFeed(Object.assign({ id: d.id }, d.data() || {}), 'product')
        );
      }
    } catch (e) {
      console.error('loadStoreProducts', e);
      this.products = [];
    } finally {
      this.productsLoading = false;
    }
  }

  async contactAction(type: 'whatsapp' | 'call') {
    const raw = this.ad?.whatsapp_phone || this.ad?.owner_phone;
    if (raw == null || String(raw).trim() === '') return;
    const phone = String(raw).replace(/\s/g, '');
    await this.trackContactClick(type);

    if (type === 'whatsapp') {
      const msg = encodeURIComponent(
        `السلام عليكم، استفسار بخصوص متجر: ${this.ad?.store_name || ''}`
      );
      window.open(`whatsapp://send?phone=${phone}&text=${msg}`, '_system');
    } else {
      window.open(`tel:${phone}`, '_system');
    }
  }

  private async trackContactClick(type: 'call' | 'whatsapp') {
    const adId = this.ad?.id || this.ad?.ad_id;
    if (!adId) return;
    try {
      if (this.analytics) {
        logEvent(this.analytics, 'ad_contact_click', {
          ad_id: adId,
          ad_title: this.ad?.title || this.ad?.store_name,
          contact_type: type,
        });
      }
      await commitAdContactClickFirestore(this.firestore, this.injector, this.ad, type);
    } catch (error) {
      console.error('حدث خطأ أثناء تحديث سجلات النقرات:', error);
    }
  }

  goBack() {
    if (window.history.length > 1) {
      this.location.back();
      return;
    }
    this.router.navigateByUrl('/tabs/home');
  }
}

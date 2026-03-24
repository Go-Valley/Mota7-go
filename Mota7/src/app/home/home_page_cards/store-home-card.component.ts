import { Component, Input, OnInit, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';
import { addIcons } from 'ionicons';
import { ProductHomeCardComponent } from './product-home-card.component';
import { map } from 'rxjs/operators';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import { 
  logoWhatsapp, 
  call, 
  checkmarkCircle, 
  ribbon, 
  shieldCheckmark 
} from 'ionicons/icons';

@Component({
  selector: 'app-store-home-card',
  templateUrl: './store-home-card.component.html',
  styleUrls: ['./store-home-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ProductHomeCardComponent]
})
export class StoreHomeCardComponent implements OnInit {
  @Input() ad: any;
  private firestore = inject(Firestore);
  private analytics = inject(Analytics, { optional: true });
  private injector = inject(EnvironmentInjector);

  displayName: string = 'مستخدم متاح';
  showProducts: boolean = false;
  products$: any;

  constructor() {
    addIcons({
      logoWhatsapp,
      call,
      checkmarkCircle,
      ribbon,
      shieldCheckmark
    });
  }

  ngOnInit() {
    if (this.ad?.owner_name && this.ad.owner_name !== 'غير مسجل' && this.ad.owner_name !== 'مستخدم متاح') {
      this.displayName = this.ad.owner_name;
    } else {
      this.displayName = 'مستخدم متاح';
    }

    // collection/query/collectionData كلها داخل نفس سياق الحقن (AngularFire)
    this.products$ = runInInjectionContext(this.injector, () => {
      const adsRef = collection(this.firestore, 'ads');
      const q = query(adsRef, where('ad_type', '==', 'product'));
      return collectionData(q, { idField: 'id' }).pipe(
        map((ads: any[]) =>
          ads.filter((ad) => {
            const currentStoreId = this.ad?.id || this.ad?.ad_id;
            const byId = ad.storeId && currentStoreId && ad.storeId === currentStoreId;
            const byName = ad.storeName && ad.storeName === this.ad?.store_name;
            return ad.status === 'active' && ad.isStoreProduct === true && (byId || byName);
          })
        )
      );
    });
  }

  toggleProducts(event?: Event) {
    if (event) event.stopPropagation();
    this.showProducts = !this.showProducts;
  }

  async contactAction(type: 'whatsapp' | 'call', event?: Event) {
    if (event) event.stopPropagation();
    const phone = this.ad?.whatsapp_phone || this.ad?.owner_phone;
    if (!phone) return;
    await this.trackContactClick(this.ad, type);

    if (type === 'whatsapp') {
      const msg = encodeURIComponent(`السلام عليكم، استفسار بخصوص متجر: ${this.ad?.store_name || ''}`);
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

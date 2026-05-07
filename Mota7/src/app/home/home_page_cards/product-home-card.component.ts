import { Component, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import {
  locationOutline, checkmarkCircle, call, logoWhatsapp, cashOutline,
  shieldCheckmarkOutline, shieldCheckmark
} from 'ionicons/icons';
import { ProductDetailsComponent } from 'src/app/my-account/my_adv/components/product-form/product-details.component';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';
import { cloudinaryListThumbnailUrl } from 'src/app/core/utils/cloudinary-list-image.util';
import { CartService } from 'src/app/core/services/cart.service';
import { productHasPurchasablePrice } from 'src/app/core/utils/price-parse.util';
import { sellerCityLabelForProductAd } from 'src/app/core/utils/product-seller-location.util';
import { AdImpressionTrackDirective } from '../shared/ad-impression-track.directive';
import { AdCardEngagementRowComponent } from '../shared/ad-card-engagement-row.component';
import { VerificationBadgeComponent } from '../../shared/verification-badge/verification-badge.component';

@Component({
  selector: 'app-product-home-card',
  templateUrl: './product-home-card.component.html',
  styleUrls: ['./product-home-card.component.scss'],
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
export class ProductHomeCardComponent implements OnInit, OnChanges {
  @Input() ad: any;
  /** يمنع تكدّس مودالات تفاصيل المنتج عند النقر المتكرر على الكارت */
  private productDetailsModalBusy = false;
  private modalCtrl = inject(ModalController);
  private analytics = inject(Analytics, { optional: true });
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);
  private cart = inject(CartService);
  displayName: string = 'جاري التحميل...';
  /** قيم محسوبة مرّة واحدة لتفادي إعادة الحساب في كل دورة كشف تغيّرات */
  thumbSrc: string = 'assets/mota7.png';

  constructor() {
    addIcons({ 
      locationOutline, 
      checkmarkCircle, 
      call, 
      logoWhatsapp, 
      cashOutline, 
      shieldCheckmarkOutline, 
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
    this.setDisplayName();
    const raw = this.ad?.details?.images?.[0];
    const u = cloudinaryListThumbnailUrl(typeof raw === 'string' ? raw : '');
    this.thumbSrc = u || 'assets/mota7.png';
  }

  setDisplayName() {
    if (this.ad?.owner_name && this.ad.owner_name !== 'مستخدم متاح') {
      this.displayName = this.ad.owner_name;
    }
    else if (this.ad?.details?.owner_name && this.ad.details.owner_name !== 'مستخدم متاح') {
      this.displayName = this.ad.details.owner_name;
    }
    else {
      this.displayName = 'متاح';
    }
  }

  get canPurchase(): boolean {
    return !!(this.ad && productHasPurchasablePrice(this.ad.details));
  }

  /**
   * العربة لا تُفعّل إلا لإعلان **active** وفيه تفعيل من الأدمن (`cart_enabled !== false`).
   * إعلانات قيد المراجعة أو قبل تفعيل الأدمن تبقى الزرّ معطّلة.
   */
  get cartEnabledOnCard(): boolean {
    if (!this.ad || String(this.ad.status ?? '') !== 'active') {
      return false;
    }
    return this.ad.cart_enabled !== false;
  }

  get addToCartDisabled(): boolean {
    return !this.canPurchase || !this.cartEnabledOnCard;
  }

  /** تلميح زر العربة المعطّل */
  get addToCartTooltip(): string {
    if (!this.addToCartDisabled || !this.canPurchase) {
      return '';
    }
    if (String(this.ad?.status ?? '') !== 'active') {
      return 'معطّل أثناء مراجعة الإعلان؛ يُفعَّل بعد الموافقة من الإدارة';
    }
    if (this.ad?.cart_enabled === false) {
      return 'تم تعطيل الإضافة للعربة لهذا الإعلان — سيُفعّل من لوحة الإدارة عند الجاهزية';
    }
    return '';
  }

  get sellerCityDisplay(): string {
    return sellerCityLabelForProductAd(this.ad);
  }

  addProductToCart(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canPurchase || !this.cartEnabledOnCard) {
      return;
    }
    const ok = this.cart.addProductAd(this.ad);
    if (ok) {
      this.cdr.markForCheck();
    }
  }

  async openProductDetails() {
    if (this.productDetailsModalBusy) {
      return;
    }
    this.productDetailsModalBusy = true;
    try {
      const id = this.ad?.id;
      let adForModal = this.ad;
      if (id && this.ad?._feedSlim) {
        try {
          const snap = await runInInjectionContext(this.injector, () =>
            getDoc(doc(this.firestore, 'ads', id))
          );
          if (snap.exists()) {
            adForModal = Object.assign({ id: snap.id }, snap.data());
          }
        } catch (e) {
          console.error('openProductDetails fetch full ad', e);
        }
      }
      const modal = await this.modalCtrl.create({
        component: ProductDetailsComponent,
        componentProps: {
          ad: adForModal,
          ownerName: this.displayName,
        },
        mode: 'ios',
        cssClass: 'mota7-global-modal',
      });
      await modal.present();
      await modal.onDidDismiss();
    } finally {
      this.productDetailsModalBusy = false;
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
    const phone = type === 'whatsapp' ? (this.ad?.details?.whatsapp_phone || this.ad?.owner_phone) : this.ad?.owner_phone;
    if (!phone) return;
    
    if (type === 'whatsapp') {
      const productDesc = this.ad.details?.short_desc || this.ad.details?.title || '';
      const msg = encodeURIComponent(`السلام عليكم .. عايز استفسر عن منتج : (${productDesc})`);
      window.open(`whatsapp://send?phone=${phone}&text=${msg}`, '_system');
    } else {
      window.open(`tel:${phone}`, '_system');
    }
  }
}

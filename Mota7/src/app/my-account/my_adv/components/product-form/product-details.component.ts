import { Component, Input, OnInit, inject, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { sellerCityLabelForProductAd } from 'src/app/core/utils/product-seller-location.util';
import { cloudinaryGalleryImageUrl } from 'src/app/core/utils/cloudinary-list-image.util';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { 
  chevronForwardOutline, logoWhatsapp, call, 
  personOutline, shieldCheckmarkOutline, cashOutline, locationOutline 
} from 'ionicons/icons';

// استيراد Swiper الرسمي
import { register } from 'swiper/element/bundle';
import { VerificationBadgeComponent } from 'src/app/shared/verification-badge/verification-badge.component';

register();

@Component({
  selector: 'app-product-details',
  templateUrl: './product-details.component.html',
  styleUrls: ['./product-details.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, VerificationBadgeComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ProductDetailsComponent implements OnInit {
  @Input() ad: any;
  @Input() ownerName: string = '';

  private modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ 
      chevronForwardOutline, logoWhatsapp, call, 
      personOutline, shieldCheckmarkOutline, cashOutline, locationOutline 
    });
  }

  ngOnInit() {
    // لا يوجد استدعاء لـ Firebase/AngularFire هنا؛ لا حاجة لـ runInInjectionContext
  }

  galleryImgSrc(url: string | undefined): string {
    if (!url) return '';
    const o = cloudinaryGalleryImageUrl(url);
    return o || url;
  }

  get sellerCityDisplay(): string {
    return sellerCityLabelForProductAd(this.ad);
  }

  close() {
    this.modalCtrl.dismiss();
  }

  contactAction(type: 'whatsapp' | 'call') {
    const phone = type === 'whatsapp' ? (this.ad.whatsapp_phone || this.ad.owner_phone) : this.ad.owner_phone;
    if (!phone) return;

    if (type === 'whatsapp') {
      const productDesc = this.ad.details?.short_desc || this.ad.details?.title || '';
      const msg = encodeURIComponent(`السلام عليكم .. عايز استفسر عن منتج (${productDesc})`);
      window.open(`whatsapp://send?phone=${phone}&text=${msg}`, '_system');
    } else {
      window.open(`tel:${phone}`, '_system');
    }
  }
}
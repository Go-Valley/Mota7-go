import { Component, Input, OnInit, inject, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  locationOutline, checkmarkCircle, call, logoWhatsapp, cashOutline,
  shieldCheckmarkOutline, shieldCheckmark
} from 'ionicons/icons';
import { ProductDetailsComponent } from 'src/app/my-account/my_adv/components/product-form/product-details.component';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';
import { Firestore } from '@angular/fire/firestore';
import { commitAdContactClickFirestore } from 'src/app/core/utils/ad-contact-click-tracking.util';

@Component({
  selector: 'app-product-home-card',
  templateUrl: './product-home-card.component.html',
  styleUrls: ['./product-home-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class ProductHomeCardComponent implements OnInit {
  @Input() ad: any;
  private modalCtrl = inject(ModalController);
  private analytics = inject(Analytics, { optional: true });
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  displayName: string = 'جاري التحميل...';

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
    this.setDisplayName();
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

  async openProductDetails() {
    const modal = await this.modalCtrl.create({
      component: ProductDetailsComponent,
      componentProps: { 
        ad: this.ad, 
        ownerName: this.displayName 
      },
      mode: 'ios',
      cssClass: 'mota7-global-modal' 
    });
    return await modal.present();
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

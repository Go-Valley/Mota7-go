import { encodeWhatsappText } from 'src/app/core/utils/whatsapp-open.util';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ModalController } from '@ionic/angular'; 
import { Auth } from '@angular/fire/auth';
import { addIcons } from 'ionicons';
import { 
  trashOutline, createOutline, locationOutline, checkmarkCircle, ribbon,
  call, logoWhatsapp, alertCircleOutline, calendarOutline, cashOutline, shieldCheckmarkOutline,
  shieldCheckmark
} from 'ionicons/icons';

// استيراد المكون الجديد (الشاشة المنبثقة)
import { ProductDetailsComponent } from '../product-form/product-details.component';
import { Firestore, doc, updateDoc  } from '@angular/fire/firestore';
import { VerificationModalComponent } from '../verification-modal.component';
import { AdCardEngagementRowComponent } from '../../../../home/shared/ad-card-engagement-row.component';
import { cloudinaryListThumbnailUrl } from '../../../../core/utils/cloudinary-list-image.util';
import { computeMyAdManageCardFaded } from '../shared/my-ad-manage-card-fade.util';
import { VerificationBadgeComponent } from '../../../../shared/verification-badge/verification-badge.component';
import { formatAdCoverageDisplay } from 'src/app/core/utils/governorate-city-display.util';

@Component({
  selector: 'app-product-card',
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, AdCardEngagementRowComponent, VerificationBadgeComponent],
})

export class ProductCardComponent implements OnInit, OnChanges {
  @Input() ad: any; 
  @Input() userNameFromParent: string = '';
  @Output() edit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();

  manageCardFaded = false;

  private modalCtrl = inject(ModalController);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  displayName: string = 'جاري التحميل...';

  constructor() {
    addIcons({ 
      trashOutline, createOutline, locationOutline, checkmarkCircle, ribbon,
      call, logoWhatsapp, alertCircleOutline, calendarOutline, cashOutline, shieldCheckmarkOutline,
      shieldCheckmark
    });
  }

  ngOnInit() {
    this.setDisplayName();
    this.syncManageCardFaded();
    this.checkExpiration();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['ad']) {
      this.syncManageCardFaded();
    }
  }

  private syncManageCardFaded() {
    if (!this.ad) {
      this.manageCardFaded = false;
      return;
    }
    this.manageCardFaded = computeMyAdManageCardFaded(
      this.ad.status,
      this.ad.is_available,
      false
    );
  }

  async checkExpiration() {
    if (this.ad.status !== 'active' || !this.ad.expiry_date) return;
    
    const now = new Date();
    const expiry = this.ad.expiry_date.toDate ? this.ad.expiry_date.toDate() : new Date(this.ad.expiry_date);
    
    if (now > expiry) {
      try {
        await runInInjectionContext(this.injector, () =>
          updateDoc(doc(this.firestore, 'ads', this.ad.ad_id || this.ad.id), { status: 'expired' })
        );
        this.ad.status = 'expired';
        this.syncManageCardFaded();
      } catch (e) {
        console.error("Expiration update error:", e);
      }
    }
  }

  setDisplayName() {
    // الأولوية لاسم المتجر إذا كان المنتج تابعاً لمتجر، ثم اسم المالك
    if (this.ad.storeName) {
      this.displayName = this.ad.storeName;
    } else if (this.ad.owner_name && this.ad.owner_name !== 'مستخدم متاح') {
      this.displayName = this.ad.owner_name;
    } else {
      this.displayName = this.userNameFromParent || 'متاح';
    }
  }

  productThumbSrc(): string {
    const imgs = this.ad?.details?.images;
    const first = Array.isArray(imgs) && imgs.length > 0 ? String(imgs[0]) : '';
    const u = cloudinaryListThumbnailUrl(first);
    return u || 'assets/mota7.png';
  }

  async openProductDetails() {
    const modal = await this.modalCtrl.create({
      component: ProductDetailsComponent,
      componentProps: { ad: this.ad, ownerName: this.displayName },
      mode: 'ios',
      cssClass: 'mota7-global-modal' 
    });
    return await modal.present();
  }

  contactAction(type: 'whatsapp' | 'call', event: Event) {
    event.stopPropagation();
    // في بياناتك: whatsapp_phone موجود داخل details
    const phone = this.ad.owner_phone;
    const waPhone = this.ad.details?.whatsapp_phone || phone;

    // --- بذرة نظام تتبع الأداء للأدمن (Stats Tracking) ---
    // الأدمن سيراقب ad.stats.calls و ad.stats.views
    
    if (type === 'whatsapp') {
      const productDesc = this.ad.details?.short_desc || this.ad.details?.title || '';
      const msg = encodeWhatsappText(`السلام عليكم .. استفسار عن منتج (${productDesc})`);
      window.open(`whatsapp://send?phone=${waPhone}&text=${msg}`, '_system');
    } else {
      window.open(`tel:${phone}`, '_system');
    }
  }

  contactAdmin(type: 'pending' | 'rejected' | 'expired', event: Event) {
    event.stopPropagation();
    const adminPhone = '01220883999';
    const productDesc = this.ad.details?.short_desc || this.ad.details?.title || '';
    const ownerPhone = this.ad?.owner_phone || '';

    if (type === 'pending') {
      const msg = encodeWhatsappText(`السلام عليكم .. برجاء تفعيل اعلان (${productDesc}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    if (type === 'rejected') {
      const msg = encodeWhatsappText(`السلام عليكم .. بستفسر عن سبب رفض اعلاني : (${productDesc}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    const msg = encodeWhatsappText(`السلام عليكم .. بستفسر عن سبب انتهاء اعلاني : (${productDesc}) لرقم (${ownerPhone})`);
    window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
  }

  onEdit() { this.edit.emit(this.ad); }

  onDelete() {
    // إرسال ad_id الصحيح كما في الفايربيز
    this.delete.emit(this.ad.ad_id);
  }

  coverageDisplay(ad: any): string {
    return formatAdCoverageDisplay(ad ?? {});
  }

  async showVerificationModal() {
    const modal = await this.modalCtrl.create({
      component: VerificationModalComponent,
      componentProps: {
        ad: this.ad,
        adType: 'product'
      },
      cssClass: 'verification-modal',
      backdropDismiss: true,
    });
    await modal.present();
  }
}

import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
  OnChanges,
  SimpleChanges,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ModalController } from '@ionic/angular';
import { Auth } from '@angular/fire/auth'; 
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import { VerificationModalComponent } from '../verification-modal.component';
import { AdCardEngagementRowComponent } from '../../../../home/shared/ad-card-engagement-row.component';
import { cloudinaryListThumbnailUrl } from '../../../../core/utils/cloudinary-list-image.util';
import { computeMyAdManageCardFaded } from '../shared/my-ad-manage-card-fade.util';
import { VerificationBadgeComponent } from '../../../../shared/verification-badge/verification-badge.component';
import { 
  logoWhatsapp, call, checkmarkCircle, ribbon, 
  createOutline, trashOutline, alertCircleOutline, shieldCheckmark, shieldCheckmarkOutline 
} from 'ionicons/icons';

@Component({
  selector: 'app-store-card',
  templateUrl: './store-card.component.html',
  styleUrls: ['./store-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, AdCardEngagementRowComponent, VerificationBadgeComponent],
})

export class StoreCardComponent implements OnInit, OnChanges {
  @Input() ad: any; 
  @Input() userNameFromParent: string = ''; 
  @Output() edit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();

  manageCardFaded = false;

  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private injector = inject(EnvironmentInjector);

  displayName: string = 'جاري التحميل...';

  constructor() {
    addIcons({ 
      logoWhatsapp, call, checkmarkCircle, ribbon, 
      createOutline, trashOutline, alertCircleOutline, shieldCheckmark, shieldCheckmarkOutline 
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

  get hasStoreContact(): boolean {
    return !!(this.ad?.owner_phone || this.ad?.whatsapp_phone);
  }

  storeLogoThumb(): string {
    const u = cloudinaryListThumbnailUrl(this.ad?.logo || '');
    return u || 'assets/mota7.png';
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
    if (this.ad.owner_name && this.ad.owner_name !== 'غير مسجل' && this.ad.owner_name !== 'مستخدم متاح') {
      this.displayName = this.ad.owner_name;
    } else if (this.userNameFromParent && this.userNameFromParent !== 'جاري التحميل...') {
      this.displayName = this.userNameFromParent;
    } else {
      this.displayName = this.auth.currentUser?.displayName || 'مستخدم متاح';
    }
  }

  // دالة التواصل مع الإدارة
  contactAdmin(type: 'pending' | 'rejected' | 'expired', event: Event) {
    event.stopPropagation();
    const adminPhone = '01220883999';
    const storeName = this.ad?.store_name || '';
    const ownerPhone = this.ad?.owner_phone || '';

    if (type === 'pending') {
      const msg = encodeURIComponent(`السلام عليكم .. برجاء تفعيل اعلان (${storeName}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    if (type === 'rejected') {
      const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب رفض اعلاني : (${storeName}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب انتهاء اعلاني : (${storeName}) لرقم (${ownerPhone})`);
    window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
  }

  onDelete() {
    // إرسال معرف المتجر الصحيح (store_...)
    this.delete.emit(this.ad.ad_id);
  }

  onEdit() {
    this.edit.emit(this.ad);
  }

  contactAction(type: 'whatsapp' | 'call', event?: Event) {
    event?.stopPropagation();
    // الأولوية لـ whatsapp_phone ثم owner_phone كما في بياناتك
    const phone = this.ad.whatsapp_phone || this.ad.owner_phone;
    if (!phone) return;

    // مستقبلاً: هنا سيتم إضافة كود زيادة عداد Stats.calls للأدمن
    
    if (type === 'whatsapp') {
      const msg = encodeURIComponent(`السلام عليكم، استفسار بخصوص متجر: ${this.ad.store_name}`);
      window.open(`whatsapp://send?phone=${phone}&text=${msg}`, '_system');
    } else {
      window.open(`tel:${phone}`, '_system');
    }
  }

  async showVerificationModal() {
    const modal = await this.modalCtrl.create({
      component: VerificationModalComponent,
      componentProps: {
        ad: this.ad,
        adType: 'store'
      },
      cssClass: 'verification-modal',
      backdropDismiss: true,
    });
    await modal.present();
  }
}

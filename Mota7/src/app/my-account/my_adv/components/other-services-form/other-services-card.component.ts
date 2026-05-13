import {
  ChangeDetectorRef,
  Component,
  OnInit,
  OnChanges,
  SimpleChanges,
  Input,
  Output,
  EventEmitter,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import { VerificationModalComponent } from '../verification-modal.component';
import { AdCardEngagementRowComponent } from '../../../../home/shared/ad-card-engagement-row.component';
import { computeMyAdManageCardFaded } from '../shared/my-ad-manage-card-fade.util';
import { VerificationBadgeComponent } from '../../../../shared/verification-badge/verification-badge.component';
import { AppTaxonomyService } from '../../../../core/services/app-taxonomy.service';
import {
  OtherCategoryItem,
  resolveOtherCategoryIcon,
  resolveOtherCategoryNameAr,
} from '../../../../core/utils/other-category-display.util';
import { formatAdCoverageDisplay } from 'src/app/core/utils/governorate-city-display.util';
import { 
  trashOutline, createOutline, locationOutline, call, 
  logoWhatsapp, alertCircleOutline, timeOutline, checkmarkCircle, checkmarkDoneCircle, closeCircle, shieldCheckmark, shieldCheckmarkOutline,
  hammer, cut, flash, water, colorPalette, construct, business, grid, card, tv,
  flame, carSport, pricetag, megaphone, cube, cog
} from 'ionicons/icons';

@Component({
  selector: 'app-other-services-card',
  templateUrl: './other-services-card.component.html',
  styleUrls: ['./other-services-card.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, AdCardEngagementRowComponent, VerificationBadgeComponent],
})

export class OtherServicesCardComponent implements OnInit, OnChanges {
  @Input() ad: any;
  @Output() edit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();

  manageCardFaded = false;

  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);

  /** قائمة الفروع الديناميكية (Categories/other_services) — تتحدّث مباشرة عند تغيّر Firestore */
  private dynamicOtherItems: OtherCategoryItem[] = [];

  constructor() {
    addIcons({ 
      trashOutline, createOutline, locationOutline, call, logoWhatsapp, 
      alertCircleOutline, timeOutline, 'time-outline': timeOutline, checkmarkCircle, checkmarkDoneCircle, closeCircle, shieldCheckmark, shieldCheckmarkOutline,
      hammer, cut, flash, water, colorPalette, construct, business, grid, card, tv,
      flame, carSport, pricetag, megaphone, cube, cog
    });
  }

  ngOnInit() {
    this.syncManageCardFaded();
    this.taxonomy.bundle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => {
        this.dynamicOtherItems = (b?.otherItems ?? []) as OtherCategoryItem[];
        this.cdr.markForCheck();
      });
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
      true
    );
  }

  getCategoryName(_id?: string): string {
    return resolveOtherCategoryNameAr(this.ad, this.dynamicOtherItems);
  }

  getCategoryIcon(_id?: string): string {
    return resolveOtherCategoryIcon(this.ad, this.dynamicOtherItems);
  }

  async toggleAvailability() {
    const adId = this.ad?.id || this.ad?.ad_id;
    if (!adId) return;
    const prev = !!this.ad.is_available;
    const newValue = !prev;
    this.ad.is_available = newValue;
    this.syncManageCardFaded();
    this.cdr.detectChanges();
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, `ads/${adId}`), { is_available: newValue })
      );
    } catch (error) {
      console.error("Update Error:", error);
      this.ad.is_available = prev;
      this.syncManageCardFaded();
    } finally {
      this.cdr.detectChanges();
    }
  }

  contactAction(type: 'whatsapp' | 'call', event: Event) {
    event.stopPropagation();
    const phone = this.ad?.owner_phone;
    if (!phone) return;

    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else if (type === 'whatsapp') {
      const serviceName = this.getCategoryName();
      const msg = encodeURIComponent(`السلام عليكم .. محتاج اطلب خدمة (${serviceName})`);
      // استخدام whatsapp_phone من داخل details كما في الفايربيز
      const waPhone = this.ad.details?.whatsapp_phone || phone;
      window.open(`whatsapp://send?phone=${waPhone}&text=${msg}`, '_system');
    }
  }

  contactAdmin(type: 'pending' | 'rejected' | 'expired', event: Event) {
    event.stopPropagation();
    const adminPhone = '01220883999';
    const otherKey = this.ad?.other_match_key || this.ad?.category_id || '';
    const ownerPhone = this.ad?.owner_phone || '';

    if (type === 'pending') {
      const msg = encodeURIComponent(`السلام عليكم .. برجاء تفعيل اعلان (${otherKey}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    if (type === 'rejected') {
      const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب رفض اعلاني : (${otherKey}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب انتهاء اعلاني : (${otherKey}) لرقم (${ownerPhone})`);
    window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
  }

  onEdit() {
    this.edit.emit(this.ad);
  }

  onDelete() {
    // التأكد من إرسال ad_id لعملية الحذف من قبل الأدمن أو المستخدم
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
        adType: 'other'
      },
      cssClass: 'verification-modal',
      backdropDismiss: true,
    });
    await modal.present();
  }
}

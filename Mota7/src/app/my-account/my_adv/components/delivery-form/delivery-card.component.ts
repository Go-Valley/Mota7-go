import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  OnChanges,
  SimpleChanges,
  Input,
  Output,
  EventEmitter,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  trashOutline,
  createOutline,
  locationOutline,
  checkmarkCircle,
  call,
  logoWhatsapp,
  alertCircleOutline,
  carOutline,
  shieldCheckmarkOutline,
  shieldCheckmark,
  bicycleOutline,
  busOutline,
  airplaneOutline,
  keyOutline,
  checkmarkDoneCircle,
  closeCircle,
} from 'ionicons/icons';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { DELIVERY_CATEGORY } from '../../../../core/constants/delivery-data';
import { DeliveryFormComponent } from './delivery-form.component';
import { VerificationModalComponent } from '../verification-modal.component';
import { AdCardEngagementRowComponent } from '../../../../home/shared/ad-card-engagement-row.component';
import { computeMyAdManageCardFaded } from '../shared/my-ad-manage-card-fade.util';
import { VerificationBadgeComponent } from '../../../../shared/verification-badge/verification-badge.component';
import { AppTaxonomyService } from '../../../../core/services/app-taxonomy.service';
import { formatAdCoverageDisplay } from 'src/app/core/utils/governorate-city-display.util';

@Component({
  selector: 'app-delivery-card',
  templateUrl: './delivery-card.component.html',
  styleUrls: ['./delivery-card.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, AdCardEngagementRowComponent, VerificationBadgeComponent],
})
export class DeliveryCardComponent implements OnInit, OnChanges {

  @Input() ad: any;
  private deliveryItems = [...DELIVERY_CATEGORY.items];

  manageCardFaded = false;
  @Output() edit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();
  @Output() statusToggle = new EventEmitter<any>(); 

  private alertCtrl = inject(AlertController);
  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({
      trashOutline,
      createOutline,
      locationOutline,
      checkmarkCircle,
      call,
      logoWhatsapp,
      alertCircleOutline,
      carOutline,
      shieldCheckmarkOutline,
      shieldCheckmark,
      bicycleOutline,
      busOutline,
      airplaneOutline,
      keyOutline,
      checkmarkDoneCircle,
      closeCircle,
    });
  }

  ngOnInit() {
    this.taxonomy.bundle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => {
        const items = (b?.deliveryItems ?? []).filter((i: any) => i?.id && i?.nameAr);
        if (items.length) {
          this.deliveryItems = items;
        }
      });
    this.syncManageCardFaded();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['ad']) {
      this.syncManageCardFaded();
    }
  }

  private syncManageCardFaded() {
    if (!this.ad?.details) {
      this.manageCardFaded = false;
      return;
    }
    this.manageCardFaded = computeMyAdManageCardFaded(
      this.ad.status,
      this.ad.details.is_available,
      true
    );
  }

  /** مطابقة منطق بطاقة الرئيسية لعرض شرائح السفر / الإيجار */
  get showTravelChip(): boolean {
    const id = this.ad?.category_id;
    return id === 'private-car' || id === 'taxi';
  }

  get showRentChip(): boolean {
    return this.ad?.category_id === 'private-car';
  }

  getCategoryName(categoryId: string): string {
    const category = this.deliveryItems.find(item => item.id === categoryId);
    return category ? category.nameAr : 'خدمة توصيل';
  }

  getCategoryIcon(categoryId: string): string {
    const category = this.deliveryItems.find(item => item.id === categoryId);
    if (!category) return 'car-outline';
    if (category.icon === 'bicycle') return 'bicycle-outline';
    if (category.icon === 'bus') return 'bus-outline';
    return 'car-outline';
  }

  toggleAvailability(): void {
    void this.toggleStatus('is_available');
  }

  async toggleStatus(field: string) {
    const adId = this.ad?.id || this.ad?.ad_id;
    if (!adId || !this.ad.details) return;
    const newValue = !this.ad.details[field];
    this.ad.details[field] = newValue;
    this.syncManageCardFaded();
    this.cdr.detectChanges();
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, `ads/${adId}`), { [`details.${field}`]: newValue })
      );
      this.statusToggle.emit({ id: adId, field: field, value: newValue });
    } catch (error) {
      console.error("error:", error);
      this.ad.details[field] = !newValue;
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
      const vehicleName = this.getCategoryName(this.ad.category_id);
      const msg = encodeURIComponent(`السلام عليكم .. محتاج اطلب خدمة نقل وتوصيل (${vehicleName})`);
      const waPhone = this.ad.details?.whatsapp_phone || this.ad.owner_phone;
      window.open(`whatsapp://send?phone=${waPhone}&text=${msg}`, '_system');
    }
  }

  contactAdmin(type: 'pending' | 'rejected' | 'expired', event: Event) {
    event.stopPropagation();
    const adminPhone = '01220883999';
    const deliveryKey = this.ad?.delivery_match_key || this.ad?.category_id || '';
    const ownerPhone = this.ad?.owner_phone || '';

    if (type === 'pending') {
      const msg = encodeURIComponent(`السلام عليكم .. برجاء تفعيل اعلان (${deliveryKey}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    if (type === 'rejected') {
      const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب رفض اعلاني : (${deliveryKey}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب انتهاء اعلاني : (${deliveryKey}) لرقم (${ownerPhone})`);
    window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
  }

  async onEdit() {
    const modal = await this.modalCtrl.create({
      component: DeliveryFormComponent,
      componentProps: {
        editAdData: this.ad 
      },
      mode: 'ios',
      cssClass: 'mota7-modal-style'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data && data.submitted) {
      this.refresh.emit();
    }
  }

 async onDelete() {
    this.delete.emit(this.ad.id || this.ad.ad_id);
  }

  // طلب توثيق الإعلان
  async requestVerification(verificationType: 'gold' | 'blue') {
    const adminPhone = '01220883999';
    const vehicleName = this.getCategoryName(this.ad.category_id);
    const ownerPhone = this.ad?.owner_phone || '';
    
    const verificationName = verificationType === 'gold' ? 'توثيق ذهبي' : 'توثيق أزرق';
    
    const message = `السلام عليكم .. محتاج اوثق اعلاني "${verificationName}" (${vehicleName}) - لرقم (${ownerPhone})`;
    const encodedMessage = encodeURIComponent(message);
    
    window.open(`whatsapp://send?phone=${adminPhone}&text=${encodedMessage}`, '_system');
  }

  // عرض شاشة التوثيق المنبثقة
  async showVerificationModal() {
    const modal = await this.modalCtrl.create({
      component: VerificationModalComponent,
      componentProps: {
        ad: this.ad,
        adType: 'delivery'
      },
      cssClass: 'verification-modal',
      backdropDismiss: true,
    });

    await modal.present();
  }

  coverageDisplay(ad: any): string {
    return formatAdCoverageDisplay(ad ?? {});
  }
}

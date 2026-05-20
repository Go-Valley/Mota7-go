import { Component, OnInit, Input, Output, EventEmitter, inject, DestroyRef, Injector } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  locationOutline, checkmarkCircle, call, logoWhatsapp, 
  timeOutline, shieldCheckmark, carOutline, bicycleOutline, 
  busOutline, airplaneOutline, shieldCheckmarkOutline, ellipsisVerticalOutline,
  calendarOutline, keyOutline, checkmarkDoneCircle, closeCircle
} from 'ionicons/icons';
import { DELIVERY_CATEGORY } from '../../core/constants/delivery-data';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { AppTaxonomyService } from '@mota7-app/core/services/app-taxonomy.service';
import { extractNameBeforeLastUnderscoreFromMatchKey } from '@mota7-app/core/utils/other-category-display.util';
import { buildAdminAdWhatsappMessage } from '../../core/utils/admin-ad-whatsapp-message.util';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { VerificationBadgeComponent } from '../../shared/verification-badge/verification-badge.component';
import { manualSortLevel1to5 } from '../../core/utils/admin-ad-manual-sort.util';
import { formatAdCoverageDisplay } from '../../core/utils/ad-coverage-display.util';

@Component({
  selector: 'app-delivery-card',
  templateUrl: './delivery.html',
  styleUrls: ['./delivery.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, VerificationBadgeComponent]
})
export class DeliveryCard implements OnInit {
  @Input() ad: any;
  /** يُمرَّر من صفحة الإعلانات لتعطيل الإجراءات أثناء وضع التحديد المتعدد */
  @Input() selectionMode = false;
  @Output() manage = new EventEmitter<any>();

  readonly manualSortLevel1to5 = manualSortLevel1to5;

  private alertCtrl = inject(AlertController);
  private firestore = inject(Firestore);
  private toastCtrl = inject(ToastController);
  private injector = inject(Injector);
  private taxonomy: AppTaxonomyService | null = null;
  private destroyRef = inject(DestroyRef);

  private dynamicDeliveryItems: Array<{ id: string; nameAr: string; icon?: string }> = [];

  constructor() {
    addIcons({ 
      locationOutline, checkmarkCircle, call, logoWhatsapp, 
      timeOutline, shieldCheckmark, carOutline, bicycleOutline, 
      busOutline, airplaneOutline, shieldCheckmarkOutline, ellipsisVerticalOutline,
      calendarOutline, keyOutline, checkmarkDoneCircle, closeCircle
    });
  }

  ngOnInit() {
    try {
      this.taxonomy = this.injector.get(AppTaxonomyService);
    } catch (err) {
      this.taxonomy = null;
      console.error('failed to resolve AppTaxonomyService in DeliveryCard:', err);
    }
    if (!this.taxonomy) {
      return;
    }
    this.taxonomy.bundle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => {
        this.dynamicDeliveryItems = (b?.deliveryItems ?? []).map((i: any) => ({
          id: String(i?.id ?? ''),
          nameAr: String(i?.nameAr ?? ''),
          icon: i?.icon != null ? String(i.icon) : undefined,
        })).filter((i) => !!i.id);
      });
  }

  // تعديل دالة الإدارة لتوحيد مسميات الهاتف والاسم للوحة التحكم
  onManage(event: Event) {
    event.stopPropagation();
    if (this.ad) {
      const phoneVal = this.ad.details?.whatsapp_phone || this.ad.owner_phone || '';
      const nameVal = this.ad.details?.driver_name || this.ad.owner_name || 'سائق متاح';

      const adForManage = {
        ...this.ad,
        owner_name: nameVal,
        owner_phone: phoneVal,
        phone: phoneVal, // مسمى إضافي لضمان التوافق مع الأدمن
        whatsapp_phone: phoneVal,
        city: this.ad.city
      };
      this.manage.emit(adForManage);
    }
  }

  // إضافة دالة الاتصال والواتساب
  contact(type: 'call' | 'whatsapp', event: Event) {
    event.stopPropagation();
    const phone = this.ad.details?.whatsapp_phone || this.ad.owner_phone;
    if (!phone) return;

    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else {
      openWhatsappNative(
        phone,
        buildAdminAdWhatsappMessage(this.getCategoryName(this.ad.category_id))
      );
    }
  }

  getCategoryName(categoryId: string): string {
    const id = categoryId || this.ad?.category_id;
    const dyn = this.dynamicDeliveryItems.find((i) => i.id === id);
    if (dyn?.nameAr) return dyn.nameAr;
    const item = DELIVERY_CATEGORY.items.find((i: any) => i.id === id);
    if (item?.nameAr) return item.nameAr;
    const fromKey = extractNameBeforeLastUnderscoreFromMatchKey(this.ad?.delivery_match_key);
    return fromKey || 'خدمة نقل';
  }

  getCategoryIcon(categoryId: string): string {
    const id = categoryId || this.ad?.category_id;
    const dyn = this.dynamicDeliveryItems.find((i) => i.id === id);
    const rawIcon = dyn?.icon;
    if (rawIcon) {
      if (rawIcon === 'bicycle' || rawIcon.includes('bicycle')) return 'bicycle-outline';
      if (rawIcon === 'bus' || rawIcon.includes('bus')) return 'bus-outline';
      return rawIcon.endsWith('-outline') ? rawIcon : `${rawIcon}-outline`;
    }
    const category = DELIVERY_CATEGORY.items.find((i: any) => i.id === id);
    if (!category) return 'car-outline';
    return category.icon === 'bicycle'
      ? 'bicycle-outline'
      : category.icon === 'bus'
        ? 'bus-outline'
        : 'car-outline';
  }

  async onSetExpiry(event: Event) {
    event.stopPropagation();
    
    const currentExpiry = this.ad.expiry_date?.toDate ? this.ad.expiry_date.toDate() : new Date();
    const minDate = new Date().toISOString().split('T')[0];

    const alert = await this.alertCtrl.create({
      header: 'تعديل تاريخ الانتهاء',
      mode: 'ios',
      inputs: [
        {
          name: 'expiry_date',
          type: 'date',
          value: currentExpiry.toISOString().split('T')[0],
          min: minDate
        }
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حفظ',
          handler: async (data) => {
            if (!data.expiry_date) return;
            
            try {
              const newDate = new Date(data.expiry_date);
              const adId = this.ad.ad_id || this.ad.id;
              const adRef = doc(this.firestore, 'ads', adId);
              
              const updateData: any = { expiry_date: newDate };
              
              if (this.ad.status === 'expired' && newDate > new Date()) {
                updateData.status = 'active';
              }

              await updateDoc(adRef, updateData);
              
              this.ad.expiry_date = { toDate: () => newDate };
              if (updateData.status) this.ad.status = updateData.status;

              const toast = await this.toastCtrl.create({
                message: 'تم تحديث تاريخ الانتهاء بنجاح',
                duration: 2000,
                color: 'success',
                mode: 'ios'
              });
              await toast.present();
            } catch (error) {
              console.error('Error updating expiry date:', error);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  coverageDisplay(ad: unknown): string {
    return formatAdCoverageDisplay((ad ?? {}) as any);
  }

  async editAd() {
    if (this.ad) {
      this.manage.emit({
        action: 'edit',
        ad: this.ad
      });
    }
  }
}
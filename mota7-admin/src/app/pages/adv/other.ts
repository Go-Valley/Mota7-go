import { Component, OnInit, Input, Output, EventEmitter, inject, DestroyRef, Injector } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  locationOutline, call, logoWhatsapp, checkmarkCircle, shieldCheckmark,
  checkmarkDoneCircle, closeCircle, hammer, flash, water, colorPalette,
  construct, business, grid, card, tv, flame, carSport, megaphone, cube, cog,
  ellipsisVerticalOutline, calendarOutline
} from 'ionicons/icons';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { buildAdminAdWhatsappMessage } from '../../core/utils/admin-ad-whatsapp-message.util';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { AppTaxonomyService } from '@mota7-app/core/services/app-taxonomy.service';
import {
  OtherCategoryItem,
  resolveOtherCategoryIcon,
  resolveOtherCategoryNameAr,
} from '@mota7-app/core/utils/other-category-display.util';
import { VerificationBadgeComponent } from '../../shared/verification-badge/verification-badge.component';
import { manualSortLevel1to5 } from '../../core/utils/admin-ad-manual-sort.util';
import { formatAdCoverageDisplay } from '../../core/utils/ad-coverage-display.util';

@Component({
  selector: 'app-other-card',
  templateUrl: './other.html',
  styleUrls: ['./other.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, VerificationBadgeComponent]
})
export class OtherCard implements OnInit {
  @Input() ad: any;
  @Input() selectionMode = false;
  @Output() manage = new EventEmitter<any>();

  readonly manualSortLevel1to5 = manualSortLevel1to5;

  // حقن الخدمات اللازمة للتعامل مع التاريخ وقاعدة البيانات
  private alertCtrl = inject(AlertController);
  private firestore = inject(Firestore);
  private toastCtrl = inject(ToastController);
  private injector = inject(Injector);
  private taxonomy: AppTaxonomyService | null = null;
  private destroyRef = inject(DestroyRef);

  /** قائمة الفروع الديناميكية القادمة من Firestore (Categories/other_services) */
  private dynamicOtherItems: OtherCategoryItem[] = [];

  constructor() {
    addIcons({
      locationOutline, call, logoWhatsapp, checkmarkCircle, shieldCheckmark,
      checkmarkDoneCircle, closeCircle, hammer, flash, water, colorPalette,
      construct, business, grid, card, tv, flame, carSport, megaphone, cube, cog,
      ellipsisVerticalOutline, calendarOutline
    });
  }

  ngOnInit() {
    try {
      this.taxonomy = this.injector.get(AppTaxonomyService);
    } catch (err) {
      this.taxonomy = null;
      console.error('failed to resolve AppTaxonomyService in OtherCard:', err);
    }
    if (!this.taxonomy) {
      return;
    }
    this.taxonomy.bundle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => {
        this.dynamicOtherItems = (b?.otherItems ?? []) as OtherCategoryItem[];
      });
  }

  // دالة التواصل عبر الاتصال أو الواتساب
  contact(type: 'call' | 'whatsapp', event: Event) {
    event.stopPropagation();
    const phone = this.ad.owner_phone || this.ad.details?.whatsapp_phone;
    if (!phone) return;

    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else {
      const adLabel = this.ad.details?.service_name || this.getCategoryName();
      openWhatsappNative(phone, buildAdminAdWhatsappMessage(adLabel));
    }
  }

  getCategoryName(_id?: string): string {
    return resolveOtherCategoryNameAr(this.ad, this.dynamicOtherItems);
  }

  getCategoryIcon(_id?: string): string {
    return resolveOtherCategoryIcon(this.ad, this.dynamicOtherItems);
  }

  // تعديل دالة onManage لضمان عدم التضارب مع التاريخ
  onManage(event: Event) {
    event.stopPropagation();
    if (this.ad) {
      this.manage.emit(this.ad);
    }
  }

  // الوظيفة المسؤولة عن تعديل التاريخ عند الضغط
  async onSetExpiry(event: Event) {
    event.stopPropagation();
    
    // تحويل التاريخ الحالي إلى Date object
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
              // تحديد المعرف الصحيح للإعلان
              const adId = this.ad.ad_id || this.ad.id;
              const adRef = doc(this.firestore, 'ads', adId);
              
              const updateData: any = { expiry_date: newDate };
              
              // تحديث الحالة تلقائياً إذا كان منتهياً
              if (this.ad.status === 'expired' && newDate > new Date()) {
                updateData.status = 'active';
              }

              await updateDoc(adRef, updateData);
              
              // تحديث البيانات في الواجهة فوراً
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

  // دالة فتح البروفايل (تأكد من استخدام stopPropagation لمنع تضارب الأحداث)
  openUserProfile(event: Event) {
    event.stopPropagation();
    event.stopImmediatePropagation(); // منع أي تضارب إضافي
    if (this.ad) {
      this.manage.emit({ action: 'view_user', ad: this.ad });
    }
  }
}
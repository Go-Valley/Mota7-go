import { Component, OnInit, Input, Output, EventEmitter, inject, DestroyRef, Injector } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  locationOutline, checkmarkCircle, call, logoWhatsapp, cashOutline,
  shieldCheckmarkOutline, shieldCheckmark, ellipsisVerticalOutline, calendarOutline,
  pricetagOutline
} from 'ionicons/icons';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { buildAdminAdWhatsappMessage } from '../../core/utils/admin-ad-whatsapp-message.util';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { AppTaxonomyService } from '@mota7-app/core/services/app-taxonomy.service';
import { PRODUCTS_CATEGORY } from '@mota7-app/core/constants/products-data';
import { extractEducationStageArFromPlusMatchKey } from '@mota7-app/core/utils/other-category-display.util';
import { VerificationBadgeComponent } from '../../shared/verification-badge/verification-badge.component';
import { manualSortLevel1to5 } from '../../core/utils/admin-ad-manual-sort.util';
import { formatAdCoverageDisplay } from '../../core/utils/ad-coverage-display.util';

@Component({
  selector: 'app-product-card',
  templateUrl: './product.html',
  styleUrls: ['./product.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, VerificationBadgeComponent]
})
export class ProductCard implements OnInit {
  @Input() ad: any;
  @Input() selectionMode = false;
  @Output() manage = new EventEmitter<any>();

  readonly manualSortLevel1to5 = manualSortLevel1to5;
  displayName: string = 'متاح';

  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private firestore = inject(Firestore);
  private toastCtrl = inject(ToastController);
  private injector = inject(Injector);
  private taxonomy: AppTaxonomyService | null = null;
  private destroyRef = inject(DestroyRef);

  /** من Firestore (Categories/products) — يشمل subcategories للعرض المتوافق مع التصنيف الحالي */
  private dynamicProductItems: Array<{
    id: string;
    nameAr: string;
    subcategories: string[];
  }> = [];

  constructor() {
    addIcons({ 
      locationOutline, checkmarkCircle, call, logoWhatsapp, 
      cashOutline, shieldCheckmarkOutline, shieldCheckmark, ellipsisVerticalOutline,
      calendarOutline, pricetagOutline
    });
  }

  ngOnInit() {
    this.setDisplayName();
    try {
      this.taxonomy = this.injector.get(AppTaxonomyService);
    } catch (err) {
      this.taxonomy = null;
      console.error('failed to resolve AppTaxonomyService in ProductCard:', err);
    }
    if (!this.taxonomy) {
      return;
    }
    this.taxonomy.bundle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => {
        this.dynamicProductItems = (b?.productItems ?? [])
          .map((i: any) => ({
            id: String(i?.id ?? ''),
            nameAr: String(i?.nameAr ?? ''),
            subcategories: Array.isArray(i?.subcategories)
              ? i.subcategories.map((s: unknown) => String(s ?? ''))
              : [],
          }))
          .filter((i) => !!i.id);
      });
  }

  /**
   * إعلانات قديمة تحتفظ بـ sub_category_name = «منتجات أخرى غير مذكورة» بينما التصنيفات على Firestore
   * تُحدَّث إلى «منتجات متنوعة». نعرض الاسم الحالي من التصنيف عند التطابق.
   */
  private resolveProductSubcategoryLabel(
    categoryId: string | undefined,
    storedSub: string,
    dyn: { id: string; nameAr: string; subcategories: string[] } | undefined
  ): string {
    if (!storedSub) return '';
    const staticCat = categoryId
      ? PRODUCTS_CATEGORY.items.find((c) => c.id === categoryId)
      : undefined;
    const subs =
      dyn?.subcategories?.length ? dyn.subcategories : staticCat?.subcategories || [];
    if (subs.includes(storedSub)) return storedSub;
    const legacyOtherSub = 'منتجات أخرى غير مذكورة';
    if (storedSub === legacyOtherSub && subs.length > 0) {
      return subs.find((s) => s === 'منتجات متنوعة') ?? subs[0];
    }
    return storedSub;
  }

  /** عرض القسم الرئيسي والفرعي كما في التطبيق (بعد تحميل التصنيف من Firestore) */
  productTaxonomyLabel(): string {
    const id = this.ad?.category_id;
    const dyn = id ? this.dynamicProductItems.find((i) => i.id === id) : undefined;
    const main =
      dyn?.nameAr ||
      PRODUCTS_CATEGORY.items.find((c) => c.id === id)?.nameAr ||
      (id ? extractEducationStageArFromPlusMatchKey(this.ad?.product_match_key) : '') ||
      '';
    const subRaw = (this.ad?.sub_category_name || '').trim();
    const sub = this.resolveProductSubcategoryLabel(id, subRaw, dyn);
    if (main && sub) return `${main} · ${sub}`;
    if (main) return main;
    if (sub) return sub;
    return 'منتجات';
  }

  setDisplayName() {
    if (this.ad?.owner_name && this.ad.owner_name !== 'مستخدم متاح') {
      this.displayName = this.ad.owner_name;
    } else if (this.ad?.details?.owner_name && this.ad.details.owner_name !== 'مستخدم متاح') {
      this.displayName = this.ad.details.owner_name;
    } else {
      this.displayName = 'متاح';
    }
  }

  // دالة التواصل عبر الاتصال أو الواتساب
  contact(type: 'call' | 'whatsapp', event: Event) {
    event.stopPropagation();
    const phone = this.ad.owner_phone || this.ad.details?.phone;
    if (!phone) return;

    if (type === 'call') {
      window.open(`tel:${phone}`, '_system');
    } else {
      const adLabel =
        this.ad.details?.title || this.ad.details?.short_desc || 'منتج متاح';
      openWhatsappNative(phone, buildAdminAdWhatsappMessage(adLabel));
    }
  }

  // دالة فتح البروفايل (عن طريق الضغط على التاريخ) - حل مشكلة التضارب
  openUserProfile(event: Event) {
    event.stopPropagation();
    event.stopImmediatePropagation(); // منع أي تضارب مع أحداث الأب
    if (this.ad) {
      this.manage.emit({ action: 'view_user', ad: this.ad });
    }
  }

  onManage(event: Event) {
    event.stopPropagation();
    this.manage.emit(this.ad);
  }

  async editExpiry(event: Event) {
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
              const adRef = doc(this.firestore, 'ads', this.ad.ad_id || this.ad.id);
              
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
              console.error(error);
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

  onProductShellClick(): void {
    if (this.selectionMode) {
      return;
    }
    void this.openDetails();
  }

  async openDetails() {
    const modal = await this.modalCtrl.create({
      component: ProductDetailsModalComponent,
      componentProps: { ad: this.ad, ownerName: this.displayName },
      backdropDismiss: true,
      showBackdrop: true
    });
    await modal.present();
  }
}

@Component({
  selector: 'app-product-details-modal',
  template: `
    <ion-content class="product-details-modal" (click)="close()">
      <div class="modal-body">
        <div class="images-grid" *ngIf="ad?.details?.images?.length">
          <img
            *ngFor="let img of ad.details.images"
            [src]="img"
            (error)="$any($event.target).src = 'assets/mota7.png'"
            alt="صورة المنتج"
          />
        </div>

        <div class="section">
          <div class="title">{{ ad?.details?.title || ad?.details?.short_desc }}</div>
          <div class="desc">{{ ad?.details?.short_desc }}</div>
          <div class="full">{{ ad?.details?.full_details || 'لا يوجد وصف إضافي متوفر.' }}</div>
        </div>

        <div class="meta">
          <div class="item"><span class="label">بواسطة:</span><span class="value">{{ ownerName || ad?.owner_name || ad?.details?.owner_name || 'مستخدم متاح' }}</span></div>
          <div class="item"><span class="label">السعر:</span><span class="value">{{ ad?.details?.price }} ج.م</span></div>
          <div class="item"><span class="label">الحالة:</span><span class="value">{{ ad?.details?.condition || 'جديد' }}</span></div>
          <div class="item"><span class="label">المدينة:</span><span class="value">{{ locationLine() }}</span></div>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .product-details-modal {
        --background: rgba(0, 0, 0, 0.35);
        padding: 16px;
      }
      .modal-body {
        background: #ffffff;
        border-radius: 20px;
        padding: 16px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }
      .images-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
        margin-bottom: 12px;
      }
      .images-grid img {
        width: 100%;
        height: 110px;
        object-fit: cover;
        border-radius: 12px;
      }
      .section .title {
        font-size: 1.1rem;
        font-weight: 800;
        color: #1a1a1a;
        margin-bottom: 6px;
      }
      .section .desc {
        font-size: 1rem;
        font-weight: 700;
        color: #333;
        margin-bottom: 8px;
      }
      .section .full {
        font-size: 0.95rem;
        font-weight: 700;
        color: #444;
        line-height: 1.6;
      }
      .meta {
        margin-top: 12px;
        display: grid;
        gap: 6px;
      }
      .meta .item {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 0.95rem;
        font-weight: 700;
        color: #1a1a1a;
      }
      .meta .label {
        color: #8a8a8a;
        font-weight: 700;
      }
      .meta .value {
        color: #1a1a1a;
      }
    `
  ],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class ProductDetailsModalComponent {
  @Input() ad: any;
  @Input() ownerName: string = '';

  private modalCtrl = inject(ModalController);

  locationLine(): string {
    return formatAdCoverageDisplay(this.ad ?? {});
  }

  close() {
    this.modalCtrl.dismiss();
  }
}
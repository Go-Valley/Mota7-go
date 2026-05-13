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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ModalController } from '@ionic/angular'; // أضفنا ModalController
import { addIcons } from 'ionicons';
import { VerificationModalComponent } from '../verification-modal.component';
import { 
  trashOutline, createOutline, locationOutline, checkmarkCircle, 
  call, logoWhatsapp, alertCircleOutline, schoolOutline, 
  bookOutline, checkmarkDoneCircle, closeCircle, shieldCheckmark, shieldCheckmarkOutline 
} from 'ionicons/icons';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { EDUCATION_CATEGORY } from '../../../../core/constants/educational-data';
// استيراد الفورم لفتحه كمودال
import { EducationFormComponent } from './education-form.component';
import { AdCardEngagementRowComponent } from '../../../../home/shared/ad-card-engagement-row.component';
import { computeMyAdManageCardFaded } from '../shared/my-ad-manage-card-fade.util';
import { VerificationBadgeComponent } from '../../../../shared/verification-badge/verification-badge.component';
import { formatAdCoverageDisplay } from 'src/app/core/utils/governorate-city-display.util';

@Component({
  selector: 'app-education-card',
  templateUrl: './education-card.component.html',
  styleUrls: ['./education-card.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, AdCardEngagementRowComponent, VerificationBadgeComponent],
})
export class EducationCardComponent implements OnInit, OnChanges {
  @Input() ad: any;
  @Output() delete = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();

  /** يُربَط بـ is-unavailable لتحديث فوري للبهتان */
  manageCardFaded = false;

  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    addIcons({ 
      trashOutline, createOutline, locationOutline, checkmarkCircle, 
      call, logoWhatsapp, alertCircleOutline, schoolOutline, 
      bookOutline, checkmarkDoneCircle, closeCircle, shieldCheckmark, shieldCheckmarkOutline 
    });
  }

  ngOnInit() {
    this.syncManageCardFaded();
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

  getStageName(stageId: string): string {
    if (!stageId) return 'خدمة تعليمية';
    const stage = EDUCATION_CATEGORY.items.find(item => item.id === stageId);
    return stage ? stage.nameAr : 'خدمة تعليمية';
  }

  getCategoryIcon(id: string): string {
    switch (id) {
      case 'kindergarten': return 'school-outline';
      case 'primary': return 'book-outline';
      case 'preparatory': return 'school-outline';
      case 'secondary': return 'book-outline';
      default: return 'school-outline';
    }
  }

  // تحديث: الحقل في الفايربيز هو root field وليس داخل details
  async toggleStatus() {
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
    } catch (e) {
      console.error("فشل تحديث الحالة من لوحة التحكم", e);
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
    } else {
      const stageName = this.getStageName(this.ad.category_id);
      const subject = this.ad.details?.subject || '';
      const msg = encodeURIComponent(`السلام عليكم .. محتاج اطلب خدمة تعليمية (${stageName} - مادة ${subject})`);
      
      // تحديث: استخدام whatsapp_phone من داخل details إذا وجد
      const waPhone = this.ad.details?.whatsapp_phone || phone;
      window.open(`whatsapp://send?phone=${waPhone}&text=${msg}`, '_system');
    }
  }

  contactAdmin(type: 'pending' | 'rejected' | 'expired', event: Event) {
    event.stopPropagation();
    const adminPhone = '01220883999';
    const educationKey = this.ad?.education_match_key || this.ad?.category_id || '';
    const ownerPhone = this.ad?.owner_phone || '';

    if (type === 'pending') {
      const msg = encodeURIComponent(`السلام عليكم .. برجاء تفعيل اعلان (${educationKey}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    if (type === 'rejected') {
      const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب رفض اعلاني : (${educationKey}) لرقم (${ownerPhone})`);
      window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
      return;
    }

    const msg = encodeURIComponent(`السلام عليكم .. بستفسر عن سبب انتهاء اعلاني : (${educationKey}) لرقم (${ownerPhone})`);
    window.open(`whatsapp://send?phone=${adminPhone}&text=${msg}`, '_system');
  }

  async onEdit() {
    const modal = await this.modalCtrl.create({
      component: EducationFormComponent,
      componentProps: { editAdData: this.ad },
      mode: 'ios',
      cssClass: 'mota7-modal-style'
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data && data.submitted) this.refresh.emit();
  }

  onDelete() {
    this.delete.emit(this.ad.ad_id);
  }

  async showVerificationModal() {
    const modal = await this.modalCtrl.create({
      component: VerificationModalComponent,
      componentProps: {
        ad: this.ad,
        adType: 'education'
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

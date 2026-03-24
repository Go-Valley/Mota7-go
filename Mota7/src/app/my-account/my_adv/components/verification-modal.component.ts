import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY } from '../../../core/utils/hardware-back-my-account.util';

/** أعلى من subscribeHardwareBackToMyAccount حتى زر الرجوع يغلق المودال ولا يحرّك الصفحة خلفه */
const VERIFICATION_MODAL_BACK_PRIORITY = HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY + 100;

@Component({
  selector: 'app-verification-modal',
  templateUrl: './verification-modal.component.html',
  styleUrls: ['./verification-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class VerificationModalComponent implements OnInit, OnDestroy {
  private modalCtrl = inject(ModalController);
  private platform = inject(Platform);

  @Input() ad: any;
  @Input() adType: string = '';

  private backButtonSub?: Subscription;

  ngOnInit(): void {
    this.backButtonSub = this.platform.backButton.subscribeWithPriority(
      VERIFICATION_MODAL_BACK_PRIORITY,
      () => {
        void this.modalCtrl.dismiss();
      }
    );
  }

  ngOnDestroy(): void {
    this.backButtonSub?.unsubscribe();
    this.backButtonSub = undefined;
  }

  /**
   * نفس منطق app.component: رقم دولي لـ WhatsApp (مصر 20…).
   * على الأصلي: AppLauncher مباشرة — يفتح تطبيق واتساب ولا يمرّر WebView إلى api.whatsapp.com.
   */
  async requestVerification(verificationType: 'gold' | 'blue'): Promise<void> {
    const adminPhone = '01220883999';

    const adTitle = this.getAdTitle();
    const ownerPhone = this.ad?.owner_phone || 'رقم غير متوفر';
    const verificationName = verificationType === 'gold' ? 'توثيق ذهبي' : 'توثيق أزرق';

    const message = `السلام عليكم .. محتاج اوثق اعلاني "${verificationName}" (${adTitle}) - لرقم (${ownerPhone})`;
    const waPhone = this.normalizeWhatsappPhone(adminPhone);
    const textParam = encodeURIComponent(message);
    const waUrl = `whatsapp://send?phone=${waPhone}&text=${textParam}`;

    if (Capacitor.isNativePlatform()) {
      try {
        await AppLauncher.openUrl({ url: waUrl });
      } catch {
        /* لا نفتح صفحة ويب داخل WebView — المستخدم يثبت/يصلح واتساب */
      }
    } else {
      window.open(waUrl, '_system');
    }

    setTimeout(() => this.closeModal(), 500);
  }

  private normalizeWhatsappPhone(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) return digits.slice(2);
    if (digits.startsWith('20')) return digits;
    if (digits.startsWith('2') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length >= 10) return `20${digits.slice(1)}`;
    if (digits.startsWith('1') && digits.length === 10) return `20${digits}`;
    return digits;
  }

  private getAdTitle(): string {
    if (!this.ad) return 'إعلان غير معروف';

    switch (this.adType) {
      case 'delivery':
        return this.ad.delivery_match_key || this.ad.details?.vehicle_name || this.ad.category_id || 'خدمة توصيل';

      case 'education':
        return this.ad.education_match_key || this.ad.details?.subject || this.ad.category_id || 'خدمة تعليمية';

      case 'product':
        return this.ad.short_desc || this.ad.details?.short_desc || this.ad.details?.title || 'منتج';

      case 'store':
        return this.ad.store_name || this.ad.details?.store_name || 'متجر';

      case 'other':
        return this.ad.other_match_key || this.ad.details?.service_name || this.ad.category_id || 'خدمة أخرى';

      default:
        return this.ad.owner_name || 'إعلان';
    }
  }

  closeModal(): void {
    void this.modalCtrl.dismiss();
  }
}

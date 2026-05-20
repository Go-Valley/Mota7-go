import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  logoWhatsapp,
  diamondOutline,
  alertCircleOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY } from '../../../../core/utils/hardware-back-my-account.util';
import type { OwnerAdQuotaGateState } from '../../../../core/utils/user-ad-quota.util';
import { openWhatsappNative } from '../../../../core/utils/whatsapp-open.util';
import {
  buildAddAdQuotaAdminWhatsAppMessage,
  QUOTA_ADMIN_WHATSAPP_PHONE,
} from '../../../../core/utils/user-ad-quota.util';

export type AddAdQuotaGateModalResult =
  | 'close'
  | 'subscriptions'
  | 'admin_whatsapp';

/** أولوية زر الرجوع — إغلاق المودال دون الرجوع من الصفحة */
const QUOTA_GATE_MODAL_BACK_PRIORITY =
  HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY + 150;

const PACKAGE_HIGHLIGHT_IN_QUOTES: Record<string, string> = {
  free: 'المجانية',
  bronze: 'البرونزية',
  silver: 'الفضية',
  golden: 'الذهبية',
  Diamonds: 'الماسية',
  vip: 'VIP',
};

const TOP_TIER_MESSAGE_AR =
  'أنت على أعلى باقة في مُتاح — اشتراكك الحالي يمنح إعلاناتك حضوراً أوسع في التطبيق وفرصة أكبر لاستقبال طلبات العملاء باستمرار.';

@Component({
  selector: 'app-add-ad-quota-gate-modal',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './add-ad-quota-gate-modal.component.html',
  styleUrls: ['./add-ad-quota-gate-modal.component.scss'],
})
export class AddAdQuotaGateModalComponent implements OnInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(Platform);

  @Input({ required: true }) gate!: OwnerAdQuotaGateState;

  readonly topTierMessageAr = TOP_TIER_MESSAGE_AR;

  private backButtonSub?: Subscription;

  constructor() {
    addIcons({
      'close-outline': closeOutline,
      'logo-whatsapp': logoWhatsapp,
      'diamond-outline': diamondOutline,
      'alert-circle-outline': alertCircleOutline,
      'information-circle-outline': informationCircleOutline,
    });
  }

  ngOnInit(): void {
    this.backButtonSub = this.platform.backButton.subscribeWithPriority(
      QUOTA_GATE_MODAL_BACK_PRIORITY,
      () => this.close()
    );
  }

  ngOnDestroy(): void {
    this.backButtonSub?.unsubscribe();
    this.backButtonSub = undefined;
  }

  get isNoSubscription(): boolean {
    return this.gate.variant === 'no_subscription';
  }

  get isAtLimit(): boolean {
    return this.gate.variant === 'at_limit';
  }

  get isWithinLimit(): boolean {
    return this.gate.variant === 'within_limit';
  }

  /** ماسي / VIP — أعلى باقة، بدون دعوة للترقية */
  get isTopTier(): boolean {
    const t = this.gate.effectiveTier;
    return t === 'Diamonds' || t === 'vip';
  }

  /** من البرونزي فما فوق */
  get showRemainingAds(): boolean {
    if (this.isNoSubscription) {
      return false;
    }
    const t = this.gate.effectiveTier;
    return (
      t === 'bronze' ||
      t === 'silver' ||
      t === 'golden' ||
      t === 'Diamonds' ||
      t === 'vip'
    );
  }

  get remainingAdsCount(): number {
    return Math.max(0, this.gate.maxAllowedAds - this.gate.activeAdsCount);
  }

  get packageHighlightAr(): string {
    return (
      PACKAGE_HIGHLIGHT_IN_QUOTES[this.gate.effectiveTier] ??
      this.gate.packageNameAr
    );
  }

  close(): void {
    void this.modalCtrl.dismiss('close' satisfies AddAdQuotaGateModalResult);
  }

  openSubscriptions(): void {
    void this.modalCtrl.dismiss(
      'subscriptions' satisfies AddAdQuotaGateModalResult
    );
  }

  contactAdmin(): void {
    const msg = buildAddAdQuotaAdminWhatsAppMessage(this.gate);
    openWhatsappNative(QUOTA_ADMIN_WHATSAPP_PHONE, msg);
    void this.modalCtrl.dismiss(
      'admin_whatsapp' satisfies AddAdQuotaGateModalResult
    );
  }
}

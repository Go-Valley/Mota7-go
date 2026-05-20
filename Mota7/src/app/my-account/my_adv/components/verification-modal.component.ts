import {
  Component,
  EnvironmentInjector,
  inject,
  Input,
  OnDestroy,
  OnInit,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ModalController,
  Platform,
  ToastController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import { closeOutline, logoWhatsapp } from 'ionicons/icons';
import { HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY } from '../../../core/utils/hardware-back-my-account.util';
import { openWhatsappNative } from '../../../core/utils/whatsapp-open.util';
import { normalizeSubscriptionsConfig } from '../../../core/models/subscriptions-config.model';
import { adTitleForUserDisplay } from '../../../core/utils/ad-display-title.util';

/**
 * أعلى من معالج الطبقات (100) والتنقل إلى «حسابي» على صفحات التبويب (50)،
 * ليُغلق توثيق VIP فقط دون رجوع الصفحة.
 */
const VERIFICATION_MODAL_BACK_PRIORITY =
  HARDWARE_BACK_TO_MY_ACCOUNT_PRIORITY + 200;

const LEVEL_NAMES: Record<number, string> = {
  1: 'أول',
  2: 'ثاني',
  3: 'ثالث',
  4: 'رابع',
  5: 'خامس',
};

@Component({
  selector: 'app-verification-modal',
  templateUrl: './verification-modal.component.html',
  styleUrls: ['./verification-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class VerificationModalComponent implements OnInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(Platform);
  private readonly toastCtrl = inject(ToastController);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  @Input() ad: unknown;
  @Input() adType = '';

  businessWhatsapp = '';
  vipPrices: number[] = [50, 45, 40, 35, 30];

  private backButtonSub?: Subscription;

  ngOnInit(): void {
    addIcons({ 'close-outline': closeOutline, 'logo-whatsapp': logoWhatsapp });
    void this.loadSubsConfig();
    this.backButtonSub = this.platform.backButton.subscribeWithPriority(
      VERIFICATION_MODAL_BACK_PRIORITY,
      () => {
        void (async () => {
          try {
            const top = await this.modalCtrl.getTop();
            if (top) {
              await top.dismiss();
              return;
            }
            await this.modalCtrl.dismiss();
          } catch {
            try {
              await this.modalCtrl.dismiss();
            } catch {
              /* ignore */
            }
          }
        })();
      }
    );
  }

  ngOnDestroy(): void {
    this.backButtonSub?.unsubscribe();
    this.backButtonSub = undefined;
  }

  private async loadSubsConfig(): Promise<void> {
    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'subscriptions', 'config'))
      );
      if (!snap.exists()) return;
      const cfg = normalizeSubscriptionsConfig(
        snap.data() as Record<string, unknown>
      );
      this.businessWhatsapp = (
        cfg.subscription_orders_whatsapp ?? ''
      ).trim();
      this.vipPrices = [
        cfg.vip_pin_price_level_1 ?? 50,
        cfg.vip_pin_price_level_2 ?? 45,
        cfg.vip_pin_price_level_3 ?? 40,
        cfg.vip_pin_price_level_4 ?? 35,
        cfg.vip_pin_price_level_5 ?? 30,
      ];
    } catch (e) {
      console.error('verification-modal subs config', e);
    }
  }

  private adRecord(): Record<string, unknown> {
    return (this.ad ?? {}) as Record<string, unknown>;
  }

  private ownerPhone(): string {
    const o = this.adRecord()['owner_phone'];
    return String(o ?? '').trim() || 'غير متوفر';
  }

  /**
   * Sends a WhatsApp message for a specific VIP level (1–5).
   * Format: السلام عليكم .. عايز اوثق اعلاني «عنوان» - توثيق VIP مستوى أول
   *         - لرقم «هاتف» - لمدة 10 أيام - بمبلغ «سعر»
   */
  async sendVipRequest(level: number): Promise<void> {
    const biz = this.businessWhatsapp.trim() || '01220883999';
    const title = this.getAdTitle();
    const phone = this.ownerPhone();
    const price = this.vipPrices[level - 1] ?? 0;
    const levelName = LEVEL_NAMES[level] ?? String(level);

    const msg =
      `السلام عليكم .. عايز اوثق اعلاني "${title}"` +
      ` - توثيق VIP مستوى ${levelName}` +
      ` - لرقم "${phone}"` +
      ` - لمدة 10 أيام` +
      ` - بمبلغ "${price} جم"`;

    openWhatsappNative(biz, msg);
    setTimeout(() => this.closeModal(), 450);
  }

  getAdTitle(): string {
    const a = this.adRecord();
    let raw = '';
    switch (this.adType) {
      case 'delivery':
        raw = String(
          a['delivery_match_key'] ??
            (a['details'] as Record<string, unknown>)?.['vehicle_name'] ??
            a['category_id'] ??
            'خدمة توصيل'
        );
        break;
      case 'education':
        raw = String(
          a['education_match_key'] ??
            (a['details'] as Record<string, unknown>)?.['subject'] ??
            a['category_id'] ??
            'خدمة تعليمية'
        );
        break;
      case 'product':
        raw = String(
          (a['details'] as Record<string, unknown>)?.['short_desc'] ??
            (a['details'] as Record<string, unknown>)?.['title'] ??
            'منتج'
        );
        break;
      case 'store':
        raw = String(
          a['store_name'] ??
            (a['details'] as Record<string, unknown>)?.['store_name'] ??
            'متجر'
        );
        break;
      case 'other':
        raw = String(
          a['other_match_key'] ??
            (a['details'] as Record<string, unknown>)?.['service_name'] ??
            a['category_id'] ??
            'خدمة'
        );
        break;
      default:
        raw = String(a['owner_name'] ?? 'إعلان');
    }
    return adTitleForUserDisplay(raw, this.adType);
  }

  closeModal(): void {
    void this.modalCtrl.dismiss();
  }
}

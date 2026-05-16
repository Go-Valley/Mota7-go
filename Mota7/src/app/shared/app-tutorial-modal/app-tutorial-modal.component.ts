import { CommonModule, DOCUMENT } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { ActionSheetController, IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  callOutline,
  closeOutline,
  logoWhatsapp,
} from 'ionicons/icons';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';

export type AppTutorialModalMode = 'full' | 'request' | 'provider';

@Component({
  selector: 'app-tutorial-modal',
  templateUrl: './app-tutorial-modal.component.html',
  styleUrls: ['./app-tutorial-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class AppTutorialModalComponent {
  @Input() isOpen = false;
  /** full = الدليل الكامل | request | provider = قسم واحد فقط */
  @Input() mode: AppTutorialModalMode = 'full';
  @Output() closed = new EventEmitter<void>();

  private readonly document = inject(DOCUMENT);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private contactSheetOpen = false;

  constructor() {
    addIcons({
      'call-outline': callOutline,
      'close-outline': closeOutline,
      'logo-whatsapp': logoWhatsapp,
    });
  }

  get modalTitle(): string {
    if (this.mode === 'request') {
      return 'ازاي تطلب خدمة';
    }
    if (this.mode === 'provider') {
      return 'ازاي تعرض إعلانك';
    }
    return 'ازاي تستخدم التطبيق';
  }

  get modalCssClass(): string {
    if (this.mode === 'request') {
      return 'app-tutorial-modal app-tutorial-modal--request';
    }
    if (this.mode === 'provider') {
      return 'app-tutorial-modal app-tutorial-modal--provider';
    }
    return 'app-tutorial-modal';
  }

  assetUrl(relativePath: string): string {
    try {
      const base = this.document.baseURI || '/';
      return new URL(relativePath, base).href;
    } catch {
      return relativePath;
    }
  }

  emitClose(): void {
    this.closed.emit();
  }

  async openContactAdmin(): Promise<void> {
    if (this.contactSheetOpen) {
      return;
    }
    this.contactSheetOpen = true;
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'للاستفسار أو الدعم الفني تواصل معنا',
      subHeader: 'اختر الوسيلة المناسبة للتواصل معنا',
      mode: 'ios',
      cssClass: 'mota7-premium-sheet',
      backdropDismiss: true,
      buttons: [
        {
          text: 'الاتصال هاتفي',
          icon: 'call-outline',
          handler: () => {
            window.open('tel:01220883999', '_self');
          },
        },
        {
          text: 'تواصل عبر واتساب',
          icon: 'logo-whatsapp',
          handler: () => {
            openWhatsappNative(
              '201220883999',
              'مرحبا .. اريد التواصل مع الدعم الفني'
            );
          },
        },
        {
          text: 'إلغاء',
          role: 'cancel',
          icon: 'close-outline',
        },
      ],
    });
    void actionSheet.onDidDismiss().then(() => {
      this.contactSheetOpen = false;
    });
    await actionSheet.present();
  }
}

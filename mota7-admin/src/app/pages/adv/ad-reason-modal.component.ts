import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';

/**
 * مودال لإدخال سبب الرفض/الإيقاف — بدلاً من ion-alert + textarea الذي يقصّ النص في كثير من المنصات.
 */
@Component({
  selector: 'app-ad-reason-modal',
  templateUrl: './ad-reason-modal.component.html',
  styleUrls: ['./ad-reason-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
})
export class AdReasonModalComponent implements OnInit {
  @Input() headerTitle = '';
  /** اختياري — تعبئة مسبقة عند فتح المودال */
  @Input() initialReason = '';

  reasonText = '';

  ngOnInit(): void {
    if (this.initialReason) {
      this.reasonText = this.initialReason;
    }
  }

  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);

  cancel(): void {
    void this.modalCtrl.dismiss(undefined, 'cancel');
  }

  async save(): Promise<void> {
    const reason = this.reasonText ?? '';
    if (!reason.trim()) {
      const t = await this.toastCtrl.create({
        message: 'يرجى كتابة السبب',
        duration: 2200,
        color: 'warning',
        position: 'bottom',
      });
      await t.present();
      return;
    }
    void this.modalCtrl.dismiss({ reason }, 'confirm');
  }
}

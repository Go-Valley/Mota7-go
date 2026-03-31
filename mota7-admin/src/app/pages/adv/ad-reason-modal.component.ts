import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, Platform, ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { readIonTextInputValueFromEvent } from '../../core/utils/ion-text-input.util';

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
export class AdReasonModalComponent implements OnInit, OnDestroy {
  @Input() headerTitle = '';
  /** اختياري — تعبئة مسبقة عند فتح المودال */
  @Input() initialReason = '';

  reasonText = '';

  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private platform = inject(Platform);
  private backButtonSub?: Subscription;

  ngOnInit(): void {
    if (this.initialReason) {
      this.reasonText = this.initialReason;
    }
    /** أولوية أعلى من التنقل الافتراضي حتى يُغلق المودال بدل الرجوع من الصفحة خلفه. */
    this.backButtonSub = this.platform.backButton.subscribeWithPriority(100, () => {
      void this.modalCtrl.dismiss(undefined, 'cancel');
    });
  }

  ngOnDestroy(): void {
    this.backButtonSub?.unsubscribe();
  }

  /** قراءة من الـ native input لتفادي تعارض الحذف مع ngModel ثنائي الاتجاه على الموبايل. */
  onReasonIonInput(ev: Event): void {
    const v = readIonTextInputValueFromEvent(ev);
    if (this.reasonText === v) {
      return;
    }
    this.reasonText = v;
  }

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

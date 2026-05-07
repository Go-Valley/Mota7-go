import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  ModalController,
  ToastController,
} from '@ionic/angular';

export type DateRangePickerResult = {
  fromIsoDate: string;
  untilIsoDate: string;
};

@Component({
  selector: 'app-date-range-picker-modal',
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">إلغاء</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p class="sub" *ngIf="subtitle">{{ subtitle }}</p>

      <ion-item lines="none" class="dt-block">
        <ion-label position="stacked">تاريخ البداية</ion-label>
        <ion-datetime
          presentation="date"
          preferWheel="false"
          [value]="fromValue"
          (ionChange)="onFromChange($event)"
          locale="ar"
        ></ion-datetime>
      </ion-item>

      <ion-item lines="none" class="dt-block">
        <ion-label position="stacked">تاريخ النهاية</ion-label>
        <ion-datetime
          presentation="date"
          preferWheel="false"
          [value]="untilValue"
          (ionChange)="onUntilChange($event)"
          locale="ar"
        ></ion-datetime>
      </ion-item>

      <ion-button expand="block" class="confirm-btn" (click)="confirm()">
        {{ confirmLabel }}
      </ion-button>
      <ion-button
        *ngIf="allowWithoutDates"
        expand="block"
        fill="clear"
        color="medium"
        (click)="skipDates()"
      >
        بدون تحديد تواريخ
      </ion-button>
    </ion-content>
  `,
  styles: [
    `
      .sub {
        margin: 0 0 12px;
        font-size: 14px;
        opacity: 0.85;
      }
      .dt-block {
        --padding-start: 0;
        --inner-padding-end: 0;
        margin-bottom: 8px;
        display: block;
      }
      ion-datetime {
        max-width: 100%;
      }
      .confirm-btn {
        margin-top: 16px;
      }
    `,
  ],
})
export class DateRangePickerModalComponent implements OnInit {
  @Input() title = 'التواريخ';
  @Input() subtitle = '';
  @Input() confirmLabel = 'تأكيد';
  /** عند true يعرض زر «بدون تحديد تواريخ» ويرجع null من dismiss */
  @Input() allowWithoutDates = false;
  @Input() initialFrom: string | null = null;
  @Input() initialUntil: string | null = null;

  fromValue = '';
  untilValue = '';

  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);

  ngOnInit(): void {
    const today = this.todayYyyyMmDd();
    const f = this.toYyyyMmDd(this.initialFrom) ?? today;
    const u = this.toYyyyMmDd(this.initialUntil) ?? today;
    this.fromValue = f;
    this.untilValue = u;
  }

  private todayYyyyMmDd(): string {
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  }

  private toYyyyMmDd(raw: string | null | undefined): string | null {
    if (raw == null || !String(raw).trim()) {
      return null;
    }
    const part = String(raw).split('T')[0]?.trim() ?? '';
    return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null;
  }

  onFromChange(ev: Event): void {
    const v = (ev as CustomEvent<{ value: string | string[] | null }>).detail
      ?.value;
    const s = Array.isArray(v) ? v[0] : v;
    const d = this.toYyyyMmDd(s ?? '');
    if (d) {
      this.fromValue = d;
    }
  }

  onUntilChange(ev: Event): void {
    const v = (ev as CustomEvent<{ value: string | string[] | null }>).detail
      ?.value;
    const s = Array.isArray(v) ? v[0] : v;
    const d = this.toYyyyMmDd(s ?? '');
    if (d) {
      this.untilValue = d;
    }
  }

  cancel(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  skipDates(): void {
    void this.modalCtrl.dismiss(null, 'skip');
  }

  async confirm(): Promise<void> {
    const from = this.toYyyyMmDd(this.fromValue);
    const until = this.toYyyyMmDd(this.untilValue);
    if (!from || !until) {
      const t = await this.toastCtrl.create({
        message: 'اختر تاريخ البداية والنهاية من التقويم',
        duration: 2200,
        position: 'bottom',
        color: 'warning',
        mode: 'ios',
      });
      await t.present();
      return;
    }
    if (from > until) {
      const t = await this.toastCtrl.create({
        message: 'تاريخ البداية بعد تاريخ النهاية',
        duration: 2200,
        position: 'bottom',
        color: 'danger',
        mode: 'ios',
      });
      await t.present();
      return;
    }
    const payload: DateRangePickerResult = {
      fromIsoDate: from,
      untilIsoDate: until,
    };
    void this.modalCtrl.dismiss(payload, 'confirm');
  }
}

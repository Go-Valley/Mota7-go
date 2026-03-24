import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';

const AUTO_DISMISS_MS = 5000;

@Component({
  selector: 'app-thank-you-modal',
  templateUrl: './thank-you-modal.component.html',
  styleUrls: ['./thank-you-modal.component.scss'],
  standalone: false
})
export class ThankYouModalComponent implements OnInit, OnDestroy {
  private modalCtrl = inject(ModalController);
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.dismissTimer = setTimeout(() => {
      this.modalCtrl.dismiss().catch(() => undefined);
    }, AUTO_DISMISS_MS);
  }

  ngOnDestroy() {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
  }
}

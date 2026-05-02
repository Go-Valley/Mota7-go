import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline } from 'ionicons/icons';
import { NetworkStatusService } from '../../core/services/network-status.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule, IonicModule],
  template: `
    <div
      class="offline-banner"
      *ngIf="(networkStatus.isOnline$ | async) === false"
    >
      <ion-icon name="cloud-offline-outline"></ion-icon>
      <span>لا يوجد اتصال بالإنترنت — يتم عرض البيانات المحفوظة</span>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      direction: rtl;
    }

    .offline-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: calc(env(safe-area-inset-top, 0px) + 6px) 16px 8px;
      background: linear-gradient(135deg, #e53935 0%, #ff7043 100%);
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.2px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      animation: slideDown 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
    }

    .offline-banner ion-icon {
      font-size: 18px;
      flex-shrink: 0;
    }

    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `],
})
export class OfflineBannerComponent {
  constructor(public readonly networkStatus: NetworkStatusService) {
    addIcons({ 'cloud-offline-outline': cloudOfflineOutline });
  }
}

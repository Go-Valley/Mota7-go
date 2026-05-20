import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { parseOrderNewNotificationPayload } from '../utils/order-notification-copy.util';
import { ProviderOrdersInboxService } from './provider-orders-inbox.service';

/**
 * فتح «طلبات العملاء» عند النقر على إشعار طلب جديد (FCM أو محلي).
 */
@Injectable({ providedIn: 'root' })
export class OrderNotificationTapService {
  private readonly router = inject(Router);
  private readonly inbox = inject(ProviderOrdersInboxService);
  private started = false;

  start(): void {
    if (!Capacitor.isNativePlatform() || this.started) {
      return;
    }
    this.started = true;

    void FirebaseMessaging.addListener('notificationActionPerformed', (ev) => {
      const data = this.notificationData(ev.notification);
      void this.openCusOrderFromPayload(data);
    }).catch(() => {});

    void LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
      const extra = (ev.notification?.extra ?? {}) as Record<string, unknown>;
      void this.openCusOrderFromPayload(extra);
    }).catch(() => {});
  }

  navigateToCusOrder(orderId?: string): void {
    const oid = String(orderId ?? '').trim();
    if (oid) {
      this.inbox.setHighlightOrderId(oid);
    }
    void this.router.navigateByUrl('/tabs/my-account/cus-order');
  }

  private async openCusOrderFromPayload(data: Record<string, unknown>): Promise<void> {
    const parsed = parseOrderNewNotificationPayload(data);
    if (!parsed) {
      return;
    }
    this.navigateToCusOrder(parsed.orderId);
  }

  private notificationData(
    notification: { data?: unknown } | undefined
  ): Record<string, unknown> {
    const raw = notification?.data;
    if (!raw || typeof raw !== 'object') {
      return {};
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = v;
    }
    return out;
  }
}

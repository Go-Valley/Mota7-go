import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { ProviderOrderLocalNotificationService } from './provider-order-local-notification.service';

/**
 * FCM وصل لمقدّم مطابق (الخادم يفلتر) — جدولة إشعار محلي كامل مع dedup.
 * على iOS (`handleApplicationNotifications: false`) قد لا يعرض النظام الإشعار دون هذا الجسر.
 */
@Injectable({ providedIn: 'root' })
export class OrderPushNotificationBridgeService {
  private readonly providerOrderLocal = inject(ProviderOrderLocalNotificationService);
  private started = false;

  start(): void {
    if (!Capacitor.isNativePlatform() || this.started) {
      return;
    }
    this.started = true;
    void FirebaseMessaging.addListener('notificationReceived', (ev) => {
      void this.onPush(ev);
    }).catch(() => {});
  }

  private async onPush(ev: { notification?: { title?: string; body?: string; data?: unknown } }): Promise<void> {
    const data = this.asDataRecord(ev.notification?.data);
    if (String(data['kind'] ?? '') !== 'order_new') {
      return;
    }

    const serviceType = String(data['service_type'] ?? '').trim().toLowerCase() || 'other';
    const previewLine = String(ev.notification?.body ?? '')
      .split('\n')[0]
      ?.trim();
    const orderId = String(data['order_id'] ?? '').trim();

    await this.providerOrderLocal.schedule({
      serviceType,
      preview: previewLine || '',
      orderId: orderId || undefined,
      scheduleDelayMs: 250,
    });
  }

  private asDataRecord(data: unknown): Record<string, string> {
    if (!data || typeof data !== 'object') {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = v == null ? '' : String(v);
    }
    return out;
  }
}

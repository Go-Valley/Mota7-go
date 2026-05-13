import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { isNtfyOrdersPipelineActive, ORDER_NOTIFY_ACTION_LINE_AR } from '../utils/ntfy-orders-policy.util';
import { NewAdNtfyService } from './new-ad-ntfy.service';

/**
 * في المقدّمة: إن كان مسار ntfy للطلبات مفعّلاً، يكفي `NtfyListenerService` (SSE → إشعار محلي mota7-orders).
 * لا نُكرّر بجدولة من FCM. في الخلفية يعرض النظام FCM (نفس العنوان/الجسم بعد مواءمة الخادم).
 * إن عُطّل ntfy للطلبات يبقى الجسر احتياطاً لإظهار إشعار في المقدّمة.
 */
@Injectable({ providedIn: 'root' })
export class OrderPushNotificationBridgeService {
  private readonly newAdNtfy = inject(NewAdNtfyService);
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

    if (isNtfyOrdersPipelineActive()) {
      return;
    }

    await this.newAdNtfy.prepareLocalNotifications();

    const title = String(ev.notification?.title ?? '').trim() || 'Mota7: new order';
    const body =
      String(ev.notification?.body ?? '').trim() ||
      ORDER_NOTIFY_ACTION_LINE_AR;

    try {
      const nid = Math.floor(Date.now() % 2147483640) + 1;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nid,
            title,
            body,
            channelId: 'mota7-orders',
            schedule: { at: new Date(Date.now() + 250) },
          },
        ],
      });
    } catch (e) {
      console.warn('[order push bridge] schedule', e);
    }
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

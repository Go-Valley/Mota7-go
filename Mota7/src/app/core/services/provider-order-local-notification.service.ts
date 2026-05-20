import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  providerOrderNotificationBody,
  providerOrderNotificationTitle,
} from '../utils/order-notification-copy.util';
import type { ParsedOrderNtfy } from '../utils/order-ntfy.util';
import { NewAdNtfyService } from './new-ad-ntfy.service';

/** منع إشعارين محليين لنفس الطلب (ntfy SSE + FCM في المقدّمة) */
const LOCAL_ORDER_DEDUP_MS = 90_000;

export interface ProviderOrderLocalNotifyInput {
  serviceType: string;
  preview: string;
  orderId?: string;
  /** تأخير بسيط قبل العرض (ms) */
  scheduleDelayMs?: number;
}

/**
 * إشعار محلي كامل لمقدّم خدمة مطابق (عنوان + معاينة + سطر الإجراء).
 * يُستخدم من مستمع ntfy في كل حالات التطبيق (مقدّمة / خلفية / غير نشط).
 */
@Injectable({ providedIn: 'root' })
export class ProviderOrderLocalNotificationService {
  private readonly newAdNtfy = inject(NewAdNtfyService);
  private readonly recentKeys = new Map<string, number>();

  async scheduleFromParsedNtfy(parsed: ParsedOrderNtfy): Promise<boolean> {
    const svc = (parsed.svc || 'other').trim().toLowerCase() || 'other';
    return this.schedule({
      serviceType: svc,
      preview: parsed.preview,
      orderId: parsed.orderId,
    });
  }

  async schedule(input: ProviderOrderLocalNotifyInput): Promise<boolean> {
    if (Capacitor.getPlatform() === 'web') {
      return false;
    }

    const serviceType = String(input.serviceType || 'other').trim().toLowerCase() || 'other';
    const orderId = String(input.orderId ?? '').trim();
    const dedupKey = orderId || `${serviceType}:${String(input.preview || '').slice(0, 120)}`;

    if (this.isDuplicate(dedupKey)) {
      return false;
    }
    this.markNotified(dedupKey);

    await this.newAdNtfy.prepareLocalNotifications();

    const title = providerOrderNotificationTitle(serviceType);
    const body = providerOrderNotificationBody(input.preview, serviceType);
    const extra: Record<string, string> = {
      kind: 'order_new',
      service_type: serviceType,
    };
    if (orderId) {
      extra['order_id'] = orderId;
    }

    const delay = Math.max(0, Number(input.scheduleDelayMs ?? 400));

    try {
      const nid = Math.floor(Date.now() % 2147483640) + 1;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nid,
            title,
            body,
            channelId: 'mota7-orders',
            extra,
            schedule: { at: new Date(Date.now() + delay) },
          },
        ],
      });
      return true;
    } catch (e) {
      console.warn('[provider order local notify] schedule', e);
      return false;
    }
  }

  private isDuplicate(key: string): boolean {
    const k = key.trim();
    if (!k) {
      return false;
    }
    const prev = this.recentKeys.get(k);
    return !!prev && Date.now() - prev < LOCAL_ORDER_DEDUP_MS;
  }

  private markNotified(key: string): void {
    const k = key.trim();
    if (!k) {
      return;
    }
    const now = Date.now();
    this.recentKeys.set(k, now);
    if (this.recentKeys.size > 400) {
      for (const [id, t] of this.recentKeys) {
        if (now - t > LOCAL_ORDER_DEDUP_MS) {
          this.recentKeys.delete(id);
        }
      }
    }
  }
}

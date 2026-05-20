import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { providerOrderNtfyAsciiTitle } from '../utils/order-notification-copy.util';
import { buildOrderNtfyMessageBody, buildShoppingOrderNtfyMessageBody } from '../utils/order-ntfy.util';
import { NewAdNtfyService } from './new-ad-ntfy.service';

/**
 * نشر طلب خدمة جديد على ntfy (نفس الموضوع أو موضوع الطلبات) لمقدمي الخدمة المطابقين.
 */
@Injectable({ providedIn: 'root' })
export class NewOrderNtfyService {
  private readonly bootstrap = inject(NewAdNtfyService);

  async publishPendingOrder(orderId: string, order: Record<string, unknown>): Promise<void> {
    await this.bootstrap.prepareLocalNotifications();

    const cfg = environment.ntfy;
    if (!cfg?.enabled || cfg.ordersEnabled === false) {
      return;
    }

    const topicName = (cfg.ordersTopic || cfg.topic || '').trim();
    if (!topicName) {
      return;
    }

    // رأس Title يجب أن يبقى ASCII/Latin-1: أحرف عربية هنا قد تُسقط الطلب صامتاً في WebView (لا يصل للموضوع).
    const st = String(order['serviceType'] ?? '').trim().toLowerCase();
    const body = buildOrderNtfyMessageBody(order, orderId);
    try {
      const base = cfg.baseUrl.replace(/\/$/, '');
      const topic = encodeURIComponent(topicName);
      const res = await fetch(`${base}/${topic}`, {
        method: 'POST',
        headers: {
          Title: providerOrderNtfyAsciiTitle(st),
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body,
        mode: 'cors',
      });
      void res;
    } catch {
      /* ntfy is best-effort; avoid console noise on mobile/WebView */
    }
  }

  /** نشر بعد تأكيد طلب من العربة — نفس مسار اشعارات طلب الخدمة (موضوع الطلبات) */
  async publishShoppingOrder(snapshot: Record<string, unknown>): Promise<void> {
    await this.bootstrap.prepareLocalNotifications();

    const cfg = environment.ntfy;
    if (!cfg?.enabled || cfg.ordersEnabled === false) {
      return;
    }

    const topicName = (cfg.ordersTopic || cfg.topic || '').trim();
    if (!topicName) {
      return;
    }

    const body = buildShoppingOrderNtfyMessageBody(snapshot);
    try {
      const base = cfg.baseUrl.replace(/\/$/, '');
      const topic = encodeURIComponent(topicName);
      const res = await fetch(`${base}/${topic}`, {
        method: 'POST',
        headers: {
          Title: 'Mota7: shopping order',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body,
        mode: 'cors',
      });
      void res;
    } catch {
      /* ntfy is best-effort; avoid console noise on mobile/WebView */
    }
  }
}

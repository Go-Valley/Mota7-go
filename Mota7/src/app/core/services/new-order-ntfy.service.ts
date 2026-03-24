import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { buildOrderNtfyMessageBody } from '../utils/order-ntfy.util';
import { NewAdNtfyService } from './new-ad-ntfy.service';

/**
 * نشر طلب خدمة جديد على ntfy (نفس الموضوع أو موضوع الطلبات) لمقدمي الخدمة المطابقين.
 */
@Injectable({ providedIn: 'root' })
export class NewOrderNtfyService {
  private readonly bootstrap = inject(NewAdNtfyService);

  async publishPendingOrder(order: Record<string, unknown>): Promise<void> {
    await this.bootstrap.prepareLocalNotifications();

    const cfg = environment.ntfy;
    if (!cfg?.enabled || cfg.ordersEnabled === false) {
      return;
    }

    const topicName = (cfg.ordersTopic || cfg.topic || '').trim();
    if (!topicName) {
      return;
    }

    // Header values must be ISO-8859-1 for fetch(); Arabic belongs in UTF-8 body only.
    const body = buildOrderNtfyMessageBody(order);
    try {
      const base = cfg.baseUrl.replace(/\/$/, '');
      const topic = encodeURIComponent(topicName);
      const res = await fetch(`${base}/${topic}`, {
        method: 'POST',
        headers: {
          Title: 'Mota7: new order',
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

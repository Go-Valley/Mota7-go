import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { environment } from '../../../environments/environment';
import {
  parseNtfyIncomingMessage,
  parseOrderNtfyMessage,
  type ParsedOrderNtfy,
} from '../utils/ntfy-parse.util';
import { AdminNtfySetupService } from './admin-ntfy-setup.service';

/**
 * SSE على ntfy (نفس موضوع Mota7): إشعار محلي فوري للمسؤول — كل الإعلانات وكل الطلبات (بدون فلترة مقدم خدمة).
 */
@Injectable({ providedIn: 'root' })
export class AdminNtfyListenerService {
  private readonly setup = inject(AdminNtfySetupService);

  private readonly sources: EventSource[] = [];
  private readonly seenIds = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    const cfg = environment.ntfy;
    if (!cfg?.enabled) {
      return;
    }
    if (Capacitor.getPlatform() === 'web') {
      return;
    }
    if (typeof EventSource === 'undefined') {
      return;
    }

    this.closeAll();

    const base = cfg.baseUrl.replace(/\/$/, '');
    const topics = new Set<string>();
    const mainTopic = (cfg.topic || '').trim();
    if (mainTopic) {
      topics.add(mainTopic);
    }
    if (cfg.ordersEnabled !== false) {
      const ot = (cfg.ordersTopic || cfg.topic || '').trim();
      if (ot) {
        topics.add(ot);
      }
    }

    for (const t of topics) {
      const url = `${base}/${encodeURIComponent(t)}/sse`;
      const es = new EventSource(url);
      this.sources.push(es);

      es.addEventListener('open', () => {
        void this.setup.prepareLocalNotifications();
      });

      es.addEventListener('message', (ev: MessageEvent) => {
        void this.handleSseData(String(ev.data ?? ''));
      });
      es.addEventListener('error', () => {
        this.scheduleReconnect();
      });
    }
  }

  private closeAll(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const es of this.sources) {
      try {
        es.close();
      } catch {
        /* ignore */
      }
    }
    this.sources.length = 0;
  }

  private async handleSseData(data: string): Promise<void> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }

    const ev = parsed['event'];
    if (ev && ev !== 'message') {
      return;
    }

    const id = parsed['id'] != null ? String(parsed['id']) : '';
    if (id) {
      if (this.seenIds.has(id)) {
        return;
      }
      this.seenIds.add(id);
      while (this.seenIds.size > 400) {
        const first = this.seenIds.values().next().value as string;
        this.seenIds.delete(first);
      }
    }

    const rawMsg = typeof parsed['message'] === 'string' ? parsed['message'] : '';
    const titleFromServer =
      typeof parsed['title'] === 'string' && parsed['title'].trim()
        ? String(parsed['title']).trim()
        : '';

    const orderParsed = parseOrderNtfyMessage(rawMsg);
    if (orderParsed) {
      await this.handleOrderNtfyMessage(orderParsed, titleFromServer);
      return;
    }

    /** لوحة التحكم: لا نتجاهل حسب UID الناشر — نعرض كل الإعلانات الجديدة */
    const { skip, body } = parseNtfyIncomingMessage(rawMsg, null);
    if (skip || !body.trim()) {
      return;
    }

    await this.setup.prepareLocalNotifications();

    const t = (titleFromServer || '').toLowerCase();
    const isAdEdit = t.includes('ad updated');
    const title = isAdEdit ? 'تعديل إعلان' : 'إعلان جديد';
    const bodyText = isAdEdit ? 'تم تعديل إعلان — راجع لوحة التحكم' : 'اعلان جديد تم اضافته';
    void body; // تم التحقق من وجود رسالة؛ العنوان يُستمد من ترويسة ntfy (new vs updated).

    await this.scheduleWithFallback({
      title,
      body: bodyText,
      channelId: 'mota7-admin-ads',
      delayMs: 400,
      tag: 'ad',
    });
  }

  private async handleOrderNtfyMessage(
    parsed: ParsedOrderNtfy,
    titleFromServer: string
  ): Promise<void> {
    if (environment.ntfy.ordersEnabled === false) {
      return;
    }

    await this.setup.prepareLocalNotifications();

    void titleFromServer; // نتعمد توحيد نص إشعار لوحة التحكم.
    const serviceName = this.mapServiceTypeToArabic(parsed);
    const title = 'طلب خدمة جديد';
    const body = `طلب (${serviceName}) جديد تم طلبه`;

    await this.scheduleWithFallback({
      title,
      body,
      channelId: 'mota7-admin-orders',
      delayMs: 450,
      tag: 'order',
    });
  }

  private mapServiceTypeToArabic(parsed: ParsedOrderNtfy): string {
    const svc = (parsed.svc || '').trim().toLowerCase();
    if (svc === 'delivery') return 'توصيل';
    if (svc === 'education') return 'تعليمي';
    if (svc === 'other') return 'خدمة';
    return 'خدمة';
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start();
    }, 2500);
  }

  private async scheduleWithFallback(input: {
    title: string;
    body: string;
    channelId: string;
    delayMs: number;
    tag: string;
  }): Promise<void> {
    const nid = Math.floor(Date.now() % 2147483640) + 1;
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nid,
            title: input.title,
            body: input.body,
            channelId: input.channelId,
            schedule: { at: new Date(Date.now() + input.delayMs) },
          },
        ],
      });
    } catch (e) {
      // Fallback: بعض الأجهزة/الرومات قد ترفض channelId إن لم تُنشأ القناة لسبب ما.
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: nid + 1,
              title: input.title,
              body: input.body,
              schedule: { at: new Date(Date.now() + input.delayMs + 100) },
            },
          ],
        });
      } catch (fallbackErr) {
        console.warn(`[admin ntfy] ${input.tag} schedule`, e, fallbackErr);
      }
    }
  }
}

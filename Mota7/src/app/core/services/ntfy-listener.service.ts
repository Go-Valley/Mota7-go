import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { environment } from '../../../environments/environment';
import {
  mapMota7AdNtfyTitle,
  parseNtfyIncomingMessage,
} from '../utils/ad-notification-preview';
import { parseOrderNtfyMessage } from '../utils/order-ntfy.util';
import { isNtfyOrdersPipelineActive } from '../utils/ntfy-orders-policy.util';
import { NewAdNtfyService } from './new-ad-ntfy.service';
import { ProviderMatchService } from './provider-match.service';
import { ProviderOrderLocalNotificationService } from './provider-order-local-notification.service';

/**
 * SSE على موضوع/مواضيع ntfy: إعلانات جديدة + طلبات خدمة (مع فلترة لمقدم الخدمة).
 * طلبات الخدمة: إشعار محلي كامل في المقدّمة والخلفية طالما العملية تعمل وSSE متصل.
 */
@Injectable({ providedIn: 'root' })
export class NtfyListenerService {
  private readonly auth = inject(Auth);
  private readonly newAdNtfy = inject(NewAdNtfyService);
  private readonly providerMatch = inject(ProviderMatchService);
  private readonly providerOrderLocal = inject(ProviderOrderLocalNotificationService);

  private readonly sources: EventSource[] = [];
  private readonly seenIds = new Set<string>();
  private lifecycleHooked = false;
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

    this.ensureAppLifecycleHooks();
    this.openSseConnections();
  }

  /** إعادة فتح SSE بعد العودة من الخلفية أو إن انقطع الاتصال */
  private openSseConnections(): void {
    this.closeAll();

    const cfg = environment.ntfy;
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
        void this.newAdNtfy.prepareLocalNotifications();
      });

      es.addEventListener('error', () => {
        this.scheduleSseReconnect();
      });

      es.addEventListener('message', (ev: MessageEvent) => {
        void this.handleSseData(String(ev.data ?? ''));
      });
    }
  }

  private scheduleSseReconnect(): void {
    if (this.reconnectTimer != null) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.start();
    }, 12_000);
  }

  private ensureAppLifecycleHooks(): void {
    if (this.lifecycleHooked || Capacitor.getPlatform() === 'web') {
      return;
    }
    this.lifecycleHooked = true;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        this.start();
      }
    }).catch(() => {});
    void App.addListener('resume', () => {
      this.start();
    }).catch(() => {});
  }

  private closeAll(): void {
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

    const title = mapMota7AdNtfyTitle(titleFromServer);
    const uid = this.auth.currentUser?.uid ?? null;
    const { skip, body } = parseNtfyIncomingMessage(rawMsg, uid);
    if (skip || !body.trim()) {
      return;
    }

    await this.newAdNtfy.prepareLocalNotifications();

    try {
      const nid = Math.floor(Date.now() % 2147483640) + 1;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nid,
            title,
            body: body.trim(),
            channelId: 'mota7-ads',
            schedule: { at: new Date(Date.now() + 400) },
          },
        ],
      });
    } catch (e) {
      console.warn('[ntfy listener] ad schedule', e);
    }
  }

  private async handleOrderNtfyMessage(
    parsed: ReturnType<typeof parseOrderNtfyMessage>,
    _titleFromServer: string
  ): Promise<void> {
    if (!parsed) {
      return;
    }
    if (environment.ntfy.ordersEnabled === false) {
      return;
    }
    if (!isNtfyOrdersPipelineActive()) {
      return;
    }

    await this.providerMatch.ensureLoaded();
    if (!this.providerMatch.matchesParsedOrderNtfy(parsed)) {
      return;
    }

    await this.providerOrderLocal.scheduleFromParsedNtfy(parsed);
  }
}

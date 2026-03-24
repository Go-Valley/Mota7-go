import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { environment } from '../../../environments/environment';
import { Mota7Notifications } from '../../plugins/mota7-notifications.plugin';
import {
  buildAdCardPreviewForNtfy,
  buildNtfyPublicBody,
} from '../utils/ad-notification-preview';

/**
 * بعد نشر إعلان جديد: إشعار محلي لصاحب الإعلان + نشر على ntfy لبقية المشتركين.
 */
@Injectable({ providedIn: 'root' })
export class NewAdNtfyService {
  private channelsReady = false;

  /** تجهيز القنوات والأذونات قبل استقبال رسائل SSE أو جدولة محلية */
  async prepareLocalNotifications(): Promise<void> {
    await this.ensureChannelsAndPermissions();
  }

  /**
   * يُستدعى بعد نجاح حفظ إعلان جديد فقط (ليس التعديل).
   */
  async notifyAfterNewAdSubmitted(publisherUid: string, adPayload: Record<string, unknown>): Promise<void> {
    await this.ensureChannelsAndPermissions();
    await this.scheduleOwnerSubmittedNotification();

    const cfg = environment.ntfy;
    if (!cfg?.enabled || !cfg.topic?.trim()) {
      return;
    }

    const preview = buildAdCardPreviewForNtfy(adPayload);
    const body = buildNtfyPublicBody(publisherUid, preview);

    // Header values must be ISO-8859-1 for fetch(); Arabic stays in UTF-8 body.
    try {
      const base = cfg.baseUrl.replace(/\/$/, '');
      const topic = encodeURIComponent(cfg.topic.trim());
      const res = await fetch(`${base}/${topic}`, {
        method: 'POST',
        headers: {
          Title: 'Mota7: new ad',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body,
        mode: 'cors',
      });
      void res;
    } catch {
      /* ntfy is best-effort */
    }
  }

  private async scheduleOwnerSubmittedNotification(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      return;
    }
    try {
      const id = Math.floor(Date.now() % 2147483640) + 1;
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: 'مُتاح',
            body: 'تم نشر إعلانك بنجاح… إعلانك هيظهر بعد المراجعة',
            channelId: 'mota7-ads',
            schedule: { at: new Date(Date.now() + 500) },
          },
        ],
      });
    } catch (e) {
      console.warn('[local notifications] owner', e);
    }
  }

  private async ensureChannelsAndPermissions(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      return;
    }

    try {
      await Mota7Notifications.requestNotificationAccess().catch(() => {});
    } catch {
      /* ignore */
    }

    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    } catch {
      /* ignore */
    }

    if (this.channelsReady) {
      return;
    }

    if (Capacitor.getPlatform() === 'android') {
      try {
        await LocalNotifications.createChannel({
          id: 'mota7-ads',
          name: 'إعلانات مُتاح',
          description: 'تنبيهات عند نشر إعلانات جديدة',
          importance: 4,
          vibration: true,
        });
        await LocalNotifications.createChannel({
          id: 'mota7-orders',
          name: 'طلبات العملاء',
          description: 'تنبيهات الطلبات الجديدة لمقدمي الخدمة',
          importance: 5,
          vibration: true,
          sound: 'mota7.mp3',
        });
      } catch {
        /* ignore */
      }
    }
    this.channelsReady = true;
  }
}

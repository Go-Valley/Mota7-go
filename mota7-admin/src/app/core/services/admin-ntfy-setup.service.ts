import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Mota7Notifications } from '../../plugins/mota7-notifications.plugin';

/**
 * قنوات إشعارات أندرويد + أذونات، مع نغمة mota7.mp3 (ملف في res/raw عبر scripts/copy-notification-sound.js).
 */
@Injectable({ providedIn: 'root' })
export class AdminNtfySetupService {
  private channelsReady = false;

  async prepareLocalNotifications(): Promise<void> {
    await this.ensureChannelsAndPermissions();
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
          id: 'mota7-admin-ads',
          name: 'إعلانات جديدة — لوحة التحكم',
          description: 'تنبيه فوري عند نشر إعلان جديد من التطبيق',
          importance: 5,
          vibration: true,
          sound: 'mota7.mp3',
        });
        await LocalNotifications.createChannel({
          id: 'mota7-admin-orders',
          name: 'طلبات خدمة جديدة',
          description: 'تنبيه فوري عند طلب خدمة جديد',
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

import { WebPlugin } from '@capacitor/core';
import type { Mota7NotificationsPlugin, NotificationAccessState } from './mota7-notifications.plugin';

export class Mota7NotificationsWeb extends WebPlugin implements Mota7NotificationsPlugin {
  async requestNotificationAccess(): Promise<void> {
    if (typeof Notification === 'undefined') {
      return;
    }
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  async getNotificationAccessState(): Promise<NotificationAccessState> {
    if (typeof Notification === 'undefined') {
      return { granted: false };
    }
    return { granted: Notification.permission === 'granted' };
  }
}

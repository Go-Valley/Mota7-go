import { registerPlugin } from '@capacitor/core';

export interface NotificationAccessState {
  granted: boolean;
}

export interface Mota7NotificationsPlugin {
  /**
   * طلب إذن إظهار الإشعارات (Android 13+). على أندرويد الأقدم والويب: لا حاجة أو سلوك مناسب.
   */
  requestNotificationAccess(): Promise<void>;

  /** حالة الإذن الحالية (على أندرويد أقدم من 13 يُعاد granted: true). */
  getNotificationAccessState(): Promise<NotificationAccessState>;
}

export const Mota7Notifications = registerPlugin<Mota7NotificationsPlugin>('Mota7Notifications', {
  web: () => import('./mota7-notifications.web').then((m) => new m.Mota7NotificationsWeb()),
});

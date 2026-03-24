import { registerPlugin } from '@capacitor/core';

export interface NotificationAccessState {
  granted: boolean;
}

export interface Mota7NotificationsPlugin {
  requestNotificationAccess(): Promise<void>;
  getNotificationAccessState(): Promise<NotificationAccessState>;
}

export const Mota7Notifications = registerPlugin<Mota7NotificationsPlugin>('Mota7Notifications', {
  web: () => import('./mota7-notifications.web').then((m) => new m.Mota7NotificationsWeb()),
});

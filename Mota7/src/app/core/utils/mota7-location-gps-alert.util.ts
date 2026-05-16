import type { AlertOptions } from '@ionic/angular';

/** عزل LTR لكلمة GPS داخل جملة عربية — يمنع انقلاب ترتيب الحروف */
export const MOTA7_GPS_ALERT_MESSAGE =
  'عفواً، تأكد من تفعيل ال \u2066GPS\u2069 في هاتفك';

export const MOTA7_GPS_ALERT_HEADER = 'تنبيه الموقع';

export const MOTA7_GPS_ALERT_CSS_CLASS = 'mota7-location-gps-alert';

/** أزرار التنبيه: «تفعيل» ثم «إلغاء» (ترتيب العرض في RTL) */
export function mota7GpsDisabledAlertButtons(onActivate: () => void): NonNullable<AlertOptions['buttons']> {
  return [
    {
      text: 'تفعيل',
      role: 'confirm',
      handler: () => {
        onActivate();
      },
    },
    { text: 'إلغاء', role: 'cancel' },
  ];
}

export function mota7GpsDisabledAlertOptions(
  onActivate: () => void
): AlertOptions {
  return {
    header: MOTA7_GPS_ALERT_HEADER,
    message: MOTA7_GPS_ALERT_MESSAGE,
    cssClass: MOTA7_GPS_ALERT_CSS_CLASS,
    mode: 'ios',
    buttons: mota7GpsDisabledAlertButtons(onActivate),
  };
}

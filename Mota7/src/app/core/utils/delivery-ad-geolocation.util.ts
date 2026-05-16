import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Mota7Location } from '../../plugins/mota7-location.plugin';
import { MOTA7_GPS_ALERT_MESSAGE } from './mota7-location-gps-alert.util';

export type DeliveryAdLatLng = { lat: number; lng: number };

/**
 * جلب الموقع لنموذج إعلان التوصيل (إضافة من add-ad-type أو تعديل من my-ads).
 * إن كانت صلاحية Geolocation ممنوحة مسبقاً لا نعيد طلب Mota7/الحوار — نقرأ الإحداثيات مباشرة.
 */
export async function getDeliveryAdCurrentLocation(): Promise<DeliveryAdLatLng | null> {
  try {
    let alreadyGranted = false;
    try {
      const pre = await Geolocation.checkPermissions();
      alreadyGranted = pre.location === 'granted';
    } catch {
      alreadyGranted = false;
    }

    if (!alreadyGranted) {
      if (Capacitor.getPlatform() === 'android') {
        try {
          await Mota7Location.requestLocationAccess();
        } catch (e: unknown) {
          const m = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
          if (m.includes('denied') || m.includes('location permission denied')) {
            alert('يرجى منح صلاحية الموقع من إعدادات التطبيق ثم المحاولة مرة أخرى.');
            return null;
          }
        }
      }

      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        await Geolocation.requestPermissions();
      }
    }

    const coordinates = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      ...(Capacitor.getPlatform() !== 'web'
        ? { enableLocationFallback: true, timeout: 30000 }
        : {}),
    });

    return {
      lat: coordinates.coords.latitude,
      lng: coordinates.coords.longitude,
    };
  } catch (error) {
    console.error('خطأ في تحديد الموقع:', error);
    alert(MOTA7_GPS_ALERT_MESSAGE);
    return null;
  }
}

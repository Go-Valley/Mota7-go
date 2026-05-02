import { Timestamp } from '@angular/fire/firestore';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

/**
 * نافذة الطلب المعلّق (من وقت الإنشاء) والطلب بعد القبول (من وقت acceptedAt)، بالملّي ثانية.
 * مطابقة تلقائي الخادم: firebase/functions/index.js — عند التغيير حدّث الدالة أيضاً ليبقى الحذف/الإكمال التلقائي صحيحاً.
 */
export const ORDER_ACCEPTED_WINDOW_MS = 30 * 60 * 1000;

/** مدة إظهار وضع الأرشفة على الشاشة بعد إنهاء المهمة */
export const ORDER_ARCHIVE_UI_MS = 10 * 60 * 1000;

/** بقاء المستند في orders بعد اختفائه من الواجهات حتى الحذف النهائي (30 يوماً) */
export const ORDER_DB_RETENTION_AFTER_UI_MS = 30 * 24 * 60 * 60 * 1000;

/** صلاحية منع التكرار لطلب معلّق (ساعة) */
export const ORDER_PENDING_HOLD_MS = 60 * 60 * 1000;

export function orderFieldToMs(v: any, fallback: number): number {
  if (v == null) return fallback;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  return fallback;
}

export function timestampPlusMs(base: Timestamp, ms: number): Timestamp {
  return Timestamp.fromMillis(base.toMillis() + ms);
}

/** طلب يظهر لطالب الخدمة (قبل التنظيف النهائي للمستند) */
export function orderVisibleForCustomer(order: any, customerPhone: string): boolean {
  if (!order || order.customerPhone !== customerPhone) return false;
  if (order.removedFromUiAt) return false;
  if (order.status === 'completed') {
    const completedAt = orderFieldToMs(order.completedAt, Date.now());
    const until = order.uiArchiveUntil
      ? orderFieldToMs(order.uiArchiveUntil, completedAt + ORDER_ARCHIVE_UI_MS)
      : completedAt + ORDER_ARCHIVE_UI_MS;
    if (Date.now() >= until) return false;
  }
  return true;
}

export function orderNeedsFinalizeAfterArchive(order: any): boolean {
  if (!order?.id || order.removedFromUiAt) return false;
  if (order.status !== 'completed') return false;
  const completedAt = orderFieldToMs(order.completedAt, Date.now());
  const until = order.uiArchiveUntil
    ? orderFieldToMs(order.uiArchiveUntil, completedAt + ORDER_ARCHIVE_UI_MS)
    : completedAt + ORDER_ARCHIVE_UI_MS;
  return Date.now() >= until;
}

/** إخفاء من صندوق مستقبل الخدمة (نفس منطق الطالب بعد انتهاء الأرشفة أو الإزالة) */
export function orderHiddenFromProviderInbox(order: any): boolean {
  if (order.removedFromUiAt) return true;
  if (order.status === 'completed') {
    const completedAt = orderFieldToMs(order.completedAt, Date.now());
    const until = order.uiArchiveUntil
      ? orderFieldToMs(order.uiArchiveUntil, completedAt + ORDER_ARCHIVE_UI_MS)
      : completedAt + ORDER_ARCHIVE_UI_MS;
    if (Date.now() >= until) return true;
  }
  return false;
}

/**
 * فتح رابط خرائط: يجرّب تطبيق النظام أولاً، ثم المتصفح.
 */
export async function openMapsUrlWithFallback(mapsUrl: string): Promise<void> {
  const url = mapsUrl?.trim();
  if (!url) return;
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await AppLauncher.canOpenUrl({ url });
      if (value) {
        await AppLauncher.openUrl({ url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await AppLauncher.openUrl({ url });
      return;
    } catch {
      window.open(url, '_blank');
    }
  } else {
    window.open(url, '_blank');
  }
}

export function buildGoogleMapsDirectionsUrl(
  originLat?: number | null,
  originLng?: number | null,
  destLat?: number | null,
  destLng?: number | null
): string {
  if (
    originLat != null &&
    originLng != null &&
    destLat != null &&
    destLng != null
  ) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=driving`;
  }
  if (originLat != null && originLng != null) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&travelmode=driving`;
  }
  if (destLat != null && destLng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;
  }
  return 'https://www.google.com/maps/';
}

import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

/** نفس نافذة الطلب المقبول في تطبيق العميل (30 دقيقة) */
export const ORDER_ACCEPTED_WINDOW_MS = 30 * 60 * 1000;

export function orderFieldToMs(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  if (typeof v === 'number') return v;
  const t = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.toDate === 'function') return t.toDate().getTime();
  return fallback;
}

export function hasValidLatLng(lat: unknown, lng: unknown): boolean {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
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

/**
 * فتح رابط الخرائط في تطبيق الخرائط/المتصفح الخارجي (نفس سلوك طلبات العملاء في Mota7).
 * window.open(..., '_system') داخل WebView غالباً لا يفتح تطبيق الخرائط ويظهر «الصفحة غير متوفرة».
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

export function formatAcceptedRemainingMs(diffMs: number): string {
  if (diffMs <= 0) return '00:00';
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

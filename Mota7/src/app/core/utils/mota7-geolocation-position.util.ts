import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';

/** رسالة عربية مناسبة لأخطاء Geolocation (Capacitor / المتصفح) */
export function mota7GeolocationFailureMessage(error: unknown): string {
  const code = Number((error as { code?: number })?.code);
  if (code === 1) {
    return 'لم يُمنح إذن الموقع. فعّل صلاحية الموقع للتطبيق من الإعدادات.';
  }
  if (code === 2) {
    return 'تعذر الوصول لإشارة الموقع. تأكد أن GPS مفعّل وأنك في مكان مكشوف.';
  }
  if (code === 3) {
    return 'انتهت مهلة تحديد الموقع. فعّل GPS وحاول مرة أخرى بعد لحظات.';
  }
  return 'تعذر تحديد موقعك حالياً. حاول مرة أخرى.';
}

export async function ensureGeolocationGranted(): Promise<boolean> {
  try {
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted') {
      perm = await Geolocation.requestPermissions();
    }
    return perm.location === 'granted';
  } catch {
    return false;
  }
}

function getFirstPositionFromWatch(timeoutMs: number): Promise<Position> {
  return new Promise((resolve, reject) => {
    let watchId: string | undefined;
    let settled = false;

    const timer = window.setTimeout(async () => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        if (watchId) {
          await Geolocation.clearWatch({ id: watchId });
        }
      } catch {
        /* ignore */
      }
      const err = new Error('watch timeout') as Error & { code: number };
      err.code = 3;
      reject(err);
    }, timeoutMs);

    void Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
        minimumUpdateInterval: 500,
        interval: 2500,
        enableLocationFallback: true,
      },
      async (position, err) => {
        if (settled || err || !position) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        try {
          if (watchId) {
            await Geolocation.clearWatch({ id: watchId });
          }
        } catch {
          /* ignore */
        }
        resolve(position);
      }
    )
      .then((id) => {
        watchId = id;
      })
      .catch((e) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(e);
        }
      });
  });
}

function getWebCurrentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('no geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p as unknown as Position),
      reject,
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
    );
  });
}

/**
 * تحديد موقع حالي بمهلة أطول ومحاولات بديلة (watch ثم دقة عالية ثم دقة منخفضة).
 * يُستخدم في تفعيل موقع المندوب/العميل وطلب التوصيل.
 */
export async function getMota7CurrentPosition(): Promise<Position> {
  const isNative = Capacitor.getPlatform() !== 'web';

  if (!isNative) {
    try {
      return await getWebCurrentPosition();
    } catch (first) {
      try {
        return await new Promise<Position>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p as unknown as Position),
            reject,
            { enableHighAccuracy: false, timeout: 30000, maximumAge: 120000 }
          );
        });
      } catch {
        throw first;
      }
    }
  }

  const granted = await ensureGeolocationGranted();
  if (!granted) {
    const err = new Error('permission denied') as Error & { code: number };
    err.code = 1;
    throw err;
  }

  try {
    return await getFirstPositionFromWatch(35000);
  } catch {
    /* يكمل لـ getCurrentPosition */
  }

  try {
    return await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0,
      enableLocationFallback: true,
      minimumUpdateInterval: 500,
      interval: 3000,
    });
  } catch (highErr) {
    try {
      return await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 35000,
        maximumAge: 120000,
        enableLocationFallback: true,
      });
    } catch {
      throw highErr;
    }
  }
}

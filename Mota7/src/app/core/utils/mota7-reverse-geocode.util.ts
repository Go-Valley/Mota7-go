/** استجابة Nominatim reverse (jsonv2) — الحقول الاختيارية */
export type NominatimReversePayload = {
  display_name?: string;
  address?: Record<string, string | undefined>;
};

const COORD_PAIR_RE = /^-?\d{1,2}(?:\.\d+)?\s*[,،]\s*-?\d{1,3}(?:\.\d+)?$/;

const ORIGIN_GPS_PLACEHOLDER_RE =
  /تم تحديد موقعك بنجاح|تم تحديد الموقع بنجاح|تم تحديد نقطة الانطلاق/i;

/** نص واجهة GPS أو إحداثيات — ليس عنواناً للعرض أو الحفظ */
export function isOriginLocationPlaceholder(text: unknown): boolean {
  const t = String(text ?? '').trim();
  if (!t) {
    return true;
  }
  if (ORIGIN_GPS_PLACEHOLDER_RE.test(t)) {
    return true;
  }
  return looksLikeCoordinateLabel(t);
}

/** هل النص يبدو إحداثيات خام أو رسالة نجاح GPS قديمة */
export function looksLikeCoordinateLabel(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) {
    return true;
  }
  if (COORD_PAIR_RE.test(t)) {
    return true;
  }
  if (/^\d+\.\d{3,}\s*[,،]\s*\d+\.\d{3,}/.test(t)) {
    return true;
  }
  if (/تم تحديد الموقع بنجاح/i.test(t) && /\d+\.\d+/.test(t)) {
    return true;
  }
  return false;
}

/** عنوان مقروء من استجابة Nominatim — تفاصيل أولاً ثم المحافظة */
export function formatNominatimAddress(data: NominatimReversePayload | null | undefined): string {
  if (!data) {
    return '';
  }
  const a = data.address ?? {};
  const pick = (...keys: string[]): string[] =>
    keys
      .map((k) => String(a[k] ?? '').trim())
      .filter((v) => v.length > 0);

  const parts: string[] = [];
  const pushUnique = (vals: string[]) => {
    for (const v of vals) {
      if (v && !parts.includes(v)) {
        parts.push(v);
      }
    }
  };

  pushUnique(pick('amenity', 'shop', 'building', 'tourism'));
  const street = pick('road', 'pedestrian', 'footway', 'residential', 'hamlet');
  const house = pick('house_number');
  if (house[0] && street[0]) {
    pushUnique([`${street[0]} ${house[0]}`]);
  } else {
    pushUnique(street);
  }
  pushUnique(pick('neighbourhood', 'suburb', 'quarter', 'district', 'city_district'));
  pushUnique(pick('city', 'town', 'village', 'municipality'));
  pushUnique(pick('state', 'region', 'county'));

  if (parts.length) {
    return parts.join('، ');
  }

  const display = String(data.display_name ?? '').trim();
  if (display && !looksLikeCoordinateLabel(display)) {
    return display;
  }
  return '';
}

export async function reverseGeocodeLatLng(lat: number, lng: number): Promise<string> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '';
  }
  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2' +
      `&lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}` +
      '&zoom=18&addressdetails=1';
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'ar,en',
      },
    });
    if (!res.ok) {
      return '';
    }
    const data = (await res.json()) as NominatimReversePayload;
    return formatNominatimAddress(data);
  } catch {
    return '';
  }
}

/** عنوان للحفظ في النموذج — لا يُرجع إحداثيات خام */
export async function resolveHumanLocationLabel(
  lat: number,
  lng: number,
  preferredText = ''
): Promise<string> {
  const pref = String(preferredText ?? '').trim();
  if (pref && !looksLikeCoordinateLabel(pref)) {
    return pref;
  }
  const geocoded = await reverseGeocodeLatLng(lat, lng);
  if (geocoded) {
    return geocoded;
  }
  return 'موقع محدد على الخريطة';
}

/** عنوان «من» لعرض الطلب — يحلّل الطلبات القديمة التي حفظت رسالة نجاح GPS */
export async function resolveOrderOriginLocationDisplay(order: {
  fromLocation?: unknown;
  lat?: unknown;
  lng?: unknown;
}): Promise<string> {
  const raw = String(order?.fromLocation ?? '').trim();
  if (raw && !isOriginLocationPlaceholder(raw)) {
    return raw;
  }
  const lat = Number(order?.lat);
  const lng = Number(order?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    const geocoded = await reverseGeocodeLatLng(lat, lng);
    if (geocoded) {
      return geocoded;
    }
  }
  if (raw && !looksLikeCoordinateLabel(raw)) {
    return raw;
  }
  return 'موقع العميل';
}

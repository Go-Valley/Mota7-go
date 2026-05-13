import { ModalController } from '@ionic/angular';
import { DestinationMapPickerModalComponent } from './destination-map-picker-modal.component';

export type DestinationMapPickerResult =
  | {
      pickKind: 'destination';
      toLocation: string;
      toLat: number;
      toLng: number;
    }
  | {
      pickKind: 'origin';
      fromLocation: string;
      lat: number;
      lng: number;
    };

export type TrackerPoint = {
  lat: number;
  lng: number;
  label: string;
};

export type TrackingDirectionsRole = 'provider' | 'customer';

export type DestinationMapPickerMode = 'destination' | 'tracking';

/** قراءة lat/lng من أرقام أو من كائن يشبه GeoPoint في Firestore */
function coerceLatLngPair(latVal: unknown, lngVal: unknown): { lat: number; lng: number } | null {
  const tryGeo = (g: unknown): { lat: number; lng: number } | null => {
    if (g == null || typeof g !== 'object') return null;
    const o = g as Record<string, unknown>;
    const la = Number(o['latitude'] ?? o['lat']);
    const lo = Number(o['longitude'] ?? o['lng']);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) return null;
    if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
    return { lat: la, lng: lo };
  };

  const a = tryGeo(latVal);
  if (a) return a;
  const b = tryGeo(lngVal);
  if (b) return b;

  const lat = Number(latVal);
  const lng = Number(lngVal);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function extractCoordinatesFromLocationText(value: string): { lat: number; lng: number } | null {
  const normalized = (value || '').replace(/[،]/g, ',');
  const match = normalized.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

function resolveDestinationPointFromOrder(order: Record<string, unknown> | null | undefined): TrackerPoint | null {
  if (!order) return null;

  const fromPair = coerceLatLngPair(order['toLat'], order['toLng']);
  if (fromPair) {
    const label = String(order['toLocation'] ?? '').trim() || 'وجهة الوصول';
    return { lat: fromPair.lat, lng: fromPair.lng, label };
  }

  const raw = String(order['toLocation'] ?? '').trim();
  const parsed = extractCoordinatesFromLocationText(raw);
  if (parsed) {
    return { lat: parsed.lat, lng: parsed.lng, label: raw || 'وجهة الوصول' };
  }
  return null;
}

/**
 * بناء نقاط التتبع الثلاث من مستند الطلب (بدون إحداثيات وهمية).
 */
export function buildTrackingPointsFromOrder(order: Record<string, unknown> | null | undefined): {
  providerPoint: TrackerPoint | null;
  customerPoint: TrackerPoint | null;
  destinationPoint: TrackerPoint | null;
} {
  const pp = coerceLatLngPair(order?.['providerLat'], order?.['providerLng']);
  const providerPoint: TrackerPoint | null = pp
    ? {
        lat: pp.lat,
        lng: pp.lng,
        label: String(order?.['providerName'] ?? 'مقدم الخدمة').trim() || 'مقدم الخدمة',
      }
    : null;

  const cp = coerceLatLngPair(order?.['lat'], order?.['lng']);
  const customerPoint: TrackerPoint | null = cp
    ? {
        lat: cp.lat,
        lng: cp.lng,
        label: String(order?.['customerName'] ?? 'طالب الخدمة').trim() || 'طالب الخدمة',
      }
    : null;

  const destinationPoint = resolveDestinationPointFromOrder(order);

  return { providerPoint, customerPoint, destinationPoint };
}

/** فتح مودال الخريطة الداخلية للتتبع الثلاثي (بدون انتظار تأكيد وجهة). */
export async function presentTrackingMapModal(
  modalCtrl: ModalController,
  props: { order: Record<string, unknown> & { id?: string }; directionsRole: TrackingDirectionsRole }
): Promise<void> {
  const { providerPoint, customerPoint, destinationPoint } = buildTrackingPointsFromOrder(props.order);
  const modal = await modalCtrl.create({
    component: DestinationMapPickerModalComponent,
    componentProps: {
      originLat: 0,
      originLng: 0,
      initialDestinationLat: 0,
      initialDestinationLng: 0,
      initialDestinationText: '',
      mode: 'tracking' as const,
      directionsRole: props.directionsRole,
      trackingSessionId: `trk_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      trackingOrderId: props.order?.id != null ? String(props.order.id) : '',
      providerPoint,
      customerPoint,
      destinationPoint,
    },
    cssClass: 'mota7-destination-map-picker-modal',
    showBackdrop: true,
    backdropDismiss: false,
    mode: 'ios',
  });
  await modal.present();
  await modal.onDidDismiss();
}

export async function presentDestinationMapPickerModal(
  modalCtrl: ModalController,
  props: {
    originLat: number;
    originLng: number;
    initialDestinationLat?: number;
    initialDestinationLng?: number;
    initialDestinationText?: string;
    /** اختيار نقطة الانطلاق أو جهة الوصول من الخريطة */
    pickRole?: 'destination' | 'origin';
    /**
     * عند اختيار نقطة الانطلاق: عند الإغلاق أو زر الرجوع دون «تأكيد»،
     * تُسجَّل إحداثيات مركز الخريطة الحالي كما يظهر للمستخدم.
     */
    applyOriginCenterOnDismiss?: boolean;
    /** تمييز بصري خفيف للمؤشر عند فتح الخريطة مباشرة على GPS */
    accentOriginGpsPick?: boolean;
    mode?: DestinationMapPickerMode;
    providerPoint?: TrackerPoint | null;
    customerPoint?: TrackerPoint | null;
    destinationPoint?: TrackerPoint | null;
  }
): Promise<DestinationMapPickerResult | null> {
  const modal = await modalCtrl.create({
    component: DestinationMapPickerModalComponent,
    componentProps: {
      originLat: props.originLat,
      originLng: props.originLng,
      initialDestinationLat: props.initialDestinationLat ?? 0,
      initialDestinationLng: props.initialDestinationLng ?? 0,
      initialDestinationText: props.initialDestinationText ?? '',
      pickRole: props.pickRole ?? 'destination',
      applyOriginCenterOnDismiss: props.applyOriginCenterOnDismiss ?? false,
      accentOriginGpsPick: props.accentOriginGpsPick ?? false,
      mode: props.mode ?? 'destination',
      providerPoint: props.providerPoint ?? null,
      customerPoint: props.customerPoint ?? null,
      destinationPoint: props.destinationPoint ?? null,
    },
    cssClass: 'mota7-destination-map-picker-modal',
    showBackdrop: true,
    backdropDismiss: false,
    mode: 'ios',
  });
  await modal.present();
  const result = await modal.onDidDismiss<DestinationMapPickerResult>();
  if (result.role !== 'confirm' || !result.data) {
    return null;
  }
  return result.data;
}

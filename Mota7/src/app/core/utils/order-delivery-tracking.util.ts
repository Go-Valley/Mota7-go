import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { ModalController, ToastController } from '@ionic/angular';
import {
  buildTrackingPointsFromOrder,
  presentTrackingMapModal,
  type TrackingDirectionsRole,
} from '../../my-order/delivery-service/destination-map-picker/destination-map-picker.presenter';

export type DeliveryTrackingPins = ReturnType<typeof buildTrackingPointsFromOrder>;

export function countDeliveryTrackingPins(pins: DeliveryTrackingPins): number {
  return [pins.providerPoint, pins.customerPoint, pins.destinationPoint].filter(Boolean)
    .length;
}

export function missingDeliveryTrackingLabels(pins: DeliveryTrackingPins): string[] {
  const out: string[] = [];
  if (!pins.providerPoint) out.push('كابتن التوصيل');
  if (!pins.customerPoint) out.push('العميل');
  if (!pins.destinationPoint) out.push('جهة الوصول');
  return out;
}

/** جلب أحدث إحداثيات الطلب من Firestore */
export async function refreshDeliveryOrderDoc(
  injector: EnvironmentInjector,
  firestore: Firestore,
  order: Record<string, unknown> & { id?: string }
): Promise<Record<string, unknown> & { id?: string }> {
  const id = order?.id != null ? String(order.id).trim() : '';
  if (!id) return order;
  try {
    const snap = await runInInjectionContext(injector, () =>
      getDoc(doc(firestore, 'orders', id))
    );
    if (snap.exists()) {
      return { ...order, ...(snap.data() as object), id };
    }
  } catch (e) {
    console.warn('[order-delivery-tracking] refresh', e);
  }
  return order;
}

/**
 * فتح خريطة التتبع الثلاثية (داخلية + جوجل) مع تنبيه عند نقص النقاط.
 */
export async function openDeliveryTrackingMap(
  modalCtrl: ModalController,
  order: Record<string, unknown> & { id?: string },
  directionsRole: TrackingDirectionsRole,
  toastCtrl?: ToastController
): Promise<void> {
  const pins = buildTrackingPointsFromOrder(order);
  const count = countDeliveryTrackingPins(pins);

  if (count === 0) {
    if (toastCtrl) {
      const t = await toastCtrl.create({
        message:
          'لا توجد نقاط موقع على الطلب بعد. فعّل «موقعي» أو انتظر تحديث الطرف الآخر.',
        duration: 3500,
        color: 'warning',
        position: 'bottom',
        mode: 'ios',
      });
      await t.present();
    }
    return;
  }

  if (count < 3 && toastCtrl) {
    const missing = missingDeliveryTrackingLabels(pins);
    const t = await toastCtrl.create({
      message: `عرض ${count} من 3 نقاط — بانتظار: ${missing.join('، ')}`,
      duration: 3000,
      color: 'medium',
      position: 'bottom',
      mode: 'ios',
    });
    await t.present();
  }

  await presentTrackingMapModal(modalCtrl, { order, directionsRole });
}

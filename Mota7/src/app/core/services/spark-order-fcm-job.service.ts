import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { isServiceOrderType, type ServiceOrderType } from '../constants/service-order-types';

/**
 * إشعار FCM لطلبات الخدمة (delivery | education | other) على Spark/Render.
 */
@Injectable({ providedIn: 'root' })
export class SparkOrderFcmJobService {
  private firestore = inject(Firestore);

  enqueueOrderCreatedPush(orderId: string, serviceType: ServiceOrderType): Promise<void> {
    const oid = String(orderId || '').trim();
    const st = String(serviceType || '')
      .trim()
      .toLowerCase();
    if (!oid || !isServiceOrderType(st)) {
      return Promise.resolve();
    }

    const baseUrl = String(environment.fcmPushServerUrl || '').trim().replace(/\/$/, '');
    const apiKey = String(environment.fcmPushApiKey || '').trim();

    const tasks: Promise<void>[] = [];

    if (baseUrl && apiKey) {
      tasks.push(
        fetch(`${baseUrl}/notify/order-created`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({ orderId: oid, serviceType: st }),
        })
          .then(() => undefined)
          .catch((err) => {
            console.warn('[FCM push] Render notify failed', err);
          })
      );
    }

    // احتياطي — يجب أن تطابق الحقول firestore.rules (kind, order_id, requestedAt [, service_type])
    tasks.push(
      addDoc(collection(this.firestore, 'spark_fcm_jobs'), {
        kind: 'order_created',
        order_id: oid,
        service_type: st,
        requestedAt: serverTimestamp(),
      })
        .then(() => undefined)
        .catch((err) => {
          console.warn('[FCM push] spark_fcm_jobs write failed', err);
        })
    );

    return Promise.all(tasks).then(() => undefined);
  }
}

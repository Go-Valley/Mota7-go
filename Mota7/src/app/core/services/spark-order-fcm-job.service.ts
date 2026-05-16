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

    const tasks: Promise<void>[] = [
      addDoc(collection(this.firestore, 'spark_fcm_jobs'), {
        kind: 'order_created',
        order_id: oid,
        service_type: st,
        requestedAt: serverTimestamp(),
      }).then(() => undefined),
    ];

    const baseUrl = String(environment.fcmPushServerUrl || '').trim().replace(/\/$/, '');
    const apiKey = String(environment.fcmPushApiKey || '').trim();
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
          .catch(() => undefined)
      );
    }

    return Promise.all(tasks).then(() => undefined);
  }
}

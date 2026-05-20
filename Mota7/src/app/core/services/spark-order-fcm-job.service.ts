import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { isServiceOrderType, type ServiceOrderType } from '../constants/service-order-types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * إشعار FCM لطلبات الخدمة (delivery | education | other) عبر Render + احتياط spark_fcm_jobs.
 */
@Injectable({ providedIn: 'root' })
export class SparkOrderFcmJobService {
  private firestore = inject(Firestore);

  enqueueOrderCreatedPush(
    orderId: string,
    serviceType: ServiceOrderType,
    order?: Record<string, unknown>
  ): Promise<void> {
    const oid = String(orderId || '').trim();
    const st = String(serviceType || '')
      .trim()
      .toLowerCase();
    if (!oid || !isServiceOrderType(st)) {
      return Promise.resolve();
    }

    const baseUrl = String(environment.fcmPushServerUrl || '').trim().replace(/\/$/, '');
    const apiKey = String(environment.fcmPushApiKey || '').trim();

    const notifyDirect =
      baseUrl && apiKey
        ? this.notifyRenderOrderCreated(baseUrl, apiKey, oid, st, order)
        : Promise.resolve(false);

    return notifyDirect.then((httpOk) => {
      if (httpOk) {
        return;
      }
      return addDoc(collection(this.firestore, 'spark_fcm_jobs'), {
        kind: 'order_created',
        order_id: oid,
        service_type: st,
        requestedAt: serverTimestamp(),
      })
        .then(() => undefined)
        .catch((err) => {
          console.warn('[FCM push] spark_fcm_jobs write failed', err);
        });
    });
  }

  /**
   * يستدعي Render فوراً مع لقطة الطلب (تجنّب سباق قراءة Firestore) ويعيد true عند نجاح HTTP.
   */
  private async notifyRenderOrderCreated(
    baseUrl: string,
    apiKey: string,
    orderId: string,
    serviceType: string,
    order?: Record<string, unknown>
  ): Promise<boolean> {
    const body: Record<string, unknown> = { orderId, serviceType };
    if (order && typeof order === 'object') {
      body['order'] = order;
    }

    const delays = [0, 400, 1000];
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) {
        await sleep(delays[i]);
      }
      try {
        const res = await fetch(`${baseUrl}/notify/order-created`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify(body),
        });
        let json: Record<string, unknown> = {};
        try {
          json = (await res.json()) as Record<string, unknown>;
        } catch {
          /* ignore */
        }

        if (res.ok) {
          const sent = Number(json['sent'] ?? 0);
          const providers = Number(json['providers'] ?? 0);
          const tokens = Number(json['tokens'] ?? 0);
          const skipped = String(json['skipped'] ?? '');
          if (skipped === 'duplicate_recent') {
            return true;
          }
          if (providers > 0 && tokens === 0) {
            console.warn(
              '[FCM push] matched providers but no device_tokens — تسجيل FCM على الجهاز؟',
              { orderId, providers, testOverride: json['testOverride'] }
            );
          }
          if (sent > 0 || skipped) {
            return true;
          }
          if (providers === 0) {
            console.warn('[FCM push] no matched providers', { orderId, json });
            return true;
          }
          return true;
        }

        if (res.status === 404 && i < delays.length - 1) {
          continue;
        }

        console.warn('[FCM push] Render notify HTTP', res.status, json);
      } catch (err) {
        console.warn('[FCM push] Render notify failed', err);
        if (i < delays.length - 1) {
          continue;
        }
      }
    }
    return false;
  }
}

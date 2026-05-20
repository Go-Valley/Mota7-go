import { Injectable, inject } from '@angular/core';
import { isServiceOrderType } from '../constants/service-order-types';
import { NewOrderNtfyService } from './new-order-ntfy.service';
import { SparkOrderFcmJobService } from './spark-order-fcm-job.service';

/**
 * بعد إنشاء أي طلب خدمة (توصيل / تعليم / أخرى): ntfy + FCM عبر Render أو spark_fcm_jobs.
 */
@Injectable({ providedIn: 'root' })
export class ServiceOrderPushService {
  private readonly ntfy = inject(NewOrderNtfyService);
  private readonly fcmJobs = inject(SparkOrderFcmJobService);

  afterOrderCreated(orderId: string, order: Record<string, unknown>): void {
    const oid = String(orderId || '').trim();
    const serviceType = String(order['serviceType'] ?? '')
      .trim()
      .toLowerCase();
    if (!oid || !isServiceOrderType(serviceType)) {
      return;
    }
    void this.ntfy.publishPendingOrder(oid, order);
    void this.fcmJobs.enqueueOrderCreatedPush(oid, serviceType, order);
  }
}

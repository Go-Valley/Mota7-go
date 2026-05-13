import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

/**
 * تفعيل إشعار طلبات الخدمة على خطة Spark دون Cloud Functions:
 * ننشئ job صغير في `spark_fcm_jobs` عند إنشاء طلب جديد،
 * ثم GitHub Actions (spark-runner) يرسل FCM ويحذف job.
 */
@Injectable({ providedIn: 'root' })
export class SparkOrderFcmJobService {
  private firestore = inject(Firestore);

  enqueueSparkOrderCreatedJob(orderId: string): Promise<void> {
    const oid = String(orderId || '').trim();
    if (!oid) {
      return Promise.resolve();
    }
    return addDoc(collection(this.firestore, 'spark_fcm_jobs'), {
      kind: 'order_created',
      order_id: oid,
      requestedAt: serverTimestamp(),
    }).then(() => undefined);
  }
}


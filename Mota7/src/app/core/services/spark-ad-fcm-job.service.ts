import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

/**
 * يفعّل FCM لمقدّمي ولوحة الأدمن تحت Spark (جدولة خارجية)، عبر مهمة في spark_fcm_jobs.
 * يُستدعَى بعد حفظ إعلان ناجح بحساب مستخدم مالك له.
 * تم استخدام استيراد مباشر من 'firebase/firestore' بدلاً من '@angular/fire/firestore'
 * لتجنب تحذيرات Injection Context في المهام الخلفية.
 */
@Injectable({
  providedIn: 'root'
})
export class SparkAdFcmJobService {
  private firestore = inject(Firestore);

  enqueueSparkAdFcmSavedJob(adId: string): Promise<void> {
    return addDoc(collection(this.firestore, 'spark_fcm_jobs'), {
      kind: 'ad_saved',
      ad_id: adId,
      requestedAt: serverTimestamp(),
    }).then(() => undefined);
  }
}

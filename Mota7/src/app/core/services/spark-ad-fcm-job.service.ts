import { Firestore, addDoc, collection, serverTimestamp } from '@angular/fire/firestore';

/**
 * يفعّل FCM لمقدّمي ولوحة الأدمن تحت Spark (جدولة خارجية)، عبر مهمة في spark_fcm_jobs.
 * يُستدعَى بعد حفظ إعلان ناجح بحساب مستخدم مالك له.
 */
export function enqueueSparkAdFcmSavedJob(fs: Firestore, adId: string): Promise<void> {
  return addDoc(collection(fs, 'spark_fcm_jobs'), {
    kind: 'ad_saved',
    ad_id: adId,
    requestedAt: serverTimestamp(),
  }).then(() => undefined);
}

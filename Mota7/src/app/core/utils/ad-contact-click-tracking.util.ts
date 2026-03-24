import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  doc,
  increment,
  setDoc,
  updateDoc,
  serverTimestamp,
} from '@angular/fire/firestore';

function resolveAdDocId(ad: { id?: string; ad_id?: string } | null | undefined): string | null {
  const id = ad?.id || ad?.ad_id;
  return id ? String(id) : null;
}

function localCalendarDateKey(d: Date = new Date()): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function logTitleFromAd(ad: any): string {
  return ad?.title || ad?.store_name || ad?.details?.short_desc || 'بدون عنوان';
}

function logImageFromAd(ad: any): string {
  if (ad?.image) return ad.image;
  if (ad?.details?.images?.length) return ad.details.images[0];
  return 'assets/mota7.png';
}

/**
 * يحدّث إعلاناً في Firestore: الحقول الجذرية + stats + سجل اليوم في daily_stats (للوحة الأدمن).
 */
export async function commitAdContactClickFirestore(
  firestore: Firestore,
  injector: EnvironmentInjector,
  ad: any,
  type: 'call' | 'whatsapp'
): Promise<void> {
  const adId = resolveAdDocId(ad);
  if (!adId) return;

  const today = localCalendarDateKey();
  const rootField = type === 'call' ? 'call_clicks' : 'whatsapp_clicks';
  const statsField = type === 'call' ? 'calls' : 'whatsapp';

  await runInInjectionContext(injector, async () => {
    await updateDoc(doc(firestore, 'ads', adId), {
      [rootField]: increment(1),
      [`stats.${statsField}`]: increment(1),
    });

    await setDoc(
      doc(firestore, 'daily_stats', today, 'ads_logs', adId),
      {
        ad_id: adId,
        title: logTitleFromAd(ad),
        owner: ad.owner_name || ad.owner || 'غير معروف',
        image: logImageFromAd(ad),
        [statsField]: increment(1),
        last_update: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

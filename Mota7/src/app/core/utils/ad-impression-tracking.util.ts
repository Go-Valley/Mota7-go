import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Firestore, doc, increment, updateDoc } from '@angular/fire/firestore';

const IMPRESSION_COOLDOWN_MS = 20 * 60 * 1000;
const LS_PREFIX = 'mota7_ad_imp_v1_';

export function canRecordAdImpression(adId: string): boolean {
  if (typeof localStorage === 'undefined' || !adId) return true;
  try {
    const raw = localStorage.getItem(LS_PREFIX + adId);
    if (!raw) return true;
    const t = Number(raw);
    if (!Number.isFinite(t)) return true;
    return Date.now() - t >= IMPRESSION_COOLDOWN_MS;
  } catch {
    return true;
  }
}

export function markAdImpressionRecorded(adId: string): void {
  if (typeof localStorage === 'undefined' || !adId) return;
  try {
    localStorage.setItem(LS_PREFIX + adId, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * يزيد عداد مشاهدة الإعلان (بعد ثبات الكارت في الشاشة). يُستدعى بعد التحقق من canRecordAdImpression.
 */
export async function commitAdImpressionFirestore(
  firestore: Firestore,
  injector: EnvironmentInjector,
  adId: string
): Promise<void> {
  if (!adId) return;
  await runInInjectionContext(injector, async () => {
    await updateDoc(doc(firestore, 'ads', adId), {
      impression_count: increment(1),
    });
  });
}

import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  Timestamp
} from '@angular/fire/firestore';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  ORDER_ARCHIVE_UI_MS,
  ORDER_DB_RETENTION_AFTER_UI_MS,
  timestampPlusMs,
  orderFieldToMs,
} from './order-lifecycle.util';

export async function finalizeOrderRemovedFromUi(
  injector: EnvironmentInjector,
  firestore: Firestore,
  orderId: string
): Promise<void> {
  await runInInjectionContext(injector, async () => {
    const ref = doc(firestore, 'orders', orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return;
    }
    const d = snap.data();
    if (d['removedFromUiAt']) {
      return;
    }
    const nowMs = Date.now();
    const now = Timestamp.fromMillis(nowMs);

    const createdAtMs = orderFieldToMs(d['createdAt'], nowMs);
    const expiresAt = Timestamp.fromMillis(createdAtMs + ORDER_DB_RETENTION_AFTER_UI_MS);

    await updateDoc(ref, {
      removedFromUiAt: now,
      expiresAt,
      isArchiving: false,
    });
  });
}

/**
 * انتهت مهلة الطلب المقبول دون ضغط «إنهاء المهمة» — يُعامل كطلب مكتمل بنفس حقول الإكمال اليدوي.
 * يُرجع true إذا تم التحديث من accepted → completed.
 */
export async function completeAcceptedOrderWhenWindowElapsed(
  injector: EnvironmentInjector,
  firestore: Firestore,
  orderId: string
): Promise<boolean> {
  return runInInjectionContext(injector, async () => {
    const ref = doc(firestore, 'orders', orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return false;
    }
    const d = snap.data();
    if (d['removedFromUiAt']) {
      return false;
    }
    if (d['status'] !== 'accepted') {
      return false;
    }
    const now = Timestamp.now();
    const uiArchiveUntil = timestampPlusMs(now, ORDER_ARCHIVE_UI_MS);

    const createdAtMs = orderFieldToMs(d['createdAt'], now.toMillis());
    const expiresAt = Timestamp.fromMillis(createdAtMs + ORDER_DB_RETENTION_AFTER_UI_MS);

    await updateDoc(ref, {
      status: 'completed',
      completedAt: now,
      expiresAt,
      isArchiving: true,
      uiArchiveUntil,
    });
    return true;
  });
}

/** حذف مستندات وصلت لـ expiresAt وبها removedFromUiAt (أمان ضد بيانات قديمة) */
export async function purgeFirestoreOrdersPastExpiresAt(
  injector: EnvironmentInjector,
  firestore: Firestore
): Promise<void> {
  await runInInjectionContext(injector, async () => {
    const now = Timestamp.now();
    const q = query(collection(firestore, 'orders'), where('expiresAt', '<=', now), limit(30));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      if (!data['removedFromUiAt']) {
        continue;
      }
      try {
        await deleteDoc(d.ref);
      } catch {
        /* ignore */
      }
    }
  });
}

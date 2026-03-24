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
import { ORDER_DB_RETENTION_AFTER_UI_MS } from './order-lifecycle.util';

export async function finalizeOrderRemovedFromUi(
  injector: EnvironmentInjector,
  firestore: Firestore,
  orderId: string
): Promise<void> {
  await runInInjectionContext(injector, async () => {
    const ref = doc(firestore, 'orders', orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const d = snap.data();
    if (d['removedFromUiAt']) return;
    const nowMs = Date.now();
    const now = Timestamp.fromMillis(nowMs);
    const expiresAt = Timestamp.fromMillis(nowMs + ORDER_DB_RETENTION_AFTER_UI_MS);
    await updateDoc(ref, {
      removedFromUiAt: now,
      expiresAt,
      isArchiving: false
    });
  });
}

export async function markAcceptedOrderTimedOut(
  injector: EnvironmentInjector,
  firestore: Firestore,
  orderId: string
): Promise<void> {
  await runInInjectionContext(injector, async () => {
    const ref = doc(firestore, 'orders', orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const d = snap.data();
    if (d['removedFromUiAt']) return;
    if (d['status'] !== 'accepted') return;
    const nowMs = Date.now();
    const now = Timestamp.fromMillis(nowMs);
    const expiresAt = Timestamp.fromMillis(nowMs + ORDER_DB_RETENTION_AFTER_UI_MS);
    await updateDoc(ref, {
      status: 'accept_expired',
      acceptExpiredAt: now,
      removedFromUiAt: now,
      expiresAt
    });
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
      if (!data['removedFromUiAt']) continue;
      try {
        await deleteDoc(d.ref);
      } catch {
        /* ignore */
      }
    }
  });
}

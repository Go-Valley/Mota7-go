import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { increment, type QueryConstraint } from 'firebase/firestore';
import { normalizeUserFreeText } from './order-form-fields.util';

/**
 * يبحث عن إعلان مقدم الخدمة المطابق لطلب مكتمل (نفس رقم المالك ومفتاح الخدمة).
 */
async function findProviderAdId(
  injector: EnvironmentInjector,
  firestore: Firestore,
  order: Record<string, unknown>
): Promise<string | null> {
  const ownerPhone = String(order['providerPhone'] ?? order['providerId'] ?? '').replace(/\D/g, '');
  if (!ownerPhone) return null;

  const serviceType = order['serviceType'];
  const constraints: QueryConstraint[] = [where('owner_phone', '==', ownerPhone)];

  if (serviceType === 'delivery') {
    const k = order['delivery_match_key'];
    if (k == null || String(k).trim() === '') return null;
    constraints.push(where('ad_type', '==', 'delivery'));
    constraints.push(where('delivery_match_key', '==', k));
  } else if (serviceType === 'education') {
    const k = order['education_match_key'];
    if (k == null || String(k).trim() === '') return null;
    constraints.push(where('ad_type', '==', 'education'));
    constraints.push(where('education_match_key', '==', k));
  } else if (serviceType === 'other') {
    const k = order['other_match_key'];
    if (k == null || String(k).trim() === '') return null;
    constraints.push(where('ad_type', '==', 'other'));
    constraints.push(where('other_match_key', '==', k));
  } else {
    return null;
  }

  const q = query(collection(firestore, 'ads'), ...constraints, limit(3));
  const snap = await runInInjectionContext(injector, () => getDocs(q));
  if (snap.empty) return null;
  return snap.docs[0].id;
}

/** حفظ تقييم طالب الخدمة على الطلب وعلى الإعلان (متوسط تراكمي). */
export async function submitOrderProviderRating(
  injector: EnvironmentInjector,
  firestore: Firestore,
  orderId: string,
  order: Record<string, unknown>,
  stars: number,
  commentRaw: string
): Promise<void> {
  const comment = normalizeUserFreeText(commentRaw).slice(0, 50);
  const now = Timestamp.now();
  const s = Math.min(5, Math.max(1, Math.round(stars)));

  const prevSnap = await runInInjectionContext(injector, () =>
    getDoc(doc(firestore, 'orders', orderId))
  );
  const prevData = prevSnap.exists() ? prevSnap.data() : undefined;
  const prevStars = prevData?.['customerProviderRating'];
  const hadPreviousRating = typeof prevStars === 'number' && prevStars >= 1;

  await runInInjectionContext(injector, () =>
    updateDoc(doc(firestore, 'orders', orderId), {
      customerProviderRating: s,
      customerProviderRatingComment: comment,
      customerRatedAt: now,
    })
  );

  const adId = await findProviderAdId(injector, firestore, order);
  if (!adId) return;

  const adUpdate = hadPreviousRating
    ? {
        provider_service_rating_sum: increment(s - (prevStars as number)),
        last_provider_rating: {
          stars: s,
          comment,
          ratedAt: now,
          orderId,
          customerPhone: order['customerPhone'] ?? '',
        },
      }
    : {
        provider_service_rating_count: increment(1),
        provider_service_rating_sum: increment(s),
        last_provider_rating: {
          stars: s,
          comment,
          ratedAt: now,
          orderId,
          customerPhone: order['customerPhone'] ?? '',
        },
      };

  try {
    await runInInjectionContext(injector, () =>
      updateDoc(doc(firestore, 'ads', adId), adUpdate as any)
    );
  } catch (e) {
    console.error('submitOrderProviderRating: ads update failed', e);
  }
}

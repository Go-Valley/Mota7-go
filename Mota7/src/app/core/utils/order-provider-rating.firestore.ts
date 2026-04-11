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
import { normalizeMatchKeyForOrders } from './match-key-normalize';

function asCleanId(value: unknown): string | null {
  const v = String(value ?? '').trim();
  return v ? v : null;
}

function asCleanPhoneDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

async function canUseAdDocForProvider(
  injector: EnvironmentInjector,
  firestore: Firestore,
  adId: string,
  ownerPhone: string
): Promise<boolean> {
  try {
    const adSnap = await runInInjectionContext(injector, () =>
      getDoc(doc(firestore, 'ads', adId))
    );
    if (!adSnap.exists()) return false;
    const ad = adSnap.data() as Record<string, unknown>;
    const adOwnerPhone = asCleanPhoneDigits(ad['owner_phone']);
    return !!adOwnerPhone && adOwnerPhone === ownerPhone;
  } catch {
    return false;
  }
}

function buildServiceConstraints(
  injector: EnvironmentInjector,
  serviceType: unknown,
  order: Record<string, unknown>
): Promise<QueryConstraint[]> {
  const st = String(serviceType ?? '').trim();
  if (st === 'delivery') {
    const k = order['delivery_match_key'];
    if (k == null || String(k).trim() === '') return Promise.resolve([]);
    return Promise.all([
      runInInjectionContext(injector, () => where('ad_type', '==', 'delivery')),
      runInInjectionContext(injector, () => where('delivery_match_key', '==', k)),
    ]);
  }
  if (st === 'education') {
    const k = order['education_match_key'];
    if (k == null || String(k).trim() === '') return Promise.resolve([]);
    return Promise.all([
      runInInjectionContext(injector, () => where('ad_type', '==', 'education')),
      runInInjectionContext(injector, () => where('education_match_key', '==', k)),
    ]);
  }
  if (st === 'other') {
    const k = order['other_match_key'];
    if (k == null || String(k).trim() === '') return Promise.resolve([]);
    return Promise.all([
      runInInjectionContext(injector, () => where('ad_type', '==', 'other')),
      runInInjectionContext(injector, () => where('other_match_key', '==', k)),
    ]);
  }
  return Promise.resolve([]);
}

/**
 * مطابقة مفتاح الطلب مع مفتاح الإعلان — نفس منطق cus-order (تطبيع أحرف عربية).
 */
function deliveryKeysAlign(orderKey: string, adKey: string): boolean {
  return normalizeMatchKeyForOrders(orderKey) === normalizeMatchKeyForOrders(adKey);
}

async function findProviderAdByOwnerAndNormalizedKeys(
  injector: EnvironmentInjector,
  firestore: Firestore,
  ownerPhone: string,
  order: Record<string, unknown>
): Promise<string | null> {
  const st = String(order['serviceType'] ?? '').trim();
  const orderDel = String(order['delivery_match_key'] ?? '');
  const orderEdu = String(order['education_match_key'] ?? '');
  const orderOth = String(order['other_match_key'] ?? '');

  const ownerConstraint = await runInInjectionContext(injector, () =>
    where('owner_phone', '==', ownerPhone)
  );
  const fallbackQ = await runInInjectionContext(injector, () =>
    query(collection(firestore, 'ads'), ownerConstraint, limit(40))
  );
  const fallbackSnap = await runInInjectionContext(injector, () => getDocs(fallbackQ));
  if (fallbackSnap.empty) return null;

  for (const adDoc of fallbackSnap.docs) {
    const adData = adDoc.data() as Record<string, unknown>;
    const adType = String(adData['ad_type'] ?? '').trim();
    if (st === 'delivery' && adType === 'delivery') {
      if (deliveryKeysAlign(orderDel, String(adData['delivery_match_key'] ?? ''))) {
        return adDoc.id;
      }
    }
    if (st === 'education' && adType === 'education') {
      if (deliveryKeysAlign(orderEdu, String(adData['education_match_key'] ?? ''))) {
        return adDoc.id;
      }
    }
    if (st === 'other' && adType === 'other') {
      if (deliveryKeysAlign(orderOth, String(adData['other_match_key'] ?? ''))) {
        return adDoc.id;
      }
    }
  }

  for (const adDoc of fallbackSnap.docs) {
    const adData = adDoc.data() as Record<string, unknown>;
    const adType = String(adData['ad_type'] ?? '').trim();
    if (st === 'delivery' && adType === 'delivery') return adDoc.id;
    if (st === 'education' && adType === 'education') return adDoc.id;
    if (st === 'other' && adType === 'other') return adDoc.id;
  }

  return null;
}

/**
 * يبحث عن إعلان مقدم الخدمة المطابق لطلب مكتمل (نفس رقم المالك ومفتاح الخدمة).
 */
export async function findProviderAdId(
  injector: EnvironmentInjector,
  firestore: Firestore,
  order: Record<string, unknown>
): Promise<string | null> {
  const ownerPhone = asCleanPhoneDigits(order['providerPhone'] ?? order['providerId']);
  if (!ownerPhone) return null;

  const candidateAdId =
    asCleanId(order['providerSourceAdId']) ??
    asCleanId(order['adId']) ??
    asCleanId(order['ad_id']) ??
    asCleanId(order['providerAdId']) ??
    asCleanId(order['provider_ad_id']);
  if (candidateAdId) {
    const valid = await canUseAdDocForProvider(injector, firestore, candidateAdId, ownerPhone);
    if (valid) return candidateAdId;
  }

  const ownerConstraint = await runInInjectionContext(injector, () =>
    where('owner_phone', '==', ownerPhone)
  );
  const serviceConstraints = await buildServiceConstraints(injector, order['serviceType'], order);
  const constraints: QueryConstraint[] = [ownerConstraint, ...serviceConstraints];

  if (serviceConstraints.length > 0) {
    try {
      const q = await runInInjectionContext(injector, () =>
        query(collection(firestore, 'ads'), ...constraints, limit(3))
      );
      const snap = await runInInjectionContext(injector, () => getDocs(q));
      if (!snap.empty) {
        return snap.docs[0].id;
      }
    } catch (error) {
      console.warn('findProviderAdId: indexed query failed, using owner scan', error);
    }
  }

  return findProviderAdByOwnerAndNormalizedKeys(injector, firestore, ownerPhone, order);
}

/**
 * بعد قبول الطلب: ربط معرّف إعلان مقدم الخدمة بالطلب لتقييم دقيق لاحقاً.
 */
export async function attachProviderAdIdToOrder(
  injector: EnvironmentInjector,
  firestore: Firestore,
  orderId: string,
  order: Record<string, unknown>
): Promise<void> {
  if (asCleanId(order['providerSourceAdId'])) return;
  const adId = await findProviderAdId(injector, firestore, order);
  if (!adId) return;
  try {
    await runInInjectionContext(injector, () =>
      updateDoc(doc(firestore, 'orders', orderId), { providerSourceAdId: adId })
    );
  } catch (e) {
    console.warn('attachProviderAdIdToOrder', e);
  }
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

  const orderForLookup = {
    ...(order as Record<string, unknown>),
    ...(prevData as Record<string, unknown>),
  } as Record<string, unknown>;

  const adId = await findProviderAdId(injector, firestore, orderForLookup);
  if (!adId) {
    console.warn(
      'submitOrderProviderRating: لم يُعثر على إعلان مرتبط بالطلب — لن يُحدَّث متوسط التقييم في ads',
      { orderId, serviceType: orderForLookup['serviceType'] }
    );
    return;
  }

  const adUpdate = hadPreviousRating
    ? {
        provider_service_rating_sum: increment(s - (prevStars as number)),
        last_provider_rating: {
          stars: s,
          comment,
          ratedAt: now,
          orderId,
          customerPhone: orderForLookup['customerPhone'] ?? '',
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
          customerPhone: orderForLookup['customerPhone'] ?? '',
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

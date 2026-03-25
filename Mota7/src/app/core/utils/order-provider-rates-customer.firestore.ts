import { Firestore, doc, Timestamp, updateDoc } from '@angular/fire/firestore';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { normalizeUserFreeText } from './order-form-fields.util';

/** تقييم مقدم الخدمة لطالب الخدمة (يُحفظ على مستند الطلب). */
export async function submitProviderRatesCustomer(
  injector: EnvironmentInjector,
  firestore: Firestore,
  orderId: string,
  stars: number,
  commentRaw: string
): Promise<void> {
  const comment = normalizeUserFreeText(commentRaw).slice(0, 50);
  const now = Timestamp.now();
  const s = Math.min(5, Math.max(1, Math.round(stars)));

  await runInInjectionContext(injector, async () => {
    await updateDoc(doc(firestore, 'orders', orderId), {
      providerCustomerRating: s,
      providerCustomerRatingComment: comment,
      providerRatedCustomerAt: now,
    });
  });
}

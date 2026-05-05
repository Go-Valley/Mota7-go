import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';

/** اسم مجموعة طلبات/إعدادات التسوق على Firestore */
export const SHOPPING_COLLECTION = 'shopping';

/** معرّف ثابت لمستند مبالغ التوصيل (in / out) داخل مجموعة shopping */
export const SHOPPING_DELIVERY_CHARGES_DOC_ID = 'delivery_charges';

/**
 * مفتاح مستند طلب شراء على Firestore معتمد على رقم الهاتف (وليس المعرف العشوائي لـ Firebase)
 * لتسهيل تتبع الطلب في الكونسول: {أرقام فقط}_{دليل طلب واحد}_{زمن}_{عشوائي}
 */
export function generateShoppingOrderDocumentId(buyerPhone: string): string {
  const digits = String(buyerPhone ?? '').replace(/\D/g, '');
  const prefix =
    digits.length >= 10
      ? digits
      : digits.length > 0
        ? digits
        : 'unknown_phone';
  return `${prefix}_o_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

const DELIVERY_PAYLOAD = {
  docType: 'delivery_config',
  in: '0',
  out: '0',
} as const;

/**
 * تهيئة تلقائية لمجموعة shopping: إنشاء مستند delivery_charges عند الغياب
 * حتى لا تُنشأ أي مجموعات يدوياً من الكونسول.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingFirestoreSeedService {
  private fs = inject(Firestore);
  private inj = inject(EnvironmentInjector);

  async ensureShoppingDeliveryChargesDoc(): Promise<void> {
    await runInInjectionContext(this.inj, async () => {
      const ref = doc(this.fs, SHOPPING_COLLECTION, SHOPPING_DELIVERY_CHARGES_DOC_ID);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return;
      }
      try {
        await setDoc(ref, { ...DELIVERY_PAYLOAD });
      } catch (e) {
        const retry = await getDoc(ref);
        if (!retry.exists()) {
          console.warn('[shopping] failed to seed delivery_charges:', e);
        }
      }
    });
  }
}

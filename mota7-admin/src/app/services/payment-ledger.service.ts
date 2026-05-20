import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import {
  PAYMENT_LEDGER_COLLECTION,
  PaymentLedgerEntry,
  PaymentLedgerStatus,
  PaymentLedgerWriteInput,
} from '../core/models/payment-ledger.model';
import {
  coerceLedgerEntry,
  monthRangeUtc,
  normalizeUserKey,
} from '../core/utils/payment-ledger.util';

@Injectable({ providedIn: 'root' })
export class PaymentLedgerService {
  private readonly fs = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  newSessionId(): string {
    return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async createEntry(input: PaymentLedgerWriteInput): Promise<string> {
    const userKey = normalizeUserKey(input.userKey);
    if (!userKey) {
      throw new Error('userKey required');
    }
    const paidAt = Timestamp.fromDate(input.paidAt);
    const payload: Record<string, unknown> = {
      userKey,
      productType: input.productType,
      product_variant: input.productVariant,
      productVariant: input.productVariant,
      product_type: input.productType,
      amountEgp: input.amountEgp,
      amount_egp: input.amountEgp,
      periodStart: input.periodStart,
      period_start: input.periodStart,
      periodEnd: input.periodEnd,
      period_end: input.periodEnd,
      paid_at: paidAt,
      paymentMethod: input.paymentMethod,
      payment_method: input.paymentMethod,
      status: 'recorded' as PaymentLedgerStatus,
      recorded_at: serverTimestamp(),
    };
    const phone = String(input.userPhone ?? '').trim();
    if (phone) payload['userPhone'] = phone;
    if (input.listPriceEgp != null && input.listPriceEgp > 0) {
      payload['listPriceEgp'] = input.listPriceEgp;
      payload['list_price_egp'] = input.listPriceEgp;
    }
    const ref = String(input.reference ?? '').trim();
    if (ref) payload['reference'] = ref;
    const notes = String(input.notes ?? '').trim();
    if (notes) payload['notes'] = notes;
    const sid = String(input.sessionId ?? '').trim();
    if (sid) payload['sessionId'] = sid;

    return runInInjectionContext(this.injector, async () => {
      const colRef = collection(this.fs, PAYMENT_LEDGER_COLLECTION);
      const docRef = await addDoc(colRef, payload);
      return docRef.id;
    });
  }

  async createBatch(inputs: PaymentLedgerWriteInput[]): Promise<string[]> {
    const ids: string[] = [];
    for (const row of inputs) {
      ids.push(await this.createEntry(row));
    }
    return ids;
  }

  async listByPaidMonth(monthKey: string): Promise<PaymentLedgerEntry[]> {
    const range = monthRangeUtc(monthKey);
    if (!range) return [];
    const startTs = Timestamp.fromDate(range.start);
    const endTs = Timestamp.fromDate(range.end);

    return runInInjectionContext(this.injector, async () => {
      const colRef = collection(this.fs, PAYMENT_LEDGER_COLLECTION);
      const q = query(
        colRef,
        where('paid_at', '>=', startTs),
        where('paid_at', '<=', endTs),
        orderBy('paid_at', 'desc')
      );
      const snap = await getDocs(q);
      const out: PaymentLedgerEntry[] = [];
      for (const d of snap.docs) {
        const row = coerceLedgerEntry(d.id, d.data() as Record<string, unknown>);
        if (row) out.push(row);
      }
      return out;
    });
  }

  async updateStatus(id: string, status: PaymentLedgerStatus): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.fs, PAYMENT_LEDGER_COLLECTION, id), { status })
    );
  }
}

import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { normalizeMatchKeyForOrders } from '../utils/match-key-normalize';
import type { ParsedOrderNtfy } from '../utils/order-ntfy.util';

/**
 * مفاتيح تطابق الطلبات مع إعلانات مقدم الخدمة (نفس منطق cus-order).
 */
@Injectable({ providedIn: 'root' })
export class ProviderMatchService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  private loadedFor: string | null = null;
  private loadedAt = 0;
  private deliveryKeysNorm: string[] = [];
  private educationKeysNorm: string[] = [];
  private otherKeysNorm: string[] = [];

  private readonly reloadMs = 45_000;

  reset(): void {
    this.loadedFor = null;
    this.loadedAt = 0;
    this.deliveryKeysNorm = [];
    this.educationKeysNorm = [];
    this.otherKeysNorm = [];
  }

  async ensureLoaded(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      this.reset();
      return;
    }
    const userId = user.email ? user.email.split('@')[0] : user.uid;
    const now = Date.now();
    if (this.loadedFor === userId && now - this.loadedAt < this.reloadMs) {
      return;
    }
    this.loadedFor = userId;
    this.loadedAt = now;
    this.deliveryKeysNorm = [];
    this.educationKeysNorm = [];
    this.otherKeysNorm = [];

    try {
      const userDoc = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', userId))
      );
      if (!userDoc.exists()) {
        return;
      }
      const phone = String(userDoc.data()['phone'] || '');
      if (!phone) {
        return;
      }

      const adsSnap = await runInInjectionContext(this.injector, () =>
        getDocs(
          query(
            collection(this.firestore, 'ads'),
            where('owner_phone', '==', phone),
            where('is_available', '==', true)
          )
        )
      );

      adsSnap.forEach((d) => {
        const ad = d.data();
        if (ad['education_match_key']) {
          this.educationKeysNorm.push(
            normalizeMatchKeyForOrders(String(ad['education_match_key']))
          );
        }
        if (ad['delivery_match_key']) {
          this.deliveryKeysNorm.push(
            normalizeMatchKeyForOrders(String(ad['delivery_match_key']))
          );
        }
        if (ad['other_match_key']) {
          this.otherKeysNorm.push(
            normalizeMatchKeyForOrders(String(ad['other_match_key']))
          );
        }
      });
    } catch (e) {
      console.warn('[ProviderMatchService]', e);
    }
  }

  /** هل رسالة ntfy الخاصة بالطلب تخص مقدم الخدمة الحالي؟ */
  matchesParsedOrderNtfy(parsed: ParsedOrderNtfy): boolean {
    const svc = (parsed.svc || '').trim();
    const d = parsed.dKey ? normalizeMatchKeyForOrders(parsed.dKey) : '';
    const e = parsed.eKey ? normalizeMatchKeyForOrders(parsed.eKey) : '';
    const o = parsed.oKey ? normalizeMatchKeyForOrders(parsed.oKey) : '';

    if (svc === 'delivery' && d) {
      return this.deliveryKeysNorm.includes(d);
    }
    if (svc === 'education' && e) {
      return this.educationKeysNorm.includes(e);
    }
    if (svc === 'other' && o) {
      return this.otherKeysNorm.includes(o);
    }
    return false;
  }
}

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
import { resolveProviderPhoneFromAuth } from '../utils/provider-auth-phone.util';
import { normalizeProviderPhoneForLookup } from '../utils/provider-phone-normalize.util';
import { normalizeAdTypeValue } from '../utils/duplicate-ad.util';
import {
  deliveryOrderMatches,
  educationOrderMatches,
  otherOrderMatches,
} from '../utils/service-order-coverage-match.util';

/**
 * مفاتيح تطابق الطلبات مع إعلانات مقدم الخدمة (موازٍ لـ cus-order).
 */
@Injectable({ providedIn: 'root' })
export class ProviderMatchService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  private loadedFor: string | null = null;
  private loadedAt = 0;
  /** مطابقة قديمة عبر مفتاح نصّي وحيد */
  private deliveryKeysNorm: string[] = [];
  private educationKeysNorm: string[] = [];
  private otherKeysNorm: string[] = [];
  private adsDelivery: Record<string, unknown>[] = [];
  private adsEducation: Record<string, unknown>[] = [];
  private adsOther: Record<string, unknown>[] = [];

  private readonly reloadMs = 45_000;

  reset(): void {
    this.loadedFor = null;
    this.loadedAt = 0;
    this.deliveryKeysNorm = [];
    this.educationKeysNorm = [];
    this.otherKeysNorm = [];
    this.adsDelivery = [];
    this.adsEducation = [];
    this.adsOther = [];
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
    this.adsDelivery = [];
    this.adsEducation = [];
    this.adsOther = [];

    try {
      let phone = resolveProviderPhoneFromAuth(user, userId);
      if (!phone) {
        const userDoc = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', userId))
        );
        if (userDoc.exists()) {
          phone = normalizeProviderPhoneForLookup(String(userDoc.data()['phone'] || ''));
        }
      }
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
        const ad = d.data() as Record<string, unknown>;
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
          this.otherKeysNorm.push(normalizeMatchKeyForOrders(String(ad['other_match_key'])));
        }
        const t = normalizeAdTypeValue(String(ad['ad_type'] ?? '').trim());
        if (t === 'delivery') this.adsDelivery.push(ad);
        else if (t === 'education') this.adsEducation.push(ad);
        else if (t === 'other') this.adsOther.push(ad);
      });
    } catch (e) {
      console.warn('[ProviderMatchService]', e);
    }
  }

  /** هل رسالة ntfy الخاصة بالطلب تخص مقدم الخدمة الحالي؟ */
  matchesParsedOrderNtfy(parsed: ParsedOrderNtfy): boolean {
    const svc = (parsed.svc || '').trim();
    const cidsRaw = String(parsed.cidCsv || '').trim();
    const cidsArr = cidsRaw
      ? cidsRaw
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

    const baseOrder = (): Record<string, unknown> =>
      ({
        order_coverage_city_ids: cidsArr,
        city: '',
      }) as Record<string, unknown>;

    if (svc === 'delivery') {
      const dk = normalizeMatchKeyForOrders(parsed.dKey);
      const dto = normalizeMatchKeyForOrders(parsed.dSvcTok);
      if (dto || cidsArr.length || dk) {
        const mock = {
          ...baseOrder(),
          serviceType: 'delivery',
          delivery_match_key: parsed.dKey,
          delivery_service_token: parsed.dSvcTok,
        };
        return this.adsDelivery.some((ad) => deliveryOrderMatches(mock, ad));
      }
      return dk ? this.deliveryKeysNorm.includes(dk) : false;
    }
    if (svc === 'education') {
      const ek = normalizeMatchKeyForOrders(parsed.eKey);
      const eduTok = normalizeMatchKeyForOrders(parsed.eSubTok);
      if (eduTok || cidsArr.length || ek) {
        const mock = {
          ...baseOrder(),
          serviceType: 'education',
          education_match_key: parsed.eKey,
          education_subject_token: parsed.eSubTok,
        };
        return this.adsEducation.some((ad) => educationOrderMatches(mock, ad));
      }
      return ek ? this.educationKeysNorm.includes(ek) : false;
    }
    if (svc === 'other') {
      const ok = normalizeMatchKeyForOrders(parsed.oKey);
      const ot = normalizeMatchKeyForOrders(parsed.oSvcTok);
      if (ot || cidsArr.length || ok) {
        const mock = {
          ...baseOrder(),
          serviceType: 'other',
          other_match_key: parsed.oKey,
          other_service_token: parsed.oSvcTok,
        };
        return this.adsOther.some((ad) => otherOrderMatches(mock, ad));
      }
      return ok ? this.otherKeysNorm.includes(ok) : false;
    }
    return false;
  }
}

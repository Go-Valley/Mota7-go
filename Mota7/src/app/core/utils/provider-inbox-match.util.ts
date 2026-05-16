import { PROVIDER_INBOX_CRITERIA } from '../constants/provider-inbox-criteria';
import { normalizeAdTypeValue } from './duplicate-ad.util';
import { normalizeMatchKeyForOrders } from './match-key-normalize';
import { orderHiddenFromProviderInbox } from './order-lifecycle.util';
import {
  deliveryOrderMatches,
  educationOrderMatches,
  otherOrderMatches,
} from './service-order-coverage-match.util';
import { normalizeProviderPhoneForLookup } from './provider-phone-normalize.util';

export type ProviderInboxOrder = { id: string } & Record<string, unknown>;

export type ProviderInboxMatchContext = {
  userId: string;
  providerPhone: string;
  providerAds: Record<string, unknown>[];
};

export function providerInTestOverrideList(providerPhone: string): boolean {
  if (!PROVIDER_INBOX_CRITERIA.testOverride.enabled) {
    return false;
  }
  const p = normalizeProviderPhoneForLookup(providerPhone);
  return PROVIDER_INBOX_CRITERIA.testOverride.providerPhones.some(
    (x) => normalizeProviderPhoneForLookup(x) === p
  );
}

/** نفس منطق fcm-push-server: هل يطابق الطلب أحد إعلانات المزود المتاحة؟ */
export function orderMatchesProviderAds(
  order: Record<string, unknown>,
  providerAds: Record<string, unknown>[]
): boolean {
  const svc = String(order['serviceType'] ?? '')
    .trim()
    .toLowerCase();
  const adType = PROVIDER_INBOX_CRITERIA.serviceToAdType[svc];
  if (!adType) {
    return false;
  }

  let rawKey: string | null = null;
  let fieldPath = '';
  if (svc === 'delivery') {
    fieldPath = 'delivery_match_key';
    rawKey = String(order['delivery_match_key'] ?? '').trim() || null;
  } else if (svc === 'education') {
    fieldPath = 'education_match_key';
    rawKey = String(order['education_match_key'] ?? '').trim() || null;
  } else {
    fieldPath = 'other_match_key';
    rawKey = String(order['other_match_key'] ?? '').trim() || null;
  }

  for (const ad of providerAds) {
    if (normalizeAdTypeValue(String(ad['ad_type'] ?? '')) !== adType) {
      continue;
    }

    let hit = false;
    if (PROVIDER_INBOX_CRITERIA.matching.useCoverageAndServiceToken) {
      if (svc === 'delivery') {
        hit = deliveryOrderMatches(order, ad);
      } else if (svc === 'education') {
        hit = educationOrderMatches(order, ad);
      } else {
        hit = otherOrderMatches(order, ad);
      }
    }

    if (
      !hit &&
      PROVIDER_INBOX_CRITERIA.matching.allowExactMatchKeyFallback &&
      rawKey &&
      ad[fieldPath]
    ) {
      hit =
        normalizeMatchKeyForOrders(String(ad[fieldPath])) ===
        normalizeMatchKeyForOrders(rawKey);
    }

    if (hit) {
      return true;
    }
  }

  return false;
}

/**
 * هل يظهر الطلب في صفحة طلبات العملاء؟
 * — معلّق + نفس معايير push، أو مقبول من هذا المزود.
 */
export function isOrderVisibleInProviderInbox(
  order: ProviderInboxOrder,
  ctx: ProviderInboxMatchContext
): boolean {
  if (orderHiddenFromProviderInbox(order)) {
    return false;
  }

  const uid = ctx.userId;

  if (order['status'] === 'accepted' && order['providerId'] === uid) {
    return true;
  }

  if (order['status'] !== 'pending') {
    return false;
  }

  const ignoredBy = order['ignoredBy'] as Record<string, unknown> | undefined;
  if (ignoredBy && ignoredBy[uid]) {
    return false;
  }

  const svc = String(order['serviceType'] ?? '')
    .trim()
    .toLowerCase();
  if (!(PROVIDER_INBOX_CRITERIA.supportedServiceTypes as readonly string[]).includes(svc)) {
    return false;
  }

  if (providerInTestOverrideList(ctx.providerPhone)) {
    return true;
  }

  return orderMatchesProviderAds(order, ctx.providerAds);
}

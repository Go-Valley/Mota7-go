'use strict';

const criteria = require('../config/recipient-criteria.cjs');

/** منع إرسال مكرر لنفس الطلب خلال نافذة قصيرة (HTTP مباشر + spark_fcm_jobs) */
const recentNotifyByOrderId = new Map();
const NOTIFY_DEDUP_MS = 90_000;

function shouldSkipDuplicateNotify(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return false;
  const now = Date.now();
  const prev = recentNotifyByOrderId.get(id);
  if (prev && now - prev < NOTIFY_DEDUP_MS) {
    return true;
  }
  recentNotifyByOrderId.set(id, now);
  if (recentNotifyByOrderId.size > 500) {
    for (const [k, t] of recentNotifyByOrderId) {
      if (now - t > NOTIFY_DEDUP_MS) recentNotifyByOrderId.delete(k);
    }
  }
  return false;
}
const { collectMatchedProviderPhones } = require('./collect-provider-phones.cjs');
const { publishOrderNtfy } = require('./publish-order-ntfy.cjs');
const { getTokensForPhones } = require('./device-tokens.cjs');
const { sendToTokens, sendToTopic } = require('./fcm-rest.cjs');
const {
  providerOrderFcmTitle,
  providerOrderNotificationBody,
} = require('./order-notification-copy.cjs');

function shortOrderPreview(order) {
  const st = String(order.serviceType || '');
  if (st === 'delivery') {
    const p = [order.subService, order.city, order.fromLocation, order.toLocation]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (p.join(' — ') || 'طلب توصيل').slice(0, 120);
  }
  if (st === 'education') {
    const p = [order.stageName, order.subjectName, order.city]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (p.join(' — ') || 'طلب تعليمي').slice(0, 120);
  }
  if (st === 'other') {
    const p = [order.subService, order.city]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (p.join(' — ') || 'طلب خدمة').slice(0, 120);
  }
  return 'طلب خدمة جديد';
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} orderId
 * @param {Record<string, unknown>} order
 */
async function notifyOrderCreated(db, orderId, order) {
  if (shouldSkipDuplicateNotify(orderId)) {
    console.log('[notify] skip duplicate', orderId);
    return { skipped: 'duplicate_recent' };
  }

  if (criteria.order.requireStatusPending && String(order.status || '') !== 'pending') {
    console.log('[notify] skip non-pending', orderId, order.status);
    return { skipped: 'not_pending' };
  }

  const serviceType = String(order.serviceType || '')
    .trim()
    .toLowerCase();
  if (!criteria.supportedServiceTypes.includes(serviceType)) {
    console.log('[notify] unsupported serviceType', serviceType);
    return { skipped: 'unsupported_service_type' };
  }

  void publishOrderNtfy(orderId, order).catch(() => {});

  const preview = shortOrderPreview(order);
  const dataPayload = {
    kind: 'order_new',
    order_id: orderId,
    service_type: serviceType,
  };

  try {
    await sendToTopic(criteria.notification.adminTopic, {
      title: 'طلب خدمة جديد (معلق)',
      body: `طلب جديد: ${preview}`,
    }, dataPayload);
  } catch (e) {
    console.error('[notify] admin topic', e?.message || e);
  }

  const phones = await collectMatchedProviderPhones(db, order);
  if (!phones.length) {
    console.log('[notify] no matched provider phones', orderId);
    return { ok: true, providers: 0, tokens: 0, sent: 0 };
  }

  const tokens = await getTokensForPhones(db, phones);
  if (!tokens.length) {
    console.log('[notify] no device tokens for phones', phones);
    return { ok: true, providers: phones.length, tokens: 0, sent: 0 };
  }

  const fcm = await sendToTokens(
    tokens,
    {
      title: providerOrderFcmTitle(serviceType),
      body: providerOrderNotificationBody(preview, serviceType),
    },
    dataPayload
  );

  console.log('[notify] done', orderId, {
    providers: phones.length,
    tokens: tokens.length,
    sent: fcm.sent,
    failed: fcm.failed,
    testOverride: criteria.testOverride.enabled,
  });

  return {
    ok: true,
    providers: phones.length,
    tokens: tokens.length,
    sent: fcm.sent,
    failed: fcm.failed,
    errors: fcm.errors,
  };
}

module.exports = { notifyOrderCreated, shortOrderPreview };

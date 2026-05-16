'use strict';

const criteria = require('../config/recipient-criteria.cjs');
const { collectMatchedProviderPhones } = require('./collect-provider-phones.cjs');
const { getTokensForPhones } = require('./device-tokens.cjs');
const { sendToTokens, sendToTopic } = require('./fcm-rest.cjs');

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

function orderPushTitle(serviceType) {
  const st = String(serviceType || '').trim().toLowerCase();
  if (st === 'delivery') return 'Mota7: new delivery order';
  if (st === 'education') return 'Mota7: new education order';
  if (st === 'other') return 'Mota7: new service order';
  return 'Mota7: new order';
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} orderId
 * @param {Record<string, unknown>} order
 */
async function notifyOrderCreated(db, orderId, order) {
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
      title: orderPushTitle(serviceType),
      body: `${preview}\n${criteria.notification.providerBodySuffix}`,
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

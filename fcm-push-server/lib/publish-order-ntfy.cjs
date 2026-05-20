'use strict';

const { buildOrderNtfyMessageBody } = require('./order-ntfy-body.cjs');
const { providerOrderNtfyAsciiTitle } = require('./order-notification-copy.cjs');

/**
 * نشر طلب خدمة على ntfy من الخادم (لا يعتمد على جهاز العميل).
 */
async function publishOrderNtfy(orderId, order) {
  if (process.env.NTFY_ORDERS_ENABLED === '0') {
    return { skipped: 'disabled' };
  }

  const base = String(process.env.NTFY_BASE_URL || 'https://ntfy.sh').replace(/\/$/, '');
  const topic = String(
    process.env.NTFY_ORDERS_TOPIC || process.env.NTFY_TOPIC || ''
  ).trim();
  if (!topic) {
    return { skipped: 'no_topic' };
  }

  const st = String(order.serviceType || '').trim().toLowerCase();
  const body = buildOrderNtfyMessageBody(order, orderId);
  const url = `${base}/${encodeURIComponent(topic)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Title: providerOrderNtfyAsciiTitle(st),
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body,
    });
    if (!res.ok) {
      console.warn('[ntfy] HTTP', res.status, orderId);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[ntfy] publish failed', orderId, e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

module.exports = { publishOrderNtfy };

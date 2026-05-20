'use strict';

const { normalizeMatchKeyForOrders } = require('./match-keys.cjs');

function buildOrderPreviewForNtfy(order) {
  const st = String(order.serviceType || '');
  if (st === 'delivery') {
    const parts = [order.subService, order.city, order.fromLocation, order.toLocation]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (parts.join(' — ') || 'طلب توصيل').slice(0, 220);
  }
  if (st === 'education') {
    const parts = [order.stageName, order.subjectName, order.city]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (parts.join(' — ') || 'طلب درس').slice(0, 220);
  }
  if (st === 'other') {
    const parts = [order.subService, order.city, order.shortNote]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (parts.join(' — ') || 'طلب خدمة').slice(0, 220);
  }
  return 'طلب خدمة جديد';
}

/** جسم رسالة ntfy — موازٍ لـ Mota7 order-ntfy.util.ts */
function buildOrderNtfyMessageBody(order, orderId) {
  const preview = buildOrderPreviewForNtfy(order);
  const st = String(order.serviceType || '');
  const oid = String(orderId || '').trim();

  if (st === 'delivery' && order.delivery_match_key) {
    const k = normalizeMatchKeyForOrders(String(order.delivery_match_key));
    const dst = normalizeMatchKeyForOrders(String(order.delivery_service_token || '').trim());
    const cids = Array.isArray(order.order_coverage_city_ids)
      ? order.order_coverage_city_ids.map((x) => String(x ?? '').trim()).filter(Boolean).join(',')
      : '';
    const lines = ['KIND:order', 'SVC:delivery', `DKEY:${k}`, `PREVIEW:${preview}`];
    if (oid) lines.push(`OID:${oid}`);
    if (dst) lines.push(`DST:${dst}`);
    if (cids) lines.push(`CID:${cids}`);
    return lines.join('\n');
  }
  if (st === 'education' && order.education_match_key) {
    const k = normalizeMatchKeyForOrders(String(order.education_match_key));
    const es = normalizeMatchKeyForOrders(String(order.education_subject_token || '').trim());
    const cids = Array.isArray(order.order_coverage_city_ids)
      ? order.order_coverage_city_ids.map((x) => String(x ?? '').trim()).filter(Boolean).join(',')
      : '';
    const lines = ['KIND:order', 'SVC:education', `EKEY:${k}`, `PREVIEW:${preview}`];
    if (oid) lines.push(`OID:${oid}`);
    if (es) lines.push(`EDU:${es}`);
    if (cids) lines.push(`CID:${cids}`);
    return lines.join('\n');
  }
  if (st === 'other' && order.other_match_key) {
    const k = normalizeMatchKeyForOrders(String(order.other_match_key));
    const os = normalizeMatchKeyForOrders(String(order.other_service_token || '').trim());
    const cids = Array.isArray(order.order_coverage_city_ids)
      ? order.order_coverage_city_ids.map((x) => String(x ?? '').trim()).filter(Boolean).join(',')
      : '';
    const lines = ['KIND:order', 'SVC:other', `OKEY:${k}`, `PREVIEW:${preview}`];
    if (oid) lines.push(`OID:${oid}`);
    if (os) lines.push(`OST:${os}`);
    if (cids) lines.push(`CID:${cids}`);
    return lines.join('\n');
  }
  const fallback = ['KIND:order', `SVC:${st}`, `PREVIEW:${preview}`];
  if (oid) fallback.push(`OID:${oid}`);
  return fallback.join('\n');
}

module.exports = { buildOrderNtfyMessageBody, buildOrderPreviewForNtfy };

/**
 * منطق FCM المشترك — يستعمله كل من مشغلات Firestore (Blaze) وميزامنة Spark الخارجية.
 */

const admin = require('./require-firebase-admin.cjs');
const criteria = require('./recipient-criteria.cjs');
const { isSupportedServiceOrderType } = require('./service-order-types.cjs');
const { collectMatchedProviderPhones } = require('./resolve-provider-phones.cjs');
const {
  getMota7TokensForPhones,
  messagingSendMulticastChunked,
  notifyAdminTopic,
  adUpdateIsNonStatsOnly,
} = require('./fcm-notify-shared.cjs');

/** @param {Record<string,unknown>} o */
function shortOrderPreview(o) {
  const st = String(o.serviceType || '');
  if (st === 'delivery') {
    const p = [o.subService, o.city, o.fromLocation, o.toLocation].map((x) => String(x || '').trim()).filter(Boolean);
    return (p.join(' — ') || 'طلب توصيل').slice(0, 120);
  }
  if (st === 'education') {
    const p = [o.stageName, o.subjectName, o.city].map((x) => String(x || '').trim()).filter(Boolean);
    return (p.join(' — ') || 'طلب تعليمي').slice(0, 120);
  }
  if (st === 'other') {
    const p = [o.subService, o.city].map((x) => String(x || '').trim()).filter(Boolean);
    return (p.join(' — ') || 'طلب خدمة').slice(0, 120);
  }
  return 'طلب خدمة جديد';
}

/** @param {string} serviceType */
function orderPushTitle(serviceType) {
  const st = String(serviceType || '').trim().toLowerCase();
  if (st === 'delivery') return 'Mota7: new delivery order';
  if (st === 'education') return 'Mota7: new education order';
  if (st === 'other') return 'Mota7: new service order';
  return 'Mota7: new order';
}

/** @param {Record<string,unknown>} ad */
function shortAdPreview(ad) {
  const t = String(ad.ad_type || '');
  if (t === 'delivery') {
    const details = ad.details && typeof ad.details === 'object' ? ad.details : {};
    const dn = String(details.driver_name || ad.owner_name || '').trim();
    return dn ? `توصيل — ${dn}` : 'إعلان توصيل';
  }
  if (t === 'education') {
    const details = ad.details && typeof ad.details === 'object' ? ad.details : {};
    return String(details.subject || details.description || '').trim().slice(0, 100) || 'إعلان تعليمي';
  }
  if (t === 'other') {
    const details = ad.details && typeof ad.details === 'object' ? ad.details : {};
    return String(details.provider_name || details.service_name || '').trim().slice(0, 100) || 'خدمة أخرى';
  }
  if (t === 'store') return String(ad.store_name || 'متجر').slice(0, 100);
  if (t === 'product') {
    const d = ad.details && typeof ad.details === 'object' ? ad.details : {};
    return String(d.title || d.short_desc || 'منتج').slice(0, 100);
  }
  return 'إعلان جديد';
}

/**
 * @param {string} orderId
 * @param {Record<string, unknown>} order
 */
async function notifyOrderCreated(orderId, order) {
  if (criteria.order.requireStatusPending && String(order.status || '') !== 'pending') {
    return;
  }

  const serviceType = String(order.serviceType || '')
    .trim()
    .toLowerCase();

  const db = admin.firestore();
  const preview = shortOrderPreview(order);
  const orderBodySuffix =
    'افتح «طلبات العملاء» في الحساب للاطلاع والقبول.';

  await notifyAdminTopic(
    'طلب خدمة جديد (معلق)',
    `طلب جديد: ${preview}`,
    {
      kind: 'order_new',
      order_id: orderId,
      service_type: serviceType,
    }
  );

  if (!isSupportedServiceOrderType(serviceType)) {
    console.warn('[notifyOrderCreated] unsupported serviceType — skip provider FCM', {
      orderId,
      serviceType,
    });
    return;
  }

  const phones = await collectMatchedProviderPhones(db, order);
  const list = [...phones];
  if (!list.length) return;

  const tokens = await getMota7TokensForPhones(db, list);
  if (!tokens.length) return;

  await messagingSendMulticastChunked(
    tokens,
    {
      title: orderPushTitle(serviceType),
      body: `${preview}\n${orderBodySuffix}`,
    },
    {
      kind: 'order_new',
      order_id: orderId,
      service_type: serviceType,
    }
  );
}

/**
 * @param {string} orderId
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 */
async function notifyOrderCompleted(orderId, before, after) {
  if (String(after.status || '') !== 'completed') return;
  if (String(before.status || '') === 'completed') return;
  const preview = shortOrderPreview(after);

  await notifyAdminTopic(
    'طلب مكتمل',
    `تم إكمال طلب: ${preview}`,
    {
      kind: 'order_completed',
      order_id: orderId,
      service_type: String(after.serviceType || ''),
    }
  );
}

/**
 * @param {string} adId
 * @param {Record<string, unknown>} ad
 */
async function notifyAdCreated(adId, ad) {
  const line = shortAdPreview(ad);
  const owner = String(ad.owner_phone || '').trim();

  await notifyAdminTopic(
    'إعلان جديد',
    owner ? `إعلان من ${owner}: ${line}` : line,
    {
      kind: 'ad_new',
      ad_id: adId,
      ad_type: String(ad.ad_type || ''),
    }
  );
}

/**
 * @param {string} adId
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 */
async function notifyAdUpdated(adId, before, after) {
  if (!adUpdateIsNonStatsOnly(before, after)) return;
  const line = shortAdPreview(after);
  const owner = String(after.owner_phone || '').trim();

  await notifyAdminTopic(
    'تعديل إعلان',
    owner ? `تعديل إعلان (${owner}): ${line}` : `تعديل: ${line}`,
    {
      kind: 'ad_updated',
      ad_id: adId,
      ad_type: String(after.ad_type || ''),
    }
  );
}

/** @param {string} shoppingId مستند مجموعة shopping (ليس delivery_charges) */
async function notifyShoppingOrderCreated(shoppingId, doc) {
  if (shoppingId === 'delivery_charges') return;
  if (String(doc.status || '') !== 'pending') return;

  const buyer = String(doc.buyerName || '').trim();
  const phone = String(doc.buyerPhone || '').trim();
  let total = '';
  const gt = doc.grandTotal;
  if (typeof gt === 'number' && Number.isFinite(gt)) {
    total = ` — الإجمالي ${gt}`;
  }

  await notifyAdminTopic(
    'طلب مشتريات جديد (معلق)',
    buyer
      ? `طلب عربة من ${buyer}${phone ? ` — ${phone}` : ''}${total}`
      : phone
        ? `طلب عربة — ${phone}${total}`
        : `طلب عربة جديد${total}`,
    {
      kind: 'shopping_order_new',
      shopping_id: shoppingId,
    }
  );
}

module.exports = {
  shortOrderPreview,
  shortAdPreview,
  notifyOrderCreated,
  notifyOrderCompleted,
  notifyAdCreated,
  notifyAdUpdated,
  notifyShoppingOrderCreated,
  adUpdateIsNonStatsOnly,
};

'use strict';

/** تسمية نوع الطلب بالعربية */
function orderServiceLabelAr(serviceType) {
  const st = String(serviceType || '').trim().toLowerCase();
  if (st === 'delivery') return 'طلب توصيل';
  if (st === 'education') return 'طلب تعليمي';
  if (st === 'other') return 'طلب خدمة';
  return 'طلب خدمة';
}

/** عنوان إشعار FCM / الشريط (عربي) */
function providerOrderFcmTitle(serviceType) {
  return `مُتاح — ${orderServiceLabelAr(serviceType)} جديد`;
}

const PROVIDER_ORDER_ACTION_LINE_AR =
  'اضغط للاطلاع والقبول من «طلبات العملاء».';

/** جسم الإشعار لمقدم الخدمة */
function providerOrderNotificationBody(preview, serviceType) {
  const label = orderServiceLabelAr(serviceType);
  const line1 = String(preview || '').trim() || label;
  return `${line1}\n${PROVIDER_ORDER_ACTION_LINE_AR}`;
}

/** عنوان ASCII لرأس ntfy (ISO-8859-1) */
function providerOrderNtfyAsciiTitle(serviceType) {
  const st = String(serviceType || '').trim().toLowerCase();
  if (st === 'delivery') return 'Mota7: delivery order';
  if (st === 'education') return 'Mota7: education order';
  if (st === 'other') return 'Mota7: service order';
  return 'Mota7: new order';
}

module.exports = {
  orderServiceLabelAr,
  providerOrderFcmTitle,
  providerOrderNotificationBody,
  providerOrderNtfyAsciiTitle,
  PROVIDER_ORDER_ACTION_LINE_AR,
};

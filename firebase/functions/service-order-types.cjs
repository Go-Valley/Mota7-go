'use strict';

/** أنواع طلبات الخدمة التي تُرسل لها إشعارات FCM لمقدّمي الخدمة */
const SERVICE_ORDER_TYPES = ['delivery', 'education', 'other'];

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isSupportedServiceOrderType(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  return SERVICE_ORDER_TYPES.includes(s);
}

module.exports = { SERVICE_ORDER_TYPES, isSupportedServiceOrderType };

/** نصوص إشعار طلب خدمة جديد لمقدم الخدمة (مواءمة fcm-push-server/lib/order-notification-copy.cjs) */

export function orderServiceLabelAr(serviceType: string): string {
  const st = String(serviceType || '').trim().toLowerCase();
  if (st === 'delivery') return 'طلب توصيل';
  if (st === 'education') return 'طلب تعليمي';
  if (st === 'other') return 'طلب خدمة';
  return 'طلب خدمة';
}

export function providerOrderNotificationTitle(serviceType: string): string {
  return `مُتاح — ${orderServiceLabelAr(serviceType)} جديد`;
}

export const PROVIDER_ORDER_ACTION_LINE_AR =
  'اضغط للاطلاع والقبول من «طلبات العملاء».';

export function providerOrderNotificationBody(preview: string, serviceType: string): string {
  const label = orderServiceLabelAr(serviceType);
  const line1 = String(preview || '').trim() || label;
  return `${line1}\n${PROVIDER_ORDER_ACTION_LINE_AR}`;
}

/** رأس ntfy — ASCII فقط */
export function providerOrderNtfyAsciiTitle(serviceType: string): string {
  const st = String(serviceType || '').trim().toLowerCase();
  if (st === 'delivery') return 'Mota7: delivery order';
  if (st === 'education') return 'Mota7: education order';
  if (st === 'other') return 'Mota7: service order';
  return 'Mota7: new order';
}

export function parseOrderNewNotificationPayload(
  data: Record<string, unknown> | null | undefined
): { orderId: string; serviceType: string } | null {
  if (!data) return null;
  const kind = String(data['kind'] ?? '').trim();
  if (kind !== 'order_new') return null;
  const orderId = String(data['order_id'] ?? data['orderId'] ?? '').trim();
  if (!orderId) return null;
  return {
    orderId,
    serviceType: String(data['service_type'] ?? data['serviceType'] ?? '').trim(),
  };
}

import { environment } from '../../../environments/environment';

/**
 * هل مسار ntfy للطلبات مفعّل؟ (موضوع + طلبات غير معطّلة)
 * عند true:
 * - `NtfyListenerService` يجدول إشعاراً محلياً كاملاً (mota7-orders) لمقدم مطابق في المقدّمة والخلفية.
 * - جسر FCM + صندوق الطلبات + dedup يمنع تكرار الإشعار المحلي.
 * - التطبيق المُغلق بالكامل: FCM من الخادم (بدون تغيير)؛ SSE يعمل بعد فتح التطبيق.
 */
export function isNtfyOrdersPipelineActive(): boolean {
  const cfg = environment.ntfy;
  return !!cfg?.enabled && cfg.ordersEnabled !== false && !!String(cfg.ordersTopic || cfg.topic || '').trim();
}

export { PROVIDER_ORDER_ACTION_LINE_AR as ORDER_NOTIFY_ACTION_LINE_AR } from './order-notification-copy.util';

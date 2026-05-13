import { environment } from '../../../environments/environment';

/**
 * هل مسار ntfy للطلبات مفعّل؟ (موضوع + طلبات غير معطّلة)
 * عند true:
 * - المقدّمة: إشعار محلي من `NtfyListenerService` (SSE) على mota7-orders؛ جسر FCM لا يكرّر.
 * - الخلفية: FCM من الخادم على mota7-orders؛ مستمع ntfy لا يُجدول محلياً لتفادي تكرار talap.
 */
export function isNtfyOrdersPipelineActive(): boolean {
  const cfg = environment.ntfy;
  return !!cfg?.enabled && cfg.ordersEnabled !== false && !!String(cfg.ordersTopic || cfg.topic || '').trim();
}

/** سطر المتابعة الموحّد في جسم الإشعار (ntfy محلي + FCM من الخادم). */
export const ORDER_NOTIFY_ACTION_LINE_AR =
  'افتح «طلبات العملاء» في الحساب للاطلاع والقبول.';

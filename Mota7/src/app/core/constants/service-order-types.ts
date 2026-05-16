/** أنواع طلبات الخدمة — يجب أن تطابق firebase/functions/service-order-types.cjs */
export const SERVICE_ORDER_TYPES = ['delivery', 'education', 'other'] as const;

export type ServiceOrderType = (typeof SERVICE_ORDER_TYPES)[number];

export function isServiceOrderType(value: unknown): value is ServiceOrderType {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return (SERVICE_ORDER_TYPES as readonly string[]).includes(s);
}

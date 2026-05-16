/** تسمية عربية لطريقة الدفع المخزّنة في Firestore */
export function shoppingPaymentMethodLabel(method?: string | null): string {
  const raw = (method ?? '').trim();
  if (!raw) {
    return '';
  }
  const key = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (
    key === 'cod' ||
    key === 'cashondelivery' ||
    key === 'payondelivery' ||
    key === 'delivery'
  ) {
    return 'عند الاستلام';
  }
  return raw;
}

/** مطابق لمنطق cus-order.page لمقارنة مفاتيح التطابق */
export function normalizeMatchKeyForOrders(text: string): string {
  if (!text) return '';
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

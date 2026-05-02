/**
 * Mirror: Mota7/src/app/core/utils/match-key-normalize.ts
 * لا تنسَ المزامنة عند أي تعديل على normalizeMatchKeyForOrders هنا أو في Angular.
 */

function normalizeMatchKeyForOrders(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\u0623\u0625\u0671\u0672]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064a')
    .trim();
}

module.exports = { normalizeMatchKeyForOrders };

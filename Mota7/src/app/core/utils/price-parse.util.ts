/** يحول الأرقام العربية الهندية والفارسية إلى أرقام لاتينية */
function latinizeDigits(s: string): string {
  const ar = '٠١٢٣٤٥٦٧٨٩';
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  let out = '';
  for (const ch of s) {
    const iAr = ar.indexOf(ch);
    if (iAr >= 0) {
      out += String(iAr);
      continue;
    }
    const iFa = fa.indexOf(ch);
    if (iFa >= 0) {
      out += String(iFa);
      continue;
    }
    out += ch;
  }
  return out;
}

/** يعرض جزء المعقول بعد التنقيح */
function coercePriceNumeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 0 ? value : NaN;
  }
  let s =
    typeof value === 'string' ? latinizeDigits(value.trim()) : value != null ? String(value) : '';
  if (!s) {
    return NaN;
  }
  s = s.replace(/,/g, '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * قراءة حقل السعر من `details` (أو أي قيمة أحادية)، مع الأرقام العربية أو الفارسية.
 */
export function parseProductPriceToNumber(details: unknown): number {
  let value: unknown = details;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    value = (details as Record<string, unknown>)['price'];
  }
  return coercePriceNumeric(value);
}

export function productHasPurchasablePrice(details: unknown): boolean {
  const n = parseProductPriceToNumber(details);
  return Number.isFinite(n) && n > 0;
}

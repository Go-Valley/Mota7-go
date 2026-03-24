/**
 * قراءة نص من ionInput — يفضّل الـ native input (composedPath) لتفادي تعارض الحذف مع detail.value على أندرويد.
 */
export function readIonTextInputValueFromEvent(ev: Event): string {
  const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
  for (const n of path) {
    if (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) {
      return n.value;
    }
  }

  const detailVal = (ev as CustomEvent<{ value?: string | null }>).detail?.value;
  const detailStr = detailVal != null ? String(detailVal) : '';
  const t = ev.target as { value?: unknown } | null;
  const elStr = t && typeof t.value === 'string' ? t.value : '';

  if (!detailStr && elStr) return elStr;
  if (!elStr && detailStr) return detailStr;
  if (elStr === detailStr) return elStr;
  return elStr.length >= detailStr.length ? elStr : detailStr;
}

function coerceIonicTextValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && value !== null && 'value' in (value as object)) {
    return coerceIonicTextValue((value as { value: unknown }).value);
  }
  const s = String(value);
  return s === '[object Object]' ? '' : s;
}

/** نص حر (عربي/إنجليزي) — تطبيع خفيف عند الإرسال وليس بالضرورة في كل ضغطة مفتاح */
export function normalizeUserFreeText(value: unknown): string {
  let s = coerceIonicTextValue(value);
  s = s.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '');
  s = s.replace(/\u0640/g, '');
  return s.trim();
}

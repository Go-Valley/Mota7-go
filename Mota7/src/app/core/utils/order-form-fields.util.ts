/**
 * قراءة نص من حدث ionInput على ion-input / ion-textarea.
 * على WebView (أندرويد) مع IME عربي: `detail.value` قد يتأخر أو يبقى قديماً أثناء الحذف،
 * بينما الـ native input داخل shadow DOM يعكس القيمة الحقيقية — نقرأه أولاً عبر composedPath.
 */
export function readIonTextInputValueFromEvent(ev: Event): string {
  /** أولاً: الـ input الحقيقي تحت shadow (خاصة IME عربي — قيمة ion-input تتأخر أو تبقى فارغة) */
  const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
  for (const n of path) {
    if (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) {
      return n.value;
    }
  }

  const t = ev.target as { value?: unknown } | null;
  if (t && typeof t.value === 'string') {
    return t.value;
  }

  if ('detail' in ev) {
    const detailVal = (ev as CustomEvent).detail?.value;
    if (detailVal !== undefined) {
      return detailVal == null ? '' : String(detailVal);
    }
  }

  return '';
}

/**
 * استخراج قيمة من ion-input / ion-textarea (نص عربي أو إنجليزي) بأمان.
 */
function coerceIonicTextValue(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && value !== null && 'value' in (value as object)) {
    return coerceIonicTextValue((value as { value: unknown }).value);
  }
  const s = String(value);
  return s === '[object Object]' ? '' : s;
}

/**
 * نص حر من المستخدم (اسم، عنوان، ملاحظات): قبول العربية والإنجليزية،
 * إزالة أحرف التحكم الخفيفة فقط — لا يُفرغ المحتوى العربي.
 */
export function normalizeUserFreeText(value: unknown): string {
  let s = coerceIonicTextValue(value);
  return s;
}

/**
 * تطبيع نصوص الحقول والقوائم (مسافات، أحرف RTL خفيفة، BOM، توحيد ألف عربية)
 * ليتطابق اختيار ion-select مع البيانات الثابتة حتى مع اختلافات Unicode طفيفة.
 */
export function normalizeOrderSelectValue(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'object') {
    return '';
  }
  let s = String(value)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '')
    .replace(/\u0640/g, '')
    .replace(/\s+/g, ' ');

  try {
    s = s.normalize('NFC');
  } catch {
    /* متصفحات قديمة */
  }

  // أ، إ، آ، ٱ → ا
  s = s.replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627');

  return s;
}

/** مطابقة عنصر من قائمة نصوص (مدن مثلاً) */
export function findMatchingStringInList(
  list: readonly string[],
  raw: unknown
): string | undefined {
  const norm = normalizeOrderSelectValue(raw);
  if (!norm) {
    return undefined;
  }
  const byNorm = list.find((item) => normalizeOrderSelectValue(item) === norm);
  if (byNorm) {
    return byNorm;
  }
  const collapsed = norm.replace(/\s+/g, '');
  return list.find(
    (item) => normalizeOrderSelectValue(item).replace(/\s+/g, '') === collapsed
  );
}

/** مطابقة عنصر يملك nameAr (توصيل، خدمات أخرى، تعليم) */
export function findMatchingNameArItem<T extends { nameAr: string }>(
  items: readonly T[],
  raw: unknown
): T | undefined {
  const norm = normalizeOrderSelectValue(raw);
  if (!norm) {
    return undefined;
  }
  const byNorm = items.find((i) => normalizeOrderSelectValue(i.nameAr) === norm);
  if (byNorm) {
    return byNorm;
  }
  const collapsed = norm.replace(/\s+/g, '');
  return items.find(
    (i) => normalizeOrderSelectValue(i.nameAr).replace(/\s+/g, '') === collapsed
  );
}

/** مطابقة مادة ضمن قائمة مواد المرحلة */
export function findMatchingSubject(
  subjects: readonly string[] | undefined,
  raw: unknown
): string | undefined {
  if (!subjects?.length) {
    return undefined;
  }
  const norm = normalizeOrderSelectValue(raw);
  if (!norm) {
    return undefined;
  }
  const byNorm = subjects.find((s) => normalizeOrderSelectValue(s) === norm);
  if (byNorm !== undefined) {
    return byNorm;
  }
  const collapsed = norm.replace(/\s+/g, '');
  return subjects.find(
    (s) => normalizeOrderSelectValue(s).replace(/\s+/g, '') === collapsed
  );
}

/**
 * هل وُجدت إحداثيات فعلية (غير الافتراضي 0/0) — يتوافق مع زر «تم تحديد موقعك» (أي محور غير صفر).
 */
export function hasOrderLocationCoordinates(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  const latOk = Number.isFinite(la) && la !== 0;
  const lngOk = Number.isFinite(ln) && ln !== 0;
  return latOk || lngOk;
}

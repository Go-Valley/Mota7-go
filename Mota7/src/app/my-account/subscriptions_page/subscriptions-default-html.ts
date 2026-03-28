/** يُعتبر «نشطاً» في Firestore: active (نص)، أو 1، أو true */
export function isFirestoreActiveFlag(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'active';
  }
  return false;
}

/**
 * يصلّح لصق النص داخل Firebase كسلسلة JSON (علامات " خارجية أو \" داخلية).
 */
function normalizeFirestoreHtmlString(raw: string): string {
  const t = raw.trim();
  if (t.length === 0) {
    return '';
  }
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      const parsed = JSON.parse(t);
      if (typeof parsed === 'string') {
        return parsed.trim();
      }
    } catch {
      return t
        .slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .trim();
    }
  }
  return t;
}

function tryHtmlField(v: unknown): string | null {
  if (typeof v !== 'string') {
    return null;
  }
  const n = normalizeFirestoreHtmlString(v);
  return n.length > 0 ? n : null;
}

export function getSubscriptionsContentHtmlFromDoc(
  data: Record<string, unknown>
): string {
  const keys = ['content_html', 'contentHtml', 'html', 'packages_html'] as const;

  /** مطابقة غير حسّاسة لحروف الاسم + تجاهل مسافات (أخطاء لصق من لوحة Firebase) */
  for (const key of Object.keys(data)) {
    const norm = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (norm === 'content_html' || norm === 'contenthtml') {
      const s = tryHtmlField(data[key]);
      if (s) {
        return s;
      }
    }
  }

  for (const k of keys) {
    const s = tryHtmlField(data[k]);
    if (s) {
      return s;
    }
  }

  const current = data['current'];
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    const cur = current as Record<string, unknown>;
    for (const key of Object.keys(cur)) {
      const norm = key.trim().toLowerCase().replace(/\s+/g, '_');
      if (norm === 'content_html' || norm === 'contenthtml') {
        const s = tryHtmlField(cur[key]);
        if (s) {
          return s;
        }
      }
    }
    for (const k of keys) {
      const s = tryHtmlField(cur[k]);
      if (s) {
        return s;
      }
    }
  }

  return '';
}

export const SUBSCRIPTIONS_MISSING_CONTENT_HTML = `
<div class="subs-doc subs-missing-placeholder">
  <p class="subs-missing-msg">
    لم يُضف محتوى الباقات بعد.<br /><br />
    أضف حقل <strong>content_html</strong> في مستند Firestore
    <strong>subscriptions/page</strong> — جميع الأسعار والنصوص تُحدَّث من هناك فقط.
  </p>
</div>
`.trim();

export const SUBSCRIPTIONS_EMPTY_FALLBACK = 'لا توجد اشتراكات حالياً بالتطبيق';

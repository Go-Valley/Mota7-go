/** السطر الأول الموحّد لرسائل واتساب */
export const WHATSAPP_GREETING_LINE = 'السلام عليكم .. 👋🏽';

export const WHATSAPP_GREETING_PREFIX = `${WHATSAPP_GREETING_LINE}\n`;

const HAS_GREETING_RE = /السلام\s+عليكم/i;

const STRIP_GREETING_PREFIX_RE =
  /^السلام\s+عليكم\s*(?:[.,،]|\.{2})?\s*(?:\.{2}\s*)?(?:👋🏽\s*)?(?:\n\s*)?/iu;

export function formatWhatsappMessageWithGreeting(message: string): string {
  const text = String(message ?? '');
  if (!text.trim()) {
    return text;
  }
  if (!HAS_GREETING_RE.test(text)) {
    return text;
  }
  if (text.startsWith(WHATSAPP_GREETING_PREFIX)) {
    return text;
  }
  const body = text.replace(STRIP_GREETING_PREFIX_RE, '').replace(/^\s+/, '');
  return WHATSAPP_GREETING_PREFIX + body;
}

export function encodeWhatsappText(message: string): string {
  return encodeURIComponent(formatWhatsappMessageWithGreeting(message));
}

import { WHATSAPP_GREETING_PREFIX } from './whatsapp-message-format.util';

/**
 * رسالة واتساب من لوحة الأدمن لصاحب إعلان متجر.
 * السطر الأول: تحية موحّدة — ثم نص التواصل مع اسم المتجر بين علامتي تنصيص.
 */
export function buildAdminStoreAdWhatsappMessage(storeName: string): string {
  const label = String(storeName ?? '').trim() || 'المتجر';
  return `${WHATSAPP_GREETING_PREFIX}بتواصل مع حضرتك بخصوص اعلانك "${label}"`;
}

/**
 * رسالة واتساب من لوحة الأدمن لصاحب أي إعلان (منتج، نقل، تعليم، خدمات أخرى).
 */
export function buildAdminAdWhatsappMessage(adLabel: string): string {
  const label = String(adLabel ?? '').trim() || 'إعلانك';
  return `${WHATSAPP_GREETING_PREFIX}بتواصل مع حضرتك بخصوص اعلانك "${label}"`;
}

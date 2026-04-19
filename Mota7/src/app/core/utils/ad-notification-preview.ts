import { DELIVERY_CATEGORY } from '../constants/delivery-data';
import { OTHER_SERVICES_DATA } from '../constants/other-services-data';
import { EDUCATION_CATEGORY } from '../constants/educational-data';

/** سطر يعكس ما يظهر تقريباً في كروت الرئيسية لاستخدامه في نص الإشعار */
export function buildAdCardPreviewForNtfy(ad: Record<string, unknown> | null | undefined): string {
  if (!ad) {
    return 'إعلان جديد';
  }
  const t = ad['ad_type'] as string | undefined;

  if (t === 'store') {
    return String(ad['store_name'] || 'متجر').trim() || 'متجر';
  }

  if (t === 'product') {
    const d = (ad['details'] as Record<string, unknown>) || {};
    const line =
      (d['short_desc'] as string) ||
      (d['title'] as string) ||
      (ad['sub_category_name'] as string) ||
      'منتج';
    return String(line).trim() || 'منتج';
  }

  if (t === 'delivery') {
    const cat = DELIVERY_CATEGORY.items.find((i) => i.id === ad['category_id']);
    const nameAr = cat?.nameAr || String(ad['category_id'] || 'توصيل');
    const details = (ad['details'] as Record<string, unknown>) || {};
    const driver =
      (details['driver_name'] as string) || (ad['owner_name'] as string) || '';
    return driver.trim() ? `${nameAr} — ${driver.trim()}` : nameAr;
  }

  if (t === 'education') {
    const stage = EDUCATION_CATEGORY.items.find((i: { id: string }) => i.id === ad['category_id']);
    const details = (ad['details'] as Record<string, unknown>) || {};
    const subject = String(details['subject'] || '').trim();
    const desc = String(details['description'] || '')
      .trim()
      .slice(0, 120);
    const parts = [stage?.nameAr, subject, desc].filter(Boolean);
    return parts.length ? parts.join(' — ') : 'إعلان تعليمي';
  }

  if (t === 'other') {
    const cat = OTHER_SERVICES_DATA.items.find((i) => i.id === ad['category_id']);
    const nameAr = cat?.nameAr || String(ad['category_id'] || 'خدمة');
    const details = (ad['details'] as Record<string, unknown>) || {};
    const prov =
      (details['provider_name'] as string) || (ad['owner_name'] as string) || '';
    return prov.trim() ? `${nameAr} — ${prov.trim()}` : nameAr;
  }

  return 'إعلان جديد';
}

const PUBLIC_SUFFIX = 'اتصفح وشوف الإعلانات المضافة حديثاً الآن';

/** جسم رسالة ntfy: يبدأ بسطر UID لتجاهل التنبيه لنفس الناشر على أجهزته */
export function buildNtfyPublicBody(publisherUid: string, preview: string): string {
  const safePreview = (preview || 'إعلان جديد').trim();
  return `UID:${publisherUid}\n\n${safePreview}\n\n${PUBLIC_SUFFIX}`;
}

/** عنوان إشعار محلي من ترويسة ntfy (ASCII فقط في الطلب) */
export function mapMota7AdNtfyTitle(titleFromServer: string): string {
  const t = (titleFromServer || '').toLowerCase();
  if (t.includes('ad updated')) {
    return 'تعديل إعلان';
  }
  if (t.includes('new ad')) {
    return 'إعلان جديد';
  }
  return (titleFromServer || '').trim() || 'إعلان جديد';
}

export function parseNtfyIncomingMessage(
  rawMessage: string,
  currentUid: string | null | undefined
): { skip: boolean; body: string } {
  const raw = (rawMessage || '').trim();
  if (!raw) {
    return { skip: true, body: '' };
  }
  if (!raw.startsWith('UID:')) {
    return { skip: false, body: raw };
  }
  const nl = raw.indexOf('\n');
  const firstLine = nl >= 0 ? raw.slice(0, nl) : raw;
  const publisher = firstLine.replace(/^UID:\s*/, '').trim();
  const rest = nl >= 0 ? raw.slice(nl + 1).trim() : '';
  if (currentUid && publisher === currentUid) {
    return { skip: true, body: '' };
  }
  return { skip: false, body: rest };
}

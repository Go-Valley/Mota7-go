import { normalizeMatchKeyForOrders } from './match-key-normalize';

export function buildOrderPreviewForNtfy(order: Record<string, unknown>): string {
  const st = String(order['serviceType'] || '');
  if (st === 'delivery') {
    const parts = [
      order['subService'],
      order['city'],
      order['fromLocation'],
      order['toLocation'],
    ]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (parts.join(' — ') || 'طلب توصيل').slice(0, 220);
  }
  if (st === 'education') {
    const parts = [order['stageName'], order['subjectName'], order['city']]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (parts.join(' — ') || 'طلب درس').slice(0, 220);
  }
  if (st === 'other') {
    const parts = [order['subService'], order['city'], order['shortNote']]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return (parts.join(' — ') || 'طلب خدمة').slice(0, 220);
  }
  return 'طلب خدمة جديد';
}

/** جسم رسالة ntfy لطلب جديد (نفس موضوع الإعلانات أو موضوع منفصل حسب الإعدادات) */
export function buildOrderNtfyMessageBody(order: Record<string, unknown>): string {
  const preview = buildOrderPreviewForNtfy(order);
  const st = String(order['serviceType'] || '');

  if (st === 'delivery' && order['delivery_match_key']) {
    const k = normalizeMatchKeyForOrders(String(order['delivery_match_key']));
    return ['KIND:order', 'SVC:delivery', `DKEY:${k}`, `PREVIEW:${preview}`].join('\n');
  }
  if (st === 'education' && order['education_match_key']) {
    const k = normalizeMatchKeyForOrders(String(order['education_match_key']));
    return ['KIND:order', 'SVC:education', `EKEY:${k}`, `PREVIEW:${preview}`].join('\n');
  }
  if (st === 'other' && order['other_match_key']) {
    const k = normalizeMatchKeyForOrders(String(order['other_match_key']));
    return ['KIND:order', 'SVC:other', `OKEY:${k}`, `PREVIEW:${preview}`].join('\n');
  }
  return ['KIND:order', `SVC:${st}`, `PREVIEW:${preview}`].join('\n');
}

/** نظام رسائل لوحة الأدمن (محللاً كنوع طلب) — بدون أسطر تعرِّف بحروف مختلفة لتفادي كسر المعالجين */
export function buildShoppingOrderNtfyMessageBody(order: Record<string, unknown>): string {
  const name = String(order['buyerName'] ?? '').trim();
  const city = String(order['buyerCity'] ?? '').trim();
  let totalStr = '';
  const gt = order['grandTotal'];
  if (typeof gt === 'number' && Number.isFinite(gt)) {
    totalStr = `${gt}`;
  }
  const nItems = Array.isArray(order['items'])
    ? (order['items'] as unknown[]).length
    : Number(order['itemsCount']);
  const count =
    typeof nItems === 'number' && Number.isFinite(nItems) && nItems > 0
      ? `${Math.floor(nItems)} سلعة`
      : '';
  const parts = [count, city, totalStr ? `${totalStr} ج` : ''].filter(Boolean);
  let preview =
    name && parts.length ? `${name} — ${parts.join(' · ')}` : name ? name : parts.join(' · ');
  if (!preview.trim()) preview = 'طلب مشتريات من العربة';
  preview = preview.slice(0, 220).replace(/\n/g, ' ').trim();
  return ['KIND:order', 'SVC:shopping', `PREVIEW:${preview}`].join('\n');
}

export interface ParsedOrderNtfy {
  svc: string;
  dKey: string;
  eKey: string;
  oKey: string;
  preview: string;
}

export function parseOrderNtfyMessage(raw: string): ParsedOrderNtfy | null {
  const text = (raw || '').trim();
  if (!text.startsWith('KIND:order')) {
    return null;
  }
  const map: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    map[k] = v;
  }
  return {
    svc: (map['SVC'] || '').trim(),
    dKey: map['DKEY'] || '',
    eKey: map['EKEY'] || '',
    oKey: map['OKEY'] || '',
    preview: map['PREVIEW'] || 'طلب خدمة جديد',
  };
}

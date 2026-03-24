/** مطابقة جسم رسائل ntfy القادمة من تطبيق Mota7 (إعلانات). */
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

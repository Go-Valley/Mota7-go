import { Injectable, Signal, computed, signal } from '@angular/core';
import { parseProductPriceToNumber } from '../utils/price-parse.util';
import {
  normalizeSellerCityLikeProductFeedCard,
  sellerCityLabelForProductAd,
} from '../utils/product-seller-location.util';

/** قراءة سعر محفوظ في الطلب/النسخ غير المتسقة مع أرقام عربية أو نص */
function coerceOrderLinePrice(v: unknown): number {
  return parseProductPriceToNumber({ price: v });
}

const STORAGE_KEY = 'mota7_cart_v1';

export interface CartLine {
  readonly lineId: string;
  readonly adId: string;
  readonly title: string;
  readonly shortNote: string;
  readonly unitPrice: number;
  readonly sellerName: string;
  readonly sellerPhone: string;
  readonly locationLabel: string;
  /** حالة السلعة كما في إعلان المنتج */
  readonly condition: string;
  /** عدد الوحدات لنفس `adId` (إن لم يُحفظ سابقاً: يُعامل كـ 1) */
  readonly quantity?: number;
}

function newLineId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/** كمية الصف الواحدة في العربة — عدد صحيح ≥ 1 */
export function cartLineQty(row: Pick<CartLine, 'quantity'>): number {
  const q = row.quantity;
  if (typeof q === 'number' && Number.isFinite(q) && q >= 1) {
    return Math.min(9999, Math.floor(q));
  }
  return 1;
}

function mergeLinesByAdId(lines: CartLine[]): CartLine[] {
  const map = new Map<string, CartLine>();
  for (const l of lines) {
    const qty = cartLineQty(l);
    const prev = map.get(l.adId);
    if (!prev) {
      map.set(l.adId, { ...l, quantity: qty });
    } else {
      map.set(l.adId, {
        ...prev,
        quantity: cartLineQty(prev) + qty,
      });
    }
  }
  return Array.from(map.values());
}

function resolveSeller(ad: Record<string, unknown>): string {
  const on = ad['owner_name'];
  const dn = (ad['details'] as Record<string, unknown> | undefined)?.['owner_name'];
  if (typeof on === 'string' && on && on !== 'مستخدم متاح') {
    return on;
  }
  if (typeof dn === 'string' && dn && dn !== 'مستخدم متاح') {
    return dn;
  }
  return 'متاح';
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly lines = signal<CartLine[]>(this.restore());

  /** إجمالي عدد القطع في العربة (مجموع الكميات) — للشارة وعدد السلع */
  readonly itemCount = computed(() =>
    this.lines().reduce((sum, row) => sum + cartLineQty(row), 0)
  );

  readonly linesRo: Signal<readonly CartLine[]> = this.lines.asReadonly();

  readonly itemsTotalAmount = computed(() =>
    this.lines().reduce((sum, row) => sum + row.unitPrice * cartLineQty(row), 0)
  );

  addProductAd(ad: unknown): boolean {
    if (!ad || typeof ad !== 'object') {
      return false;
    }
    const doc = ad as Record<string, unknown>;
    const adId =
      typeof doc['id'] === 'string'
        ? doc['id']
        : typeof doc['ad_id'] === 'string'
          ? doc['ad_id']
          : '';
    if (!adId) {
      return false;
    }
    if (String(doc['status'] ?? '') !== 'active') {
      return false;
    }
    if (doc['cart_enabled'] === false) {
      return false;
    }
    const details = doc['details'];
    const priceNum = parseProductPriceToNumber(details);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return false;
    }
    const locationLabel = sellerCityLabelForProductAd(doc);
    const sellerPhoneRaw = doc['owner_phone'];
    const whatsappRaw =
      details && typeof details === 'object' && !Array.isArray(details)
        ? (details as Record<string, unknown>)['whatsapp_phone']
        : undefined;
    const sellerPhone =
      typeof sellerPhoneRaw === 'string'
        ? sellerPhoneRaw.trim()
        : typeof whatsappRaw === 'string'
          ? whatsappRaw.trim()
          : '';

    let title = '';
    let shortNote = '';
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      const d = details as Record<string, unknown>;
      title = typeof d['title'] === 'string' ? d['title'] : '';
      const sd = d['short_desc'];
      shortNote = typeof sd === 'string' ? sd : title || '';
      if (!title && shortNote) {
        title = shortNote;
      }
    }

    let condition = 'غير محدد';
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      const c = (details as Record<string, unknown>)['condition'];
      if (typeof c === 'string' && c.trim()) {
        condition = c.trim();
      }
    }

    const line: CartLine = {
      lineId: newLineId(),
      adId,
      title: title || 'منتج',
      shortNote: shortNote || title,
      unitPrice: priceNum,
      sellerName: resolveSeller(doc),
      sellerPhone,
      locationLabel,
      condition,
      quantity: 1,
    };

    this.lines.update((xs) => {
      const i = xs.findIndex((l) => l.adId === adId);
      if (i >= 0) {
        const next = [...xs];
        const ex = next[i];
        next[i] = { ...ex, quantity: cartLineQty(ex) + 1 };
        return next;
      }
      return [...xs, line];
    });
    this.persist();
    return true;
  }

  /** زيادة كمية سطر موجود مسبقاً فقط (للمزامنة مع الكارت دون إعادة التحقق من الإعلان) */
  incrementQtyByAdId(adId: string): boolean {
    if (!adId) {
      return false;
    }
    let changed = false;
    this.lines.update((xs) => {
      const i = xs.findIndex((l) => l.adId === adId);
      if (i < 0) {
        return xs;
      }
      changed = true;
      const next = [...xs];
      const ex = next[i];
      next[i] = { ...ex, quantity: cartLineQty(ex) + 1 };
      return next;
    });
    if (changed) {
      this.persist();
    }
    return changed;
  }

  decrementQtyByAdId(adId: string): void {
    if (!adId) {
      return;
    }
    this.lines.update((xs) => {
      const i = xs.findIndex((l) => l.adId === adId);
      if (i < 0) {
        return xs;
      }
      const ex = xs[i];
      const q = cartLineQty(ex);
      if (q <= 1) {
        return xs.filter((_, j) => j !== i);
      }
      const next = [...xs];
      next[i] = { ...ex, quantity: q - 1 };
      return next;
    });
    this.persist();
  }

  /** إزالة كل كميات نفس المنتج من العربة */
  removeAllByAdId(adId: string): void {
    if (!adId) {
      return;
    }
    this.lines.update((xs) => xs.filter((l) => l.adId !== adId));
    this.persist();
  }

  removeLine(lineId: string): void {
    this.lines.update((xs) => xs.filter((l) => l.lineId !== lineId));
    this.persist();
  }

  clearCart(): void {
    this.lines.set([]);
    this.persist();
  }

  /** نسخة من محتوى العربة الحالي (لاستعادتها بعد تعديل طلب من «طلباتي») */
  snapshotLines(): CartLine[] {
    return this.lines().map((l) => ({ ...l }));
  }

  restoreLinesSnapshot(lines: readonly CartLine[]): void {
    const next: CartLine[] = [];
    for (const l of lines) {
      const price = coerceOrderLinePrice(l.unitPrice);
      if (!(price > 0) || !l.adId?.trim() || !l.title?.trim()) {
        continue;
      }
      next.push({
        lineId: l.lineId || newLineId(),
        adId: l.adId,
        title: l.title,
        shortNote: l.shortNote || l.title,
        unitPrice: price,
        sellerName: l.sellerName || 'متاح',
        sellerPhone: l.sellerPhone || '',
        locationLabel: normalizeSellerCityLikeProductFeedCard(l.locationLabel),
        condition: l.condition?.trim() || 'غير محدد',
        quantity: cartLineQty(l),
      });
    }
    this.lines.set(mergeLinesByAdId(next));
    this.persist();
  }

  /** تعبئة العربة من بيانات مستند الطلب لتعديلها في صفحة التأكيد */
  replaceLinesFromOrderSnapshot(
    items: readonly {
      adId: string;
      title: string;
      shortNote: string;
      unitPrice: number;
      sellerName: string;
      sellerPhone: string;
      locationLabel: string;
      condition?: string;
    }[]
  ): void {
    const next: CartLine[] = [];
    for (const it of items) {
      const price = coerceOrderLinePrice((it as { unitPrice: unknown }).unitPrice);
      if (!(price > 0) || !(it.adId && it.title.trim())) {
        continue;
      }
      next.push({
        lineId: newLineId(),
        adId: String(it.adId),
        title: it.title.trim() || 'منتج',
        shortNote: it.shortNote?.trim() ? it.shortNote.trim() : it.title,
        unitPrice: price,
        sellerName: typeof it.sellerName === 'string' && it.sellerName ? it.sellerName.trim() : 'متاح',
        sellerPhone:
          typeof it.sellerPhone === 'string' ? it.sellerPhone.trim() : '',
        locationLabel: normalizeSellerCityLikeProductFeedCard(it.locationLabel),
        condition:
          typeof it.condition === 'string' && it.condition.trim()
            ? it.condition.trim()
            : 'غير محدد',
        quantity: 1,
      });
    }
    this.lines.set(mergeLinesByAdId(next));
    this.persist();
  }

  private restore(): CartLine[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      const out: CartLine[] = [];
      for (const row of parsed) {
        if (!row || typeof row !== 'object') {
          continue;
        }
        const r = row as Record<string, unknown>;
        const lineId = typeof r['lineId'] === 'string' ? r['lineId'] : '';
        const adId = typeof r['adId'] === 'string' ? r['adId'] : '';
        const title = typeof r['title'] === 'string' ? r['title'] : '';
        const unitPrice =
          typeof r['unitPrice'] === 'number' && Number.isFinite(r['unitPrice']) ? r['unitPrice'] : NaN;
        if (!lineId || !adId || !title.trim() || !(unitPrice > 0)) {
          continue;
        }
        const qRaw = r['quantity'];
        const quantity =
          typeof qRaw === 'number' && Number.isFinite(qRaw) && qRaw >= 1
            ? Math.min(9999, Math.floor(qRaw))
            : 1;
        out.push({
          lineId,
          adId,
          title,
          shortNote:
            typeof r['shortNote'] === 'string' && r['shortNote'] ? String(r['shortNote']) : title,
          unitPrice,
          sellerName:
            typeof r['sellerName'] === 'string' && r['sellerName'] ? String(r['sellerName']) : 'متاح',
          sellerPhone:
            typeof r['sellerPhone'] === 'string' ? String(r['sellerPhone']) : '',
          locationLabel: normalizeSellerCityLikeProductFeedCard(
            typeof r['locationLabel'] === 'string' ? String(r['locationLabel']) : ''
          ),
          condition:
            typeof r['condition'] === 'string' && String(r['condition']).trim()
              ? String(r['condition']).trim()
              : 'غير محدد',
          quantity,
        });
      }
      return mergeLinesByAdId(out);
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lines()));
    } catch {
      /* ignore quota / private mode */
    }
  }
}

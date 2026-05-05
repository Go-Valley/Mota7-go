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
}

function newLineId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
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

  /** عدد المواد النشطة (يُستخدم لشارة التبويب). */
  readonly itemCount = computed(() => this.lines().length);

  readonly linesRo: Signal<readonly CartLine[]> = this.lines.asReadonly();

  readonly itemsTotalAmount = computed(() =>
    this.lines().reduce((sum, row) => sum + row.unitPrice, 0)
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
    };

    this.lines.update((xs) => [...xs, line]);
    this.persist();
    return true;
  }

  removeLine(lineId: string): void {
    this.lines.update((xs) => xs.filter((l) => l.lineId !== lineId));
    this.persist();
  }

  clearCart(): void {
    this.lines.set([]);
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
      });
    }
    this.lines.set(next);
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
        });
      }
      return out;
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

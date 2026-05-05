import {
  Injectable,
  OnDestroy,
  EnvironmentInjector,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { Firestore, doc, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import {
  SHOPPING_COLLECTION,
  SHOPPING_DELIVERY_CHARGES_DOC_ID,
} from './shopping-firestore-seed.service';
import { parseProductPriceToNumber } from '../utils/price-parse.util';
import { sellerCityLabelFromFirestoreOrderItemRow } from '../utils/product-seller-location.util';
import {
  ShoppingOrderStatusKey,
  normalizeShoppingOrderStatusKey,
  pickShoppingOrderStatusRaw,
} from '../utils/shopping-order-status.util';

function resolveShoppingDocStatus(data: Record<string, unknown>): ShoppingOrderStatusKey {
  const fromPick = normalizeShoppingOrderStatusKey(pickShoppingOrderStatusRaw(data));
  if (fromPick !== 'pending') {
    return fromPick;
  }
  for (const [k, raw] of Object.entries(data ?? {})) {
    const key = String(k).trim().toLowerCase().replace(/[\s_-]/g, '');
    if (key.includes('statistics')) continue;
    if (key !== 'state' && key !== 'orderstate' && key !== 'shoppingstate') {
      continue;
    }
    const v = normalizeShoppingOrderStatusKey(raw);
    if (v !== 'pending') {
      return v;
    }
  }
  return fromPick;
}

/** أرقام التواصل مع الإدارة — واتساب */
export const ADMIN_SUPPORT_WHATSAPP_E164_LOCAL = '201220883999';

const ORDER_IDS_STORAGE = 'mota7_shopping_order_ids_v1';

export type ShoppingOrderUiStatus = ShoppingOrderStatusKey;

export interface ShoppingOrderItemRow {
  adId: string;
  title: string;
  shortNote: string;
  unitPrice: number;
  sellerName: string;
  sellerPhone: string;
  locationLabel: string;
  /** حالة السلعة (جديد، مستعمل، ...) */
  condition: string;
}

export interface ShoppingOrderView {
  readonly id: string;
  buyerName: string;
  buyerPhone: string;
  buyerCity: string;
  items: ShoppingOrderItemRow[];
  itemsTotal: number;
  deliveryFee: number;
  grandTotal: number;
  paymentMethod?: string;
  status: ShoppingOrderUiStatus;
  createdAtMillis: number | null;
}

function normalizeItems(raw: unknown): ShoppingOrderItemRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ShoppingOrderItemRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const r = row as Record<string, unknown>;
    const adId = typeof r['adId'] === 'string' ? r['adId'] : '';
    const title = typeof r['title'] === 'string' ? r['title'] : '';
    const shortNote =
      typeof r['shortNote'] === 'string'
        ? r['shortNote']
        : typeof r['short_desc'] === 'string'
          ? String(r['short_desc'])
          : title;
    const unitPriceNum = parseProductPriceToNumber({ price: r['unitPrice'] });
    const conditionRaw =
      typeof r['condition'] === 'string'
        ? r['condition'].trim()
        : typeof r['productCondition'] === 'string'
          ? String(r['productCondition']).trim()
          : '';
    if (!adId || !title.trim() || !(unitPriceNum > 0)) {
      continue;
    }
    out.push({
      adId,
      title,
      shortNote,
      unitPrice: unitPriceNum,
      sellerName:
        typeof r['sellerName'] === 'string' ? r['sellerName'] : '',
      sellerPhone:
        typeof r['sellerPhone'] === 'string' ? String(r['sellerPhone']) : '',
      locationLabel: sellerCityLabelFromFirestoreOrderItemRow(r),
      condition: conditionRaw || 'غير محدد',
    });
  }
  return out;
}

function coerceNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** طابع زمني Firestore أو رقم millis */
function toMillis(v: unknown): number | null {
  if (v && typeof v === 'object' && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class MyShoppingOrdersService implements OnDestroy {
  private fs = inject(Firestore);
  private inj = inject(EnvironmentInjector);

  private readonly unsubById = new Map<string, Unsubscribe>();
  readonly orders = signal<ShoppingOrderView[]>([]);

  constructor() {
    this.reloadFromStorageAndWatch();
  }

  ngOnDestroy(): void {
    for (const u of this.unsubById.values()) {
      u();
    }
    this.unsubById.clear();
  }

  registeredOrderIds(): string[] {
    return this.readStoredIds();
  }

  rememberOrderId(id: string): void {
    const ids = this.readStoredIds();
    if (!ids.includes(id)) {
      ids.unshift(id);
      this.writeStoredIds(ids.slice(0, 40));
    }
    this.startWatch(id);
  }

  forgetOrderLocal(id: string): void {
    const ids = this.readStoredIds().filter((x) => x !== id);
    this.writeStoredIds(ids);
    const u = this.unsubById.get(id);
    u?.();
    this.unsubById.delete(id);
    this.orders.update((xs) => xs.filter((o) => o.id !== id));
  }

  private reloadFromStorageAndWatch(): void {
    const ids = this.readStoredIds();
    for (const id of ids) {
      if (id !== SHOPPING_DELIVERY_CHARGES_DOC_ID) {
        this.startWatch(id);
      }
    }
  }

  private readStoredIds(): string[] {
    try {
      const raw = localStorage.getItem(ORDER_IDS_STORAGE);
      if (!raw) {
        return [];
      }
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? p.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private writeStoredIds(ids: string[]): void {
    try {
      localStorage.setItem(ORDER_IDS_STORAGE, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }

  private mergeSnapshot(orderId: string, data: Record<string, unknown>): void {
    this.orders.update((prev) => {
      const ix = prev.findIndex((o) => o.id === orderId);
      const nextRow: ShoppingOrderView = {
        id: orderId,
        buyerName: typeof data['buyerName'] === 'string' ? data['buyerName'] : '',
        buyerPhone: typeof data['buyerPhone'] === 'string' ? data['buyerPhone'] : '',
        buyerCity: typeof data['buyerCity'] === 'string' ? data['buyerCity'] : '',
        items: normalizeItems(data['items']),
        itemsTotal: coerceNumber(data['itemsTotal']),
        deliveryFee: coerceNumber(data['deliveryFee']),
        grandTotal: coerceNumber(data['grandTotal']),
        paymentMethod: typeof data['paymentMethod'] === 'string' ? data['paymentMethod'] : '',
        status: resolveShoppingDocStatus(data),
        createdAtMillis: toMillis(data['createdAt']),
      };
      const next = [...prev];
      if (ix >= 0) {
        next[ix] = { ...prev[ix], ...nextRow };
      } else {
        next.push(nextRow);
      }
      return next.sort(
        (a, b) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0)
      );
    });
  }

  private startWatch(orderId: string): void {
    if (orderId === SHOPPING_DELIVERY_CHARGES_DOC_ID || !orderId) {
      return;
    }
    if (this.unsubById.has(orderId)) {
      return;
    }
    try {
      const ref = doc(this.fs, SHOPPING_COLLECTION, orderId);
      const unsub = runInInjectionContext(this.inj, () =>
        onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) {
              this.forgetOrderLocal(orderId);
              return;
            }
            this.mergeSnapshot(orderId, snap.data() as Record<string, unknown>);
          },
          () => {
            /* تجاهل — قد تنعدم صلاحية القراءة مؤقتًا */
          }
        )
      );
      this.unsubById.set(orderId, unsub);
    } catch {
      /* ignore */
    }
  }

  upsertPlaceholderFromFirestore(
    orderId: string,
    snapshot: Record<string, unknown>
  ): void {
    const ids = this.readStoredIds();
    if (!ids.includes(orderId)) {
      ids.unshift(orderId);
      this.writeStoredIds(ids.slice(0, 40));
    }
    this.startWatch(orderId);
    this.mergeSnapshot(orderId, snapshot);
  }
}

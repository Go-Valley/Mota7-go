import { Timestamp } from 'firebase/firestore';
import type { SubscriptionsConfig } from '../models/subscriptions-config.model';
import type {
  CashierLineDraft,
  PackageTierVariant,
  PaymentLedgerCompareReport,
  PaymentLedgerEntry,
  PaymentLedgerMonthReport,
  PaymentLedgerWriteInput,
  PaymentProductType,
  PaymentTransferMethod,
  VipLevelVariant,
} from '../models/payment-ledger.model';

export function normalizeUserKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function yyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYyyyMmDd(s: string): Date | null {
  const t = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function addDaysYyyyMmDd(start: string, days: number): string {
  const base = parseYyyyMmDd(start) ?? new Date();
  const end = new Date(base);
  end.setDate(end.getDate() + days);
  return yyyyMmDd(end);
}

export function defaultPeriodForProduct(
  productType: PaymentProductType,
  paidAtYyyyMmDd: string
): { periodStart: string; periodEnd: string } {
  const start = paidAtYyyyMmDd;
  switch (productType) {
    case 'package':
      return { periodStart: start, periodEnd: addDaysYyyyMmDd(start, 30) };
    case 'vip':
      return { periodStart: start, periodEnd: addDaysYyyyMmDd(start, 10) };
    case 'banner_design':
      return { periodStart: start, periodEnd: start };
    case 'banner_upload':
      return { periodStart: start, periodEnd: addDaysYyyyMmDd(start, 30) };
    default:
      return { periodStart: start, periodEnd: start };
  }
}

export function listPriceFromConfig(
  cfg: SubscriptionsConfig,
  productType: PaymentProductType,
  productVariant: string
): number {
  switch (productType) {
    case 'package': {
      const tier = productVariant as PackageTierVariant;
      const plan = (cfg.plans ?? []).find((p) => p.tier === tier);
      return plan?.price ?? 0;
    }
    case 'vip': {
      const m = /^vip_(\d)$/.exec(productVariant);
      const n = m ? parseInt(m[1], 10) : 1;
      const key = `vip_pin_price_level_${n}` as keyof SubscriptionsConfig;
      return Number(cfg[key]) || 0;
    }
    case 'banner_design':
      return Number(cfg.banner_design_price) || 0;
    case 'banner_upload':
      return Number(cfg.banner_display_price) || 0;
    default:
      return 0;
  }
}

export function productTypeLabelAr(t: PaymentProductType): string {
  switch (t) {
    case 'package':
      return 'باقة شهرية';
    case 'vip':
      return 'توثيق VIP';
    case 'banner_design':
      return 'تصميم بانر';
    case 'banner_upload':
      return 'رفع بانر شهري';
    default:
      return t;
  }
}

export function productVariantLabelAr(
  productType: PaymentProductType,
  variant: string
): string {
  switch (productType) {
    case 'package':
      switch (variant) {
        case 'bronze':
          return 'برونزي';
        case 'silver':
          return 'فضي';
        case 'gold':
          return 'ذهبي';
        case 'diamond':
          return 'ماسي';
        default:
          return variant;
      }
    case 'vip': {
      const m = /^vip_(\d)$/.exec(variant);
      return m ? `مستوى ${m[1]}` : variant;
    }
    case 'banner_design':
      return 'مرة واحدة';
    case 'banner_upload':
      return 'شهري';
    default:
      return variant;
  }
}

export function paymentMethodLabelAr(m: PaymentTransferMethod): string {
  switch (m) {
    case 'wallet':
      return 'محفظة';
    case 'instapay':
      return 'انستاباي';
    case 'fawry':
      return 'فوري';
    default:
      return m;
  }
}

export const PAYMENT_METHOD_OPTIONS: { value: PaymentTransferMethod; label: string }[] = [
  { value: 'wallet', label: 'محفظة' },
  { value: 'instapay', label: 'انستاباي' },
  { value: 'fawry', label: 'فوري' },
];

export function newCashierLine(
  productType: PaymentProductType,
  cfg: SubscriptionsConfig,
  paidAtYyyyMmDd: string
): CashierLineDraft {
  const productVariant = defaultVariantForType(productType);
  const listPriceEgp = listPriceFromConfig(cfg, productType, productVariant);
  const period = defaultPeriodForProduct(productType, paidAtYyyyMmDd);
  return {
    key: `${productType}_${productVariant}_${Date.now()}`,
    productType,
    productVariant,
    amountEgp: listPriceEgp,
    listPriceEgp,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    selected: true,
  };
}

function defaultVariantForType(productType: PaymentProductType): string {
  switch (productType) {
    case 'package':
      return 'bronze';
    case 'vip':
      return 'vip_1';
    case 'banner_design':
    case 'banner_upload':
      return 'default';
    default:
      return 'default';
  }
}

export function refreshLineForVariant(
  line: CashierLineDraft,
  cfg: SubscriptionsConfig
): CashierLineDraft {
  const listPriceEgp = listPriceFromConfig(cfg, line.productType, line.productVariant);
  return { ...line, listPriceEgp, amountEgp: listPriceEgp };
}

export function formatPeriodAr(start: string, end: string): string {
  if (start === end) return start;
  return `${start} → ${end}`;
}

export function timestampToYyyyMmDd(ts: Timestamp | undefined | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return yyyyMmDd(ts.toDate());
}

export function buildWhatsAppSummary(opts: {
  userKey: string;
  lines: Array<{
    productType: PaymentProductType;
    productVariant: string;
    amountEgp: number;
    periodStart: string;
    periodEnd: string;
  }>;
  paidAtYyyyMmDd: string;
  paymentMethod: PaymentTransferMethod;
  /** عند تعدد طرق الدفع (عرض مجمّع من السجل) */
  paymentMethodDisplay?: string;
  reference?: string;
  totalEgp: number;
}): string {
  const rows = opts.lines.map((ln, i) => {
    const name = `${productTypeLabelAr(ln.productType)} — ${productVariantLabelAr(
      ln.productType,
      ln.productVariant
    )}`;
    const period = formatPeriodAr(ln.periodStart, ln.periodEnd);
    return `${i + 1}. ${name}\n   الفترة: ${period}\n   المبلغ: ${ln.amountEgp} جم`;
  });
  const ref = String(opts.reference ?? '').trim();
  const methodText =
    String(opts.paymentMethodDisplay ?? '').trim() ||
    paymentMethodLabelAr(opts.paymentMethod);
  const parts = [
    'مرحباً بك في "مُتاح" ..',
    ' تم تسجيل اشتراكك بنجاح',
    '',
    `رقم الحساب: ${opts.userKey}`,
    `تاريخ الدفع: ${opts.paidAtYyyyMmDd}`,
    `طريقة الدفع: ${methodText}`,
    ...(ref ? [`مرجع التحويل: ${ref}`] : []),
    '',
    ...rows,
    '',
    `الإجمالي: ${opts.totalEgp} جم`,
    '',
    'شكراً لإنضمامك معنا علـ "مُتاح".',
  ];
  return parts.join('\n');
}

/** ملخص واتساب لكل اشتراكات مستخدم (عرض «حسب المستخدم» في السجل). */
export function buildWhatsAppSummaryFromEntries(
  userKey: string,
  entries: Array<{
    productType: PaymentProductType;
    productVariant: string;
    amountEgp: number;
    periodStart: string;
    periodEnd: string;
    paidAt?: Timestamp | null;
    paymentMethod?: PaymentTransferMethod;
    reference?: string;
    status?: string;
  }>
): string {
  const active = entries.filter((e) => e.status !== 'cancelled' && e.status !== 'refunded');
  if (!active.length) return '';

  const lines = active.map((e) => ({
    productType: e.productType,
    productVariant: e.productVariant,
    amountEgp: e.amountEgp,
    periodStart: e.periodStart,
    periodEnd: e.periodEnd,
  }));
  const totalEgp = active.reduce((s, e) => s + (Number(e.amountEgp) || 0), 0);

  const paidDates = [
    ...new Set(active.map((e) => timestampToYyyyMmDd(e.paidAt ?? null)).filter(Boolean)),
  ];
  const paidAtYyyyMmDd =
    paidDates.length === 1
      ? paidDates[0]!
      : paidDates.length > 1
        ? paidDates.join('، ')
        : '';

  const methodLabels = [
    ...new Set(
      active
        .map((e) => (e.paymentMethod ? paymentMethodLabelAr(e.paymentMethod) : ''))
        .filter(Boolean)
    ),
  ];
  const paymentMethod = active[0]?.paymentMethod ?? 'wallet';

  const refs = [
    ...new Set(active.map((e) => String(e.reference ?? '').trim()).filter(Boolean)),
  ];

  return buildWhatsAppSummary({
    userKey,
    lines,
    paidAtYyyyMmDd: paidAtYyyyMmDd || '—',
    paymentMethod,
    paymentMethodDisplay:
      methodLabels.length > 1 ? methodLabels.join(' · ') : undefined,
    reference: refs.join('، ') || undefined,
    totalEgp,
  });
}

export function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRangeUtc(monthKey: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  if (mo < 0 || mo > 11) return null;
  const start = new Date(y, mo, 1, 0, 0, 0, 0);
  const end = new Date(y, mo + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function previousMonthKey(monthKey: string): string {
  const r = monthRangeUtc(monthKey);
  if (!r) return monthKey;
  const d = new Date(r.start);
  d.setMonth(d.getMonth() - 1);
  return monthKeyFromDate(d);
}

function emptyMonthReport(monthKey: string): PaymentLedgerMonthReport {
  return {
    monthKey,
    totalEgp: 0,
    lineCount: 0,
    uniqueUsers: 0,
    byProductType: {
      package: 0,
      vip: 0,
      banner_design: 0,
      banner_upload: 0,
    },
    byPackageTier: {},
    byVipLevel: {},
    bannerDesignTotal: 0,
    bannerUploadTotal: 0,
  };
}

export function aggregateMonthReport(
  monthKey: string,
  entries: PaymentLedgerEntry[]
): PaymentLedgerMonthReport {
  const active = entries.filter((e) => e.status === 'recorded');
  const rep = emptyMonthReport(monthKey);
  const users = new Set<string>();
  for (const e of active) {
    rep.lineCount += 1;
    rep.totalEgp += e.amountEgp;
    users.add(e.userKey);
    rep.byProductType[e.productType] =
      (rep.byProductType[e.productType] ?? 0) + e.amountEgp;
    if (e.productType === 'package') {
      const t = e.productVariant as PackageTierVariant;
      rep.byPackageTier[t] = (rep.byPackageTier[t] ?? 0) + e.amountEgp;
    }
    if (e.productType === 'vip') {
      const v = e.productVariant as VipLevelVariant;
      rep.byVipLevel[v] = (rep.byVipLevel[v] ?? 0) + e.amountEgp;
    }
    if (e.productType === 'banner_design') {
      rep.bannerDesignTotal += e.amountEgp;
    }
    if (e.productType === 'banner_upload') {
      rep.bannerUploadTotal += e.amountEgp;
    }
  }
  rep.uniqueUsers = users.size;
  return rep;
}

export function compareMonthReports(
  current: PaymentLedgerMonthReport,
  previous: PaymentLedgerMonthReport
): PaymentLedgerCompareReport {
  const revenueDeltaEgp = current.totalEgp - previous.totalEgp;
  const revenueDeltaPct =
    previous.totalEgp > 0
      ? Math.round((revenueDeltaEgp / previous.totalEgp) * 1000) / 10
      : current.totalEgp > 0
        ? null
        : 0;
  return {
    current,
    previous,
    revenueDeltaEgp,
    revenueDeltaPct,
    usersDelta: current.uniqueUsers - previous.uniqueUsers,
  };
}

export interface UserPaymentGroupRow {
  userKey: string;
  userPhone?: string;
  totalEgp: number;
  lineCount: number;
  packageAmount: number;
  vipAmount: number;
  bannerDesignAmount: number;
  bannerUploadAmount: number;
  /** ملاحظات فريدة من عمليات المستخدم (تسجيل سريع) */
  notes: string[];
  entries: PaymentLedgerEntry[];
}

/** ملاحظات غير مكررة من قائمة عمليات */
export function uniqueNotesFromEntries(entries: PaymentLedgerEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    const n = String(e.notes ?? '').trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function groupEntriesByUser(entries: PaymentLedgerEntry[]): UserPaymentGroupRow[] {
  const map = new Map<string, UserPaymentGroupRow>();
  for (const e of entries.filter((x) => x.status === 'recorded')) {
    let row = map.get(e.userKey);
    if (!row) {
      row = {
        userKey: e.userKey,
        userPhone: e.userPhone,
        totalEgp: 0,
        lineCount: 0,
        packageAmount: 0,
        vipAmount: 0,
        bannerDesignAmount: 0,
        bannerUploadAmount: 0,
        notes: [],
        entries: [],
      };
      map.set(e.userKey, row);
    }
    row.lineCount += 1;
    row.totalEgp += e.amountEgp;
    row.entries.push(e);
    if (e.userPhone && !row.userPhone) row.userPhone = e.userPhone;
    switch (e.productType) {
      case 'package':
        row.packageAmount += e.amountEgp;
        break;
      case 'vip':
        row.vipAmount += e.amountEgp;
        break;
      case 'banner_design':
        row.bannerDesignAmount += e.amountEgp;
        break;
      case 'banner_upload':
        row.bannerUploadAmount += e.amountEgp;
        break;
    }
  }
  for (const row of map.values()) {
    row.notes = uniqueNotesFromEntries(row.entries);
  }
  return [...map.values()].sort((a, b) => b.totalEgp - a.totalEgp);
}

export function ledgerEntriesToCsv(entries: PaymentLedgerEntry[]): string {
  const header = [
    'رقم_الحساب',
    'الهاتف',
    'الخدمة',
    'التفصيل',
    'المبلغ_جم',
    'من',
    'إلى',
    'تاريخ_الدفع',
    'طريقة_الدفع',
    'مرجع',
    'الحالة',
    'ملاحظات',
    'معرف_الجلسة',
  ];
  const rows = entries.map((e) => [
    e.userKey,
    e.userPhone ?? '',
    productTypeLabelAr(e.productType),
    productVariantLabelAr(e.productType, e.productVariant),
    String(e.amountEgp),
    e.periodStart,
    e.periodEnd,
    timestampToYyyyMmDd(e.paidAt),
    paymentMethodLabelAr(e.paymentMethod),
    e.reference ?? '',
    e.status,
    (e.notes ?? '').replace(/\n/g, ' '),
    e.sessionId ?? '',
  ]);
  const escape = (v: string) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
}

export function downloadCsvFile(filename: string, csv: string): void {
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function coerceLedgerEntry(id: string, raw: Record<string, unknown>): PaymentLedgerEntry | null {
  const userKey = normalizeUserKey(raw['userKey'] ?? raw['user_key']);
  if (!userKey) return null;
  const productType = String(raw['productType'] ?? raw['product_type'] ?? '').trim() as PaymentProductType;
  const okTypes: PaymentProductType[] = ['package', 'vip', 'banner_design', 'banner_upload'];
  if (!okTypes.includes(productType)) return null;
  const paidAt = raw['paid_at'] ?? raw['paidAt'];
  if (!(paidAt instanceof Timestamp)) return null;
  const method = String(raw['paymentMethod'] ?? raw['payment_method'] ?? 'wallet').trim() as PaymentTransferMethod;
  const okMethods: PaymentTransferMethod[] = ['wallet', 'instapay', 'fawry'];
  return {
    id,
    userKey,
    userPhone: String(raw['userPhone'] ?? raw['user_phone'] ?? '').trim() || undefined,
    productType,
    productVariant: String(raw['productVariant'] ?? raw['product_variant'] ?? '').trim() || 'default',
    amountEgp: coerceMoney(raw['amountEgp'] ?? raw['amount_egp']),
    listPriceEgp: coerceMoneyOptional(raw['listPriceEgp'] ?? raw['list_price_egp']),
    periodStart: String(raw['periodStart'] ?? raw['period_start'] ?? '').trim(),
    periodEnd: String(raw['periodEnd'] ?? raw['period_end'] ?? '').trim(),
    paidAt,
    paymentMethod: okMethods.includes(method) ? method : 'wallet',
    reference: String(raw['reference'] ?? '').trim() || undefined,
    status: (String(raw['status'] ?? 'recorded').trim() as PaymentLedgerEntry['status']) || 'recorded',
    notes: String(raw['notes'] ?? '').trim() || undefined,
    sessionId: String(raw['sessionId'] ?? raw['session_id'] ?? '').trim() || undefined,
    recordedAt:
      raw['recorded_at'] instanceof Timestamp
        ? raw['recorded_at']
        : raw['recordedAt'] instanceof Timestamp
          ? raw['recordedAt']
          : undefined,
  };
}

function coerceMoney(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function coerceMoneyOptional(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = coerceMoney(v);
  return n > 0 ? n : undefined;
}

export function writeInputFromCashierLine(
  line: CashierLineDraft,
  base: Omit<PaymentLedgerWriteInput, keyof PaymentLedgerWriteInput> &
    Pick<
      PaymentLedgerWriteInput,
      'userKey' | 'userPhone' | 'paidAt' | 'paymentMethod' | 'reference' | 'notes' | 'sessionId'
    >
): PaymentLedgerWriteInput {
  return {
    ...base,
    productType: line.productType,
    productVariant: line.productVariant,
    amountEgp: line.amountEgp,
    listPriceEgp: line.listPriceEgp,
    periodStart: line.periodStart,
    periodEnd: line.periodEnd,
  };
}

/** أقل عدد عناصر قبل تفعيل التمرير الافتراضي في شاشة السجل */
export const PAYMENT_LEDGER_VIRTUAL_SCROLL_MIN_ITEMS = 16;

/** ارتفاع تقديري لبطاقة «سطر بسطر» (بكسل) — يشمل الهامش السفلي */
export const PAYMENT_LEDGER_LINE_VIRTUAL_ITEM_PX = 220;

/** ارتفاع تقديري لبطاقة «حسب المستخدم» (بكسل) */
export const PAYMENT_LEDGER_GROUP_VIRTUAL_ITEM_PX = 280;

/** تأخير تطبيق فلتر البحث بالحساب (مللي ثانية) */
export const PAYMENT_LEDGER_USER_FILTER_DEBOUNCE_MS = 280;

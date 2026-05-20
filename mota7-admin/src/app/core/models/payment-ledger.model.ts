import { Timestamp } from 'firebase/firestore';

export const PAYMENT_LEDGER_COLLECTION = 'admin_payment_ledger';

export type PaymentProductType =
  | 'package'
  | 'vip'
  | 'banner_design'
  | 'banner_upload';

export type PaymentTransferMethod = 'wallet' | 'instapay' | 'fawry';

export type PaymentLedgerStatus = 'recorded' | 'cancelled' | 'refunded';

export type PackageTierVariant = 'bronze' | 'silver' | 'gold' | 'diamond';

export type VipLevelVariant = 'vip_1' | 'vip_2' | 'vip_3' | 'vip_4' | 'vip_5';

export interface PaymentLedgerEntry {
  id: string;
  userKey: string;
  userPhone?: string;
  productType: PaymentProductType;
  productVariant: string;
  amountEgp: number;
  listPriceEgp?: number;
  /** YYYY-MM-DD — قابل للتعديل اليدوي */
  periodStart: string;
  periodEnd: string;
  paidAt: Timestamp;
  paymentMethod: PaymentTransferMethod;
  reference?: string;
  status: PaymentLedgerStatus;
  notes?: string;
  sessionId?: string;
  recordedAt?: Timestamp;
}

export interface PaymentLedgerWriteInput {
  userKey: string;
  userPhone?: string;
  productType: PaymentProductType;
  productVariant: string;
  amountEgp: number;
  listPriceEgp?: number;
  periodStart: string;
  periodEnd: string;
  paidAt: Date;
  paymentMethod: PaymentTransferMethod;
  reference?: string;
  notes?: string;
  sessionId?: string;
}

export interface CashierLineDraft {
  key: string;
  productType: PaymentProductType;
  productVariant: string;
  amountEgp: number;
  listPriceEgp: number;
  periodStart: string;
  periodEnd: string;
  selected: boolean;
}

export interface PaymentLedgerMonthReport {
  monthKey: string;
  totalEgp: number;
  lineCount: number;
  uniqueUsers: number;
  byProductType: Record<PaymentProductType, number>;
  byPackageTier: Partial<Record<PackageTierVariant, number>>;
  byVipLevel: Partial<Record<VipLevelVariant, number>>;
  bannerDesignTotal: number;
  bannerUploadTotal: number;
}

export interface PaymentLedgerCompareReport {
  current: PaymentLedgerMonthReport;
  previous: PaymentLedgerMonthReport;
  revenueDeltaEgp: number;
  revenueDeltaPct: number | null;
  usersDelta: number;
}

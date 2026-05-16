/**
 * يجب أن يطابق fcm-push-server/config/recipient-criteria.cjs
 * (من يستلم push = من يرى الطلب في «طلبات العملاء»).
 */
export const PROVIDER_INBOX_CRITERIA = {
  /** قبل الإنتاج: enabled: false */
  testOverride: {
    enabled: false,
    providerPhones: ['01019661891', '01220883999', '01147773365'],
  },

  serviceToAdType: {
    delivery: 'delivery',
    education: 'education',
    other: 'other',
  } as Record<string, string>,

  supportedServiceTypes: ['delivery', 'education', 'other'] as const,

  providerAdQuery: {
    requireIsAvailable: true,
    requireAdStatus: null as string | null,
  },

  matching: {
    useCoverageAndServiceToken: true,
    allowExactMatchKeyFallback: true,
  },
};

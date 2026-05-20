'use strict';

/**
 * من يستلم إشعار طلب خدمة جديد — عدّل هنا فقط.
 */
module.exports = {
  projectId: process.env.FCM_PROJECT_ID || 'mota7-go',

  /**
   * وضع اختبار: يتجاهل مطابقة الإعلانات ويرسل فقط لهذه الأرقام.
   * قبل الإنتاج: enabled: false
   */
  testOverride: {
    /** true = يرسل فقط لـ providerPhones. للاختبار: FCM_TEST_OVERRIDE=1 على Render */
    enabled: process.env.FCM_TEST_OVERRIDE === '1',
    providerPhones: ['01019661891', '01220883999', '01147773365'],
  },

  /** serviceType على الطلب → ad_type في ads */
  serviceToAdType: {
    delivery: 'delivery',
    education: 'education',
    other: 'other',
  },

  supportedServiceTypes: ['delivery', 'education', 'other'],

  providerAdQuery: {
    requireIsAvailable: true,
    /** مثل 'approved' أو null */
    requireAdStatus: null,
  },

  matching: {
    useCoverageAndServiceToken: true,
    allowExactMatchKeyFallback: true,
  },

  deviceTokens: {
    app: 'mota7',
    excludeDisabled: true,
  },

  order: {
    requireStatusPending: true,
  },

  notification: {
    adminTopic: 'admin_all',
    providerBodySuffix: 'اضغط للاطلاع والقبول من «طلبات العملاء».',
    androidChannelId: 'mota7-orders',
    androidSound: 'talap',
  },
};

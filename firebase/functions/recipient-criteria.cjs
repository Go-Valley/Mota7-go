'use strict';

const { SERVICE_ORDER_TYPES } = require('./service-order-types.cjs');

/**
 * معايير من يستلم إشعار طلب خدمة جديد.
 * عدّل هذا الملف لتغيير الجمهور دون لمس منطق المطابقة التفصيلي في service-order-match.cjs.
 */
module.exports = {
  /** delivery | education | other — يجب أن يبقى متوافقاً مع service-order-types.cjs */
  supportedServiceTypes: SERVICE_ORDER_TYPES,

  /** serviceType على الطلب → ad_type في مجموعة ads */
  serviceToAdType: {
    delivery: 'delivery',
    education: 'education',
    other: 'other',
  },

  providerAdQuery: {
    /** استعلام Firestore: ads حيث is_available === true */
    requireIsAvailable: true,
    /**
     * إن وُضعت قيمة (مثل 'approved') يُضاف where('status', '==', …) — قد يتطلب فهرساً مركّباً.
     * null = لا فلترة حسب status (السلوك الحالي).
     */
    requireAdStatus: null,
  },

  matching: {
    /** مدن التغطية + نوع الخدمة (service-order-match.cjs) */
    useCoverageAndServiceToken: true,
    /** مطابقة delivery_match_key / education_match_key / other_match_key كنص عند فشل المطابقة التفصيلية */
    allowExactMatchKeyFallback: true,
  },

  deviceTokens: {
    app: 'mota7',
    excludeDisabled: true,
  },

  order: {
    requireStatusPending: true,
  },
};

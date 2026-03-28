/** مفاتيح Remote Config — أنشئها في Firebase Console → Remote Config (نفس الأسماء) */
export const MANDATORY_UPDATE_RC_KEYS = {
  /** أقل android:versionCode مسموح؛ أي build أقل يُحجب حتى التحديث من Play */
  MIN_VERSION_CODE: 'android_min_version_code',
  /** false يعطّل الحجب حتى لو min أعلى (طوارئ دون رفع APK) */
  MANDATORY_ENABLED: 'android_mandatory_update_enabled',
  TITLE_AR: 'update_title_ar',
  MESSAGE_AR: 'update_message_ar',
  /** اختياري؛ إن وُجد يُستخدم بدل رابط Play الافتراضي من environment */
  PLAY_STORE_URL: 'play_store_url',
} as const;

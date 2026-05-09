# Mota7 — دليل بناء ورفع iOS (بدون Mac)

هذا الدليل يلخص **الخطوات التي تبقى عندك** بعد إعداد المشروع في المستودع: ربط Apple، Firebase، وبناء IPA عبر [Codemagic](https://codemagic.io/).

## 1) المتطلبات الحسابية (لا يمكن أتمتتها داخل المشروع)

- حساب [Apple Developer Program](https://developer.apple.com/programs/) (مدفوع).
- تطبيق مسجّل في [App Store Connect](https://appstoreconnect.apple.com/) بنفس **Bundle ID**: `com.mota7.app`.
- شهادات التوقيع وملفات Provisioning: تُدار عادةً عبر **Codemagic** (Automatic code signing) أو يدويًا.
- في **Firebase Console** (مشروع `mota7-go`):
  1. أضف تطبيق **iOS** بالـ Bundle ID أعلاه.
  2. نزّل `GoogleService-Info.plist` واستبدل الملف في `ios/App/App/GoogleService-Info.plist`.
  3. حدّث `GOOGLE_APP_ID` و`firebaseConfigIos.appId` في `src/environments/environment*.ts` لتطابق القيم من Firebase.
- **APNs**: في Firebase → Project settings → Cloud Messaging → ارفع **APNs Authentication Key** (.p8) أو الشهادة، حتى تعمل FCM على iOS.
- في `environment.prod.ts` (وعند الحاجة `environment.capacitor.ts`): عيّن `appStoreUrl` برابط صفحة App Store بعد النشر (للتحديث الإجباري على iOS).

## 2) إصدار أول بناء محليًا (ويندوز)

على Windows يمكنك توليد مجلد `ios/` والتحقق من الويب فقط؛ أرشفة Xcode تتم على Mac أو على Codemagic.

```bash
cd Mota7
npm ci
npm run build:ios:prod
```

(السكربت يبني Angular للإنتاج، ينسخ الصوت/السبلاش، ثم `npx cap sync ios`.)

## 3) أيقونات وشاشة إقلاع iOS (`@capacitor/assets`)

الصور المصدرية في `Mota7/resources/` (`icon.png`, `splash.png`). الإعدادات اللونية في `assets.config.json`.

على macOS أو في Codemagic:

```bash
cd Mota7
npx --yes @capacitor/assets generate --ios
npm run build:ios:prod
```

**App Store 1024×1024:** يجب أن تكون أيقونة المتجر **بدون شفافية**. إذا كانت `resources/icon.png` تحتوي ألفا، استبدلها بأيقونة مصممة للمتجر ثم أعد التوليد.

## 4) الإصدارات (مواءمة أندرويد)

| أندرويد (`android/app/build.gradle`) | آي أو إس (`ios/App/App.xcodeproj` — هدف App) | `package.json` |
|-------------------------------------|---------------------------------------------|----------------|
| `versionName` `"2.2"` ← | `MARKETING_VERSION` = `2.2` | حقل `"version": "2.2"` |
| `versionCode` `26` ← | `CURRENT_PROJECT_VERSION` = `26` | (لا يوجد؛ يبقى فقط على المنصّتين) |

- رقم البناء الذي يقرأه Capacitor (`App.getInfo().build`) يجب أن يبقى **متطابقًا** بين المنصّتين حتى يعمل التحديث الإجباري بشكل منطقي.
- عند كل إصدار جديد على Play: عدِّل **`versionCode` و`versionName`** ثم عدِّل **`MARKETING_VERSION` و`CURRENT_PROJECT_VERSION`** وأيضًا **`version` في `package.json`** لتطابق `versionName`.

## 5) Codemagic — أول تشغيل

1. أنشئ تطبيقًا جديدًا يشير إلى هذا المستودع، مع **Root** يتضمن مجلد `Mota7`.
2. اربط **App Store Connect** و**Apple Developer** من إعدادات الفريق (Integrations).
3. استخدم `codemagic.yaml` في جذر المستودع:
   - `mota7-ios-manual`: يُنتج IPA فقط.
   - `mota7-ios-release`: يبني ويُرسل إلى TestFlight إذا فعّلت `publishing` وربطت التكامل.
4. في Codemagic → **Environment variables** يمكنك لاحقًا حقن `GoogleService-Info.plist` (مثلاً Base64) قبل خطوة البناء إن لم ترد وضع الملف في Git.

## 6) TestFlight و App Store

1. بعد نجاح البناء، يظهر **IPA** ضمن Artifacts.
2. إن فعّلت الرفع، يظهر البناء في App Store Connect → TestFlight.
3. أضف **معلومات الامتثال** و**لقطات الشاشة** و**سياسة الخصوصية** قبل الإرسال للمراجعة.

## 7) تحقق سريع قبل المراجعة

- [ ] `GoogleService-Info.plist` حقيقي وليس placeholder.
- [ ] `firebaseConfigIos.appId` يطابق Firebase.
- [ ] APNs مضبوط في Firebase.
- [ ] أيقونة 1024 بدون شفافية.
- [ ] `appStoreUrl` مملوء في الإنتاج عند الحاجة للتحديث الإجباري على iOS.
- [ ] سياسات الخصوصية في `Info.plist` تعكس الاستخدام الفعلي (كاميرا، مكتبة صور، موقع، إشعارات).

---

للتفاصيل العامة عن Capacitor + iOS: [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios).

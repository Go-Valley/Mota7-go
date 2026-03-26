/**
 * نسخ صورة Splash من src/assets إلى مجلدات Android drawable
 * يُستدعى قبل بناء أندرويد لضمان ظهور الصورة عند الإقلاع
 *
 * - drawable-nodpi: صورة واحدة بلا تصغير حسب الكثافة — أنسب لشاشة إقلاع بملء الشاشة على كل الأجهزة
 *
 * يُفضّل صورة عمودية بملء الشاشة (مثال 1080×1920) — تُعرض عبر drawable/splash_launch.xml في ثيم الإقلاع
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'assets', 'splash.png');
const resRoot = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const destDirs = [path.join(resRoot, 'drawable-nodpi')];

if (!fs.existsSync(src)) {
  console.warn('[copy-splash] تحذير: src/assets/splash.png غير موجود. أضف الصورة للمتابعة.');
  process.exit(0);
}

// إزالة نسخ قديمة كانت تسبب اختيار مورد خاطئ بدل drawable-nodpi
const legacySplash = [
  path.join(resRoot, 'drawable', 'splash.png'),
  path.join(resRoot, 'drawable-v24', 'splash.png'),
];
for (const p of legacySplash) {
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('[copy-splash] حذف نسخة قديمة:', path.relative(path.join(__dirname, '..'), p));
  }
}

for (const destDir of destDirs) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const dest = path.join(destDir, 'splash.png');
  fs.copyFileSync(src, dest);
  console.log('[copy-splash] تم نسخ splash.png إلى', path.relative(path.join(__dirname, '..'), dest));
}

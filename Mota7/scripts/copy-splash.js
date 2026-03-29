/**
 * نسخ صور Splash/Logo من src/assets إلى Android drawable
 * يُستدعى قبل بناء أندرويد لضمان ظهور الصورة عند الإقلاع
 *
 * - drawable-nodpi: صورة واحدة بلا تصغير حسب الكثافة — أنسب لشاشة إقلاع بملء الشاشة على كل الأجهزة
 *
 * يُفضّل صورة عمودية بملء الشاشة (مثال 1080×1920) — تُعرض عبر drawable/splash_launch.xml في ثيم الإقلاع
 */
const fs = require('fs');
const path = require('path');

const splashSrc = path.join(__dirname, '..', 'src', 'assets', 'splash.png');
const logoSrc = path.join(__dirname, '..', 'src', 'assets', 'start.png');
const resRoot = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const destDirs = [path.join(resRoot, 'drawable-nodpi')];

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
  if (fs.existsSync(splashSrc)) {
    const splashDest = path.join(destDir, 'splash.png');
    fs.copyFileSync(splashSrc, splashDest);
    console.log('[copy-splash] تم نسخ splash.png إلى', path.relative(path.join(__dirname, '..'), splashDest));
  } else {
    console.warn('[copy-splash] تحذير: src/assets/splash.png غير موجود. تم تخطي نسخة الخلفية.');
  }

  if (fs.existsSync(logoSrc)) {
    const logoDest = path.join(destDir, 'start.png');
    fs.copyFileSync(logoSrc, logoDest);
    console.log('[copy-splash] تم نسخ start.png إلى', path.relative(path.join(__dirname, '..'), logoDest));
  } else {
    console.warn('[copy-splash] تحذير: src/assets/start.png غير موجود. تم تخطي نسخة اللوجو.');
  }
}

/**
 * نسخ صورة Splash من src/assets إلى مجلدات Android drawable
 * يُستدعى قبل بناء أندرويد لضمان ظهور الصورة عند الإقلاع
 *
 * - drawable: للأجهزة كل المستويات
 * - drawable-v24: نسخة لـ API 24+ (يختارها النظام تلقائياً عند وجودها؛ يزيل الشك حول مصدر المورد)
 *
 * يُفضّل صورة عمودية بملء الشاشة (مثال 1080×1920) — تُعرض عبر drawable/splash_launch.xml في ثيم الإقلاع
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'assets', 'splash.png');
const resRoot = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const destDirs = [
  path.join(resRoot, 'drawable'),
  path.join(resRoot, 'drawable-v24')
];

if (!fs.existsSync(src)) {
  console.warn('[copy-splash] تحذير: src/assets/splash.png غير موجود. أضف الصورة للمتابعة.');
  process.exit(0);
}

for (const destDir of destDirs) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const dest = path.join(destDir, 'splash.png');
  fs.copyFileSync(src, dest);
  console.log('[copy-splash] تم نسخ splash.png إلى', path.relative(path.join(__dirname, '..'), dest));
}

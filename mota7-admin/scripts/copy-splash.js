/**
 * نسخ splash.png إلى موارد Android قبل cap sync (نفس سلوك Mota7).
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'assets', 'splash.png');
const resRoot = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const destDirs = [
  path.join(resRoot, 'drawable'),
  path.join(resRoot, 'drawable-v24'),
];

if (!fs.existsSync(src)) {
  console.warn('[copy-splash] تحذير: src/assets/splash.png غير موجود.');
  process.exit(0);
}

for (const destDir of destDirs) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const dest = path.join(destDir, 'splash.png');
  fs.copyFileSync(src, dest);
  console.log('[copy-splash] تم النسخ إلى', path.relative(path.join(__dirname, '..'), dest));
}

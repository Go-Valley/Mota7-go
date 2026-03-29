/**
 * نسخ mota7.mp3 من src/assets إلى res/raw لقنوات Local Notifications على أندرويد
 * (نفس سلوك mota7-admin).
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'assets', 'mota7.mp3');
const rawDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'raw');
const dest = path.join(rawDir, 'mota7.mp3');

if (!fs.existsSync(src)) {
  console.warn('[copy-notification-sound] تحذير: src/assets/mota7.mp3 غير موجود.');
  process.exit(0);
}

if (!fs.existsSync(rawDir)) {
  fs.mkdirSync(rawDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log('[copy-notification-sound] تم النسخ إلى', path.relative(path.join(__dirname, '..'), dest));

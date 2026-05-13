/**
 * نسخ ملفات الصوت من src/assets إلى res/raw لقنوات Local Notifications على أندرويد:
 * mota7.mp3 (إعلانات)، talap.mp3 (طلبات العملاء لمقدمي الخدمة).
 */
const fs = require('fs');
const path = require('path');

const rawDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'raw');

function copyIfExists(relAsset, rawName) {
  const src = path.join(__dirname, '..', 'src', 'assets', relAsset);
  const dest = path.join(rawDir, rawName);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-notification-sound] تحذير: src/assets/${relAsset} غير موجود، يُتخطى.`);
    return;
  }
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log('[copy-notification-sound] تم النسخ إلى', path.relative(path.join(__dirname, '..'), dest));
}

copyIfExists('mota7.mp3', 'mota7.mp3');
copyIfExists('talap.mp3', 'talap.mp3');

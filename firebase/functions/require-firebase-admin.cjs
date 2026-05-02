'use strict';

/**
 * Cloud Functions المنشورة: تنصيب firebase ضمن firebase/functions/node_modules.
 * مشغّل Spark محلياً/على GitHub Actions غالباً يثبّت الحزمة فقط تحت firebase/spark-runner.
 */
const fs = require('fs');
const path = require('path');

function loadAdmin() {
  try {
    return require('firebase-admin');
  } catch (err) {
    const fallback = path.join(__dirname, '../spark-runner/node_modules/firebase-admin');
    const pkgJson = path.join(fallback, 'package.json');
    try {
      if (fs.existsSync(pkgJson)) {
        return /** @type {typeof import('firebase-admin')} */ (require(fallback));
      }
    } catch {
      /* fall through */
    }
    throw err;
  }
}

module.exports = loadAdmin();

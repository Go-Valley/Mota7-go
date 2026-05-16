'use strict';

/**
 * Cloud Functions المنشورة: تنصيب firebase ضمن firebase/functions/node_modules.
 * مشغّل Spark محلياً/على GitHub Actions غالباً يثبّت الحزمة فقط تحت firebase/spark-runner.
 */
const fs = require('fs');
const path = require('path');

/** @param {string} moduleDir absolute path to firebase-admin package dir */
function tryRequireFromDir(moduleDir) {
  const pkgJson = path.join(moduleDir, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    return null;
  }
  return /** @type {typeof import('firebase-admin')} */ (require(moduleDir));
}

function loadAdmin() {
  try {
    return require('firebase-admin');
  } catch (firstErr) {
    const fallbacks = [
      path.join(__dirname, '../spark-runner/node_modules/firebase-admin'),
      path.join(__dirname, '../../fcm-push-server/node_modules/firebase-admin'),
    ];
    for (const dir of fallbacks) {
      try {
        const mod = tryRequireFromDir(dir);
        if (mod) return mod;
      } catch {
        /* try next */
      }
    }
    throw firstErr;
  }
}

module.exports = loadAdmin();

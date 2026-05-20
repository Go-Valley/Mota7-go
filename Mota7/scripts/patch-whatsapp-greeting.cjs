const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const importLine =
  "import { encodeWhatsappText } from 'src/app/core/utils/whatsapp-open.util';";

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

let updated = 0;
for (const f of walk(root)) {
  let c = fs.readFileSync(f, 'utf8');
  if (!c.includes('\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645')) continue;
  if (!c.includes('encodeURIComponent')) continue;

  const orig = c;
  c = c.replace(
    /encodeURIComponent\((`[^`]*\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645[^`]*`|"[^"]*\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645[^"]*")\)/g,
    'encodeWhatsappText($1)'
  );
  c = c.replace(
    /encodeURIComponent\((message|msg|txt|text|encodedMessage)\)/g,
    (m, v) => {
      const ctx = c.slice(Math.max(0, c.indexOf(m) - 280), c.indexOf(m) + 120);
      if (/whatsapp|wa\.me|api\.whatsapp/i.test(ctx)) {
        return `encodeWhatsappText(${v})`;
      }
      return m;
    }
  );

  if (c === orig) continue;

  if (!c.includes('encodeWhatsappText')) {
    const m = c.match(/^import .+;\r?\n/m);
    if (m) {
      c = c.replace(m[0], m[0] + importLine + '\n');
    }
  } else if (!c.includes(importLine)) {
    const idx = c.indexOf('import ');
    const lineEnd = c.indexOf('\n', idx);
    c = c.slice(0, lineEnd + 1) + importLine + '\n' + c.slice(lineEnd + 1);
  }

  fs.writeFileSync(f, c);
  updated++;
  console.log(path.relative(root, f));
}
console.log('updated', updated);

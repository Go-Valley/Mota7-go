const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const bad = /^import \{\r?\nimport \{ encodeWhatsappText \} from 'src\/app\/core\/utils\/whatsapp-open\.util';\r?\n/;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

let n = 0;
for (const f of walk(root)) {
  let c = fs.readFileSync(f, 'utf8');
  if (!bad.test(c)) continue;
  c = c.replace(
    bad,
    "import { encodeWhatsappText } from 'src/app/core/utils/whatsapp-open.util';\nimport {\n"
  );
  fs.writeFileSync(f, c);
  n++;
  console.log(path.relative(root, f));
}
console.log('fixed', n);

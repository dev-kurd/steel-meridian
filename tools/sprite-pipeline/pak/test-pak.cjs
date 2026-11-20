// Checks every packed file decrypts to exactly the original bytes, patch override, and tamper detection.
const fs = require('fs'), path = require('path');
const { PakLibrary } = require('./pak-reader.cjs');
const { SECRET } = require('./pak-secret.cjs');
const lib = new PakLibrary(SECRET).openFolder('dist/pak');
let ok = 0, bad = 0;
for (const f of fs.readdirSync('dist/atlas')) {
  const r = lib.read(f), orig = fs.readFileSync(path.join('dist/atlas', f));
  if (r && r.data.equals(orig)) ok++; else { bad++; console.log('MISMATCH', f); }
}
console.log(`byte-identical: ${ok}, mismatched: ${bad}, packs: ${lib.packs.map((p) => p.name).join(', ')}`);
// a wrong secret must not open the packs
try { new PakLibrary('wrong').open('dist/pak/units.pak'); console.log('wrong key: OPENED (bad)'); } catch { console.log('wrong key: refused (good)'); }
// a changed byte must be detected
fs.mkdirSync('/tmp/tamper', { recursive: true }); const copy = '/tmp/tamper/units.pak'; const b = fs.readFileSync('dist/pak/units.pak'); b[b.length - 100] ^= 0xff; fs.writeFileSync(copy, b);
const t = new PakLibrary(SECRET); t.open(copy); const last = t.list().map((n) => [n, t.packs[0].entries[n].offset]).sort((a, b) => b[1] - a[1])[0][0];
try { t.read(last); console.log('tampered file: READ (bad)'); } catch { console.log('tampered file: refused (good)'); }
lib.close(); t.close();

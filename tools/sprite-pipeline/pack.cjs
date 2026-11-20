#!/usr/bin/env node
/* Pack the baked assets into encrypted .pak files for the desktop build (format: pak/pak-format.md).
 *
 *   node pack.cjs                         → dist/pak/units.pak, buildings.pak, fx.pak, core.pak
 *   node pack.cjs --patch 1 a.webp b.json → dist/pak/patch_001.pak with just those files (overrides older packs)
 *   node pack.cjs --from <dir> --patch 1 …  → take the patch files from another folder
 *
 * Every size (@1x @2x @4x) and each sheet's .json go into the same pack as its image.
 * The web build keeps the loose files in dist/atlas; nothing here changes them.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { packKey, MAGIC, HEADER } = require('./pak/pak-reader.cjs');
const { SECRET } = require('./pak/pak-secret.cjs');

const argv = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SRC = argv('from', 'dist/atlas'), OUT = 'dist/pak';
const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

// which pack each file goes into (first match wins)
const PACKS = [
  { name: 'units', test: (f) => f.startsWith('tank') },
  { name: 'buildings', test: (f) => f.startsWith('buildings') },
  { name: 'fx', test: (f) => f.startsWith('fx') },
  { name: 'core', test: (f) => f === 'manifest.json' },
];

function encrypt(key, data) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = Buffer.concat([c.update(data), c.final()]);
  return { iv, tag: c.getAuthTag(), out };
}

function writePak(name, files) {
  const key = packKey(name, SECRET);
  // encrypt every file on its own first, so the index can record offsets and auth tags
  const blobs = files.map((f) => {
    const data = fs.readFileSync(path.join(SRC, f)), e = encrypt(key, data);
    return { f, e, plain: data.length, type: TYPES[path.extname(f)] || 'application/octet-stream' };
  });
  // the index's own length shifts the data offsets: build it once to measure, once for real
  const build = (dataStart) => {
    let off = dataStart; const entries = {};
    for (const b of blobs) { entries[b.f] = { offset: off, size: b.e.out.length, iv: b.e.iv.toString('base64'), tag: b.e.tag.toString('base64'), type: b.type }; off += b.e.out.length; }
    return Buffer.from(JSON.stringify({ pack: name, created: new Date().toISOString(), entries }));
  };
  let indexPlain = build(0), ix = encrypt(key, indexPlain);
  for (let i = 0; i < 3; i++) { indexPlain = build(HEADER + ix.out.length); ix = encrypt(key, indexPlain); } // offsets settle (fixed-width enough)
  const head = Buffer.alloc(HEADER);
  MAGIC.copy(head, 0); head.writeUInt32LE(1, 8); head.writeUInt32LE(ix.out.length, 12); ix.iv.copy(head, 16); ix.tag.copy(head, 28);
  // verify offsets line up with the final index length
  const first = blobs.length ? JSON.parse(indexPlain).entries[blobs[0].f].offset : 0;
  if (blobs.length && first !== HEADER + ix.out.length) throw new Error('index offset mismatch');
  const out = path.join(OUT, `${name}.pak`);
  fs.writeFileSync(out, Buffer.concat([head, ix.out, ...blobs.map((b) => b.e.out)]));
  const kb = Math.round(fs.statSync(out).size / 1024), plainKb = Math.round(blobs.reduce((a, b) => a + b.plain, 0) / 1024);
  console.log(`  ${(name + '.pak').padEnd(16)} ${String(files.length).padStart(3)} files  ${String(kb).padStart(6)} KB  (files ${plainKb} KB + index ${(ix.out.length / 1024).toFixed(1)} KB)`);
}

fs.mkdirSync(OUT, { recursive: true });
const pi = process.argv.indexOf('--patch');
if (pi > 0) {
  const n = String(Number(process.argv[pi + 1])).padStart(3, '0'), files = process.argv.slice(pi + 2).filter((f) => !f.startsWith('--') && f !== SRC);
  writePak(`patch_${n}`, files);
} else {
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.pak')) fs.unlinkSync(path.join(OUT, f));
  const all = fs.readdirSync(SRC).sort(), used = new Set();
  for (const p of PACKS) { const files = all.filter((f) => !used.has(f) && p.test(f)); files.forEach((f) => used.add(f)); if (files.length) writePak(p.name, files); }
  const left = all.filter((f) => !used.has(f));
  if (left.length) console.warn('  ! not packed (no matching pack):', left.join(', '));
}

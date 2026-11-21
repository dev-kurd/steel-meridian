// pack_mock.cjs - turns the renders of mock_rebake.py into the pictures the mockup page loads.
//   node pack_mock.cjs <render dir> <page asset dir>
// walk/d{dd}.webp: one atlas per direction, the 24 walk phases in a 6 x 4 grid of 384 px frames (order = meta.json "phases").
// damage/{kind}_{old|new}_s{state}.webp: one picture each. WebP, quality 90 (a mockup, not game data).
// Needs "npm install" once in tools/sprite-pipeline (sharp).
const path = require('path'), fs = require('fs');
const sharp = require(path.join(__dirname, '..', '..', '..', '..', 'tools', 'sprite-pipeline', 'node_modules', 'sharp'));
const [src, dst] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(path.join(src, 'meta.json'), 'utf8'));
const COLS = 6, [FW, FH] = meta.frame;
const p2 = n => String(n).padStart(2, '0');
(async () => {
  fs.mkdirSync(path.join(dst, 'walk'), { recursive: true }); fs.mkdirSync(path.join(dst, 'damage'), { recursive: true });
  let total = 0;
  for (const d of meta.walkDirs) {
    const parts = meta.phases.map((k, i) => ({ input: path.join(src, 'walk', `d${p2(d)}_p${p2(k)}.png`), left: (i % COLS) * FW, top: Math.floor(i / COLS) * FH }));
    const out = path.join(dst, 'walk', `d${p2(d)}.webp`);
    await sharp({ create: { width: COLS * FW, height: Math.ceil(meta.phases.length / COLS) * FH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(parts).webp({ quality: 90, alphaQuality: 100 }).toFile(out);
    total += fs.statSync(out).size;
  }
  for (const f of fs.readdirSync(path.join(src, 'damage')).filter(f => f.endsWith('.png'))) {
    const out = path.join(dst, 'damage', f.replace('.png', '.webp'));
    await sharp(path.join(src, 'damage', f)).webp({ quality: 90, alphaQuality: 100 }).toFile(out);
    total += fs.statSync(out).size;
  }
  fs.copyFileSync(path.join(src, 'meta.json'), path.join(dst, 'meta.json'));
  console.log('page assets', (total / 1048576).toFixed(1), 'MB');
})();

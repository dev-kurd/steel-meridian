// render vector tank layers to SVG files: node vec.cjs size type dir tdir S out
globalThis.window = globalThis;
require('./vu.js');
const VU = globalThis.VectorUnit;
const fs = require('fs');
const [size, type, dir, tdir, S, out, team, dmg] = process.argv.slice(2);
const o = { size, type, team: team || '#33d17a', dmg: +(dmg || 0), S: +S };
const res = {};
for (const layer of ['shadow', 'hull', 'turret']) {
  const sp = VU.sprite(Object.assign({}, o, { layer, dir: layer === 'turret' ? +tdir : +dir, frame: 0 }));
  fs.writeFileSync(`${out}_${layer}.svg`, sp.svg); res[layer] = sp.anchor;
}
res.pivot = VU.pivotScreen(size, +dir, +S);
fs.writeFileSync(`${out}.json`, JSON.stringify(res));
console.log(JSON.stringify(res));

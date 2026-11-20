#!/usr/bin/env node
// Build the demo site: dist/site/index.html + dist/site/atlas/* (each sprite sheet stays its own file)
const fs = require('fs'), path = require('path');
const SRC = 'dist/atlas', OUT = 'dist/site';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'atlas'), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
for (const f of fs.readdirSync(SRC)) fs.copyFileSync(path.join(SRC, f), path.join(OUT, 'atlas', f));
const html = fs.readFileSync('src/page.html', 'utf8')
  .replace('__PIXI__', () => fs.readFileSync('node_modules/pixi.js/dist/pixi.min.js', 'utf8'))
  .replace('__PIXI_UNSAFE_EVAL__', () => fs.readFileSync('node_modules/pixi.js/dist/packages/unsafe-eval.min.js', 'utf8'))
  .replace('__VECTOR_UNIT__', () => ['vector-unit', 'chassis', 'panzer', 'unit-models'].map((f) => fs.readFileSync(`src/vector-unit/${f}.js`, 'utf8')).join('\n'))
  .replace('__TEAM_BATCH__', () => fs.readFileSync('src/team-batch.js', 'utf8'))
  .replace('__VECTOR_MINI__', () => fs.readFileSync('src/vector-mini.js', 'utf8'))
  .replace('__MANIFEST__', () => JSON.stringify(manifest));
fs.writeFileSync(path.join(OUT, 'index.html'), html);
const files = fs.readdirSync(path.join(OUT, 'atlas'));
console.log(`wrote ${OUT}/index.html (${Math.round(html.length / 1024)} KB) + ${files.length} files in ${OUT}/atlas/`);

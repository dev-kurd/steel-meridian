// Copies the latest game page (../dist/site/index.html, made by `npm run site` in the main folder)
// into desktop/game/, the folder the Tauri app shows. If it was not rebuilt, the existing copy is kept.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'dist', 'site', 'index.html'), dst = path.join(__dirname, 'game', 'index.html');
fs.mkdirSync(path.dirname(dst), { recursive: true });
if (fs.existsSync(src)) { fs.copyFileSync(src, dst); console.log('game page updated from dist/site/index.html'); }
else if (fs.existsSync(dst)) console.log('using the existing desktop/game/index.html (run "npm run site" in the main folder to rebuild it)');
else { console.error('No game page: run "npm run build" in the main folder first.'); process.exit(1); }
const paks = path.join(__dirname, '..', 'dist', 'pak');
if (!fs.existsSync(paks) || !fs.readdirSync(paks).some((f) => f.endsWith('.pak'))) { console.error('No .pak files in dist/pak: run "npm run pack" in the main folder first.'); process.exit(1); }

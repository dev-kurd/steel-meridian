#!/usr/bin/env node
// Serves docs/tanks on http://localhost:8765 so the demo page can read the packed sheets in ../source/sheets.
// usage: node serve.cjs [port]
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), PORT = +(process.argv[2] || process.env.PORT || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') { res.writeHead(302, { Location: '/demo/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  // The game's own sound recordings (repo root /sounds) are served too: the demo plays them for the weapons that have one.
  // They go out as /snd/<name> (no ".wav" in the address, sent as plain data): a download manager such as IDM takes over
  // every .wav or audio/* request, and the page then gets no recording at all (2026-11-22).
  const snd = /^\/snd\/[\w-]+$/.test(rel);
  if (snd) rel = '/sounds/' + rel.slice(5) + '.wav';
  const root = rel.startsWith('/sounds/') ? path.resolve(ROOT, '..', '..') : ROOT, file = path.join(root, rel);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found: ' + rel); }
    res.writeHead(200, { 'Content-Type': snd ? 'application/octet-stream' : TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('Tank demo: http://localhost:' + PORT + '/demo/'));

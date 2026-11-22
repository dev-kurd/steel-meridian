#!/usr/bin/env node
// Serves the unified demo on http://localhost:8765/demo/. Only what the page needs is handed out:
//   /demo/...                     this folder
//   /tanks/source/sheets/...      the packed tank sheets and the fx sheet
//   /walkers/source/sheets/...    the packed walker sheets
//   /snd/<name>                   the game's recordings, repo root sounds/<name>.wav
// usage: node serve.cjs [port]
const http = require('http'), fs = require('fs'), path = require('path');
const DOCS = path.resolve(__dirname, '..'), SOUNDS = path.resolve(DOCS, '..', 'sounds'), PORT = +(process.argv[2] || process.env.PORT || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const OPEN = ['/demo/', '/tanks/source/sheets/', '/walkers/source/sheets/'];      // a new part's sheets folder is added here
http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end('Bad address'); }
  if (rel === '/') { res.writeHead(302, { Location: '/demo/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  // The recordings go out as /snd/<name> (no ".wav" in the address, sent as plain data): a download manager such as IDM takes
  // over every .wav or audio/* request, and the page then gets no recording at all (2026-11-22).
  const snd = /^\/snd\/[\w-]+$/.test(rel);
  if (!snd && !OPEN.some((p) => rel.startsWith(p))) { res.writeHead(404); return res.end('Not found: ' + rel); }
  const root = snd ? SOUNDS : DOCS, file = snd ? path.join(SOUNDS, rel.slice(5) + '.wav') : path.join(DOCS, rel);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found: ' + rel); }
    res.writeHead(200, { 'Content-Type': snd ? 'application/octet-stream' : TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('Steel Meridian demo: http://localhost:' + PORT + '/demo/'));

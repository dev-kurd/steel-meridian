#!/usr/bin/env node
// Serves the walker re-bake mockup on http://localhost:8766: the page (rebake_mockup.html, next to this file) and its
// pictures from ../bake_mockup/page (made by mock_rebake.py, then pack_mock.cjs).   usage: node serve.cjs [port]
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', 'bake_mockup', 'page'), PORT = +(process.argv[2] || 8766);
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp' };
http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = rel === '/' ? path.join(__dirname, 'rebake_mockup.html') : path.join(ROOT, rel);
  if (rel !== '/' && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found: ' + rel); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('Walker mockup: http://localhost:' + PORT + '/'));

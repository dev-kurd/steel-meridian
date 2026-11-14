// Prints docs/report/asset-report.html to a PDF with headless Microsoft Edge.
// The page draws its pictures with a hidden copy of the game, so the dev server must be running:
//   npx http-server SteelMeridian -p 8377      then      node tools/build-report.js
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const URL_ = process.argv[2] || 'http://localhost:8377/docs/report/asset-report.html', OUT = path.join(__dirname, '..', 'docs', 'report', 'Steel-Meridian-Asset-Report.pdf');
const PORT = 9300 + Math.floor(Math.random() * 600), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-report-')), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--window-size=1400,1000', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  try {
    let tab; for (let i = 0; i < 50 && !tab; i++) { await sleep(200); try { tab = (await (await fetch('http://127.0.0.1:' + PORT + '/json')).json()).find(t => t.type === 'page'); } catch (e) { } }
    if (!tab) throw new Error('Edge did not start');
    const ws = new WebSocket(tab.webSocketDebuggerUrl), wait = {}; let id = 0;
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } };
    const send = (method, params) => new Promise((r, j) => { const n = ++id; wait[n] = d => d.error ? j(new Error(method + ': ' + d.error.message)) : r(d.result); ws.send(JSON.stringify({ id: n, method, params: params || {} })); });
    await send('Page.enable'); await send('Page.navigate', { url: URL_ });
    let ready = false; for (let i = 0; i < 240 && !ready; i++) { await sleep(500); ready = (await send('Runtime.evaluate', { expression: 'document.body && document.body.dataset.ready === "1" && [...document.images].every(i => i.complete)', returnByValue: true })).result.value === true; }
    if (!ready) throw new Error('the page never finished drawing its pictures');
    await sleep(800);
    const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
    fs.writeFileSync(OUT, Buffer.from(pdf.data, 'base64')); console.log('Written:', OUT, Math.round(fs.statSync(OUT).size / 1024) + ' KB');
    ws.close();
  } finally { try { require('child_process').execSync('taskkill /F /T /PID ' + edge.pid, { stdio: 'ignore' }); } catch (e) { edge.kill(); } await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { } }
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });

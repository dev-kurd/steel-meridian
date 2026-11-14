(() => {
'use strict';
/* Steel Meridian — an original fixed-base RTS. All art is loaded from the assets folder. */

const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d');
const TILE = 32, CAP = 30, TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rnd = Math.random;
const angd = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turn = (a, b, m) => { const d = angd(a, b); return a + clamp(d, -m, m); };

/* ---------- languages ---------- */
// lang.js holds the dictionaries, keyed by the English text. {0}, {1} are filled in; "§note" after a key only tells two uses apart.
const LANGS = window.SM_LANG || {};
let LANG = 'en'; try { const c = JSON.parse(localStorage.getItem('sm_cfg')); if (c && LANGS[c.lang]) LANG = c.lang; } catch (e) {}
function tr(s, ...a) {
  if (typeof s !== 'string') return s;
  const d = LANGS[LANG]; let o = d && d[s] !== undefined ? d[s] : s; const i = o.indexOf('§'); if (i >= 0) o = o.slice(0, i);
  return a.length ? o.replace(/\{(\d)\}/g, (m, n) => a[n] !== undefined ? a[n] : m) : o;
}
// turns text fields of a data table into live lookups, so every place that reads .name or .desc follows the language
function trProps(o, fields) { for (const f of fields) if (typeof o[f] === 'string') { const src = o[f]; Object.defineProperty(o, f, { get: () => tr(src), enumerable: true, configurable: true }); } }

const TEAMC = [
  { c: '#42a5ff', d: '#1d5c9c', l: '#b5dcff', n: 'Azure' },
  { c: '#ff5d4a', d: '#9c2a1d', l: '#ffc0b6', n: 'Crimson' },
  { c: '#f0a030', d: '#8a5a10', l: '#ffe2a8', n: 'Amber' },
  { c: '#a56bff', d: '#5a2fa8', l: '#dccbff', n: 'Violet' }
];
const NEUT = { c: '#9aa0a6', d: '#565c62', l: '#d0d4d8', n: 'Neutral' };

const UT = {
  gun: { name: 'Kestrel', desc: 'Gunship. Flies over any terrain.', air: true, hp: 130, spd: 115, range: 140, dmg: 9, rof: .28, cost: 200, time: 16, r: 12, sight: 9, kind: 'bullet' },
  jet: { name: 'Swift', desc: 'Jet fighter. Very fast; missiles hit air and ground, with double damage to aircraft.', air: true, jetp: true, hp: 150, spd: 200, range: 190, dmg: 24, rof: 1.1, cost: 0, time: 15, r: 12, sight: 10, kind: 'missile', airMul: 2, tier: 1 },
  bomber: { name: 'Anvil', desc: 'Bomber. Slow and tough; heavy bombs wreck ground units and structures. Cannot hit aircraft.', air: true, jetp: true, hp: 320, spd: 92, range: 115, dmg: 80, rof: 3, cost: 0, time: 24, r: 16, sight: 9, kind: 'arty', splash: 46, bmul: 1.6, tier: 2 },
  fighter: { name: 'Falcon', desc: 'Sortie fighter. Returns to the Airfield after about 25 seconds.', air: true, temp: true, hp: 170, spd: 240, range: 165, dmg: 15, rof: .22, cost: 0, time: 0, r: 13, sight: 8, kind: 'bullet' },
  eng: { name: 'Engineer', desc: 'Unarmed. Repairs friendly units and structures nearby and captures three times faster.', hp: 150, spd: 72, range: 0, dmg: 0, rof: 1, cost: 0, time: 9, r: 11, sight: 7, kind: 'none', unarmed: true, wheeled: true },
  bot: { name: 'Sentinel', desc: 'Combat robot. Quick on its feet; attacks ground targets.', hp: 150, spd: 74, range: 135, dmg: 12, rof: .42, cost: 0, time: 7, r: 9, sight: 7, kind: 'bullet', noAir: true, bot: true },
  botaa: { name: 'Warden', desc: 'Air-defence robot. Hits aircraft only.', hp: 140, spd: 74, range: 240, dmg: 15, rof: .3, cost: 0, time: 9, r: 9, sight: 9, kind: 'flak', airOnly: true, bot: true, tier: 1 },
  botl: { name: 'Arc', desc: 'Laser robot. Heavy damage to both ground and air targets.', hp: 230, spd: 60, range: 200, dmg: 48, rof: 1.2, cost: 0, time: 18, r: 10, sight: 9, kind: 'laser', bot: true, tier: 2 },
  adv: { name: 'Vanguard', desc: 'Command craft based on your Command Core. Sitting over a structure it captures it if it is neutral or knocked out, or repairs it if it is yours. Its rockets do five times damage to enemy structures. Being hit stops its work for 3 seconds. If it is shot down, a new one is ready at the Core after 30 seconds.', air: true, hero: true, hp: 600, spd: 105, range: 120, dmg: 24, rof: 2, cost: 0, time: 0, r: 21, sight: 9, kind: 'missile', noAir: true, bmul: 5, demo: true },
  truck: { name: 'Supply Truck', desc: 'Convoy vehicle. Unarmed; it follows its own route.', hp: 460, spd: 34, range: 0, dmg: 0, rof: 1, cost: 0, time: 0, r: 12, sight: 6, kind: 'none', unarmed: true, wheeled: true, convoy: true }
};
// Tanks: five roles, each in three weight classes. A heavier class is tougher and hits harder but is slower and takes longer to build.
const ROLES = {
  bt: { name: 'Lancer', desc: 'Battle tank. A turret gun for fighting other vehicles.', hp: 190, spd: 70, range: 150, dmg: 22, rof: 1.1, time: 9, sight: 7, kind: 'shell' },
  ar: { name: 'Bastion', desc: 'Artillery. Long range area fire: strong against turrets and structures, weak against fast units.', hp: 150, spd: 52, range: 235, dmg: 44, rof: 2.9, time: 12, sight: 8, kind: 'arty', splash: 36, bmul: 1.8 },
  ad: { name: 'Skyguard', desc: 'Air defence. Hits aircraft only.', hp: 150, spd: 74, range: 250, dmg: 14, rof: .26, time: 9, sight: 9, kind: 'flak', airOnly: true },
  fl: { name: 'Scorcher', desc: 'Flame tank. Short range; burns everything in a small area. Ground targets only.', hp: 200, spd: 66, range: 86, dmg: 6, rof: .14, time: 10, sight: 7, kind: 'flame', splash: 22, noAir: true },
  en: { name: 'Prism', desc: 'Energy tank. An instant, accurate beam with long range. Ground targets only.', hp: 170, spd: 60, range: 195, dmg: 40, rof: 1.7, time: 13, sight: 9, kind: 'laser', noAir: true }
};
const CLSN = ['Light', 'Medium', 'Heavy'], TANKS = [];
for (const r in ROLES) for (let c = 0; c < 3; c++) {
  const R = ROLES[r], k = r + c; TANKS.push(k);
  UT[k] = Object.assign({}, R, { name: CLSN[c] + ' ' + R.name, tank: true, role: r, cls: c, tier: c, cost: 0, r: [11, 13, 16][c],
    hp: Math.round(R.hp * [1, 1.7, 2.9][c]), dmg: Math.round(R.dmg * [1, 1.6, 2.5][c] * 10) / 10, spd: Math.round(R.spd * [1, .8, .62][c]), range: Math.round(R.range * [1, 1.08, 1.16][c]), time: Math.round(R.time * [1, 1.6, 2.4][c]) });
  if (R.splash) UT[k].splash = R.splash + c * 5;
  if (r === 'bt' && c === 2) UT[k].bmul = 1.3;
}
// A tank factory is Light, Medium or Heavy (the highest class its lines can reach) and has one to three production lines,
// each fixed to one tank role. The map decides both. The first line runs from the start; the others are unlocked with
// credits, and a line is raised to the next class with research points. Every unlocked line builds at the same time.
const FTN = ['Light Factory', 'Medium Factory', 'Heavy Factory'], LINE_UNLOCK = [0, 300, 500], LINE_RP = [0, 40, 90], LINE_SHARE = [1, 1, .7, .55];
const FAC_HOME = { ft: 2, lines: ['bt', 'ad', 'ar'] }; // beside every Command Core: battle tanks first, air defence always within reach
const FAC_PATS = [{ ft: 1, lines: ['fl', 'en'] }, { ft: 0, lines: ['bt', 'fl', 'ad'] }, { ft: 2, lines: ['ar', 'en', 'bt'] }, { ft: 1, lines: ['en', 'ad'] }, { ft: 0, lines: ['ar', 'bt'] }];
function setLines(b, p) { b.ft = p.ft; b.lines = p.lines.map((role, i) => ({ role, open: i === 0, on: true, lvl: 0, pt: 0, paid: false, k: null })); b.prod = null; b.engQ = 0; }
function resetLines(b) { if (b.lines) for (const l of b.lines) { l.paid = false; l.pt = 0; } }
// Factories the map did not describe get a layout from where they stand: the one nearest each Core is that army's home
// factory; the rest are dealt out by distance from the nearest Core, so mirrored factories always match.
function setupFactories() {
  const facs = G.blds.filter(b => b.k === 'factory' && !b.lines), hqs = G.blds.filter(b => b.k === 'hq'), near = b => hqs.reduce((m, q) => Math.min(m, dist(b, q)), 1e9), home = new Set();
  for (const q of hqs) { let best = null, bd = 1e9; for (const f of facs) { const d = dist(f, q); if (d < bd && !home.has(f)) { bd = d; best = f; } } if (best) home.add(best); }
  let g = -1, last = -1e9;
  for (const f of facs.filter(f => !home.has(f)).sort((a, b) => near(a) - near(b))) { const d = near(f); if (d - last > 40) g++; last = d; setLines(f, FAC_PATS[g % FAC_PATS.length]); }
  for (const f of home) setLines(f, FAC_HOME);
}
const LINE_TIME = 5; // seconds to unlock a line or raise it a class
function lineCls(b, ln) { return Math.min(ln.lvl, b.lvl || 0); } // a line builds no heavier than the factory's own level allows
function lineOpen(b, i) { const tm = G.teams[b.team], ln = b.lines && b.lines[i]; if (!ln || b.up || b.hp <= 0 || ln.open || (i > 0 && !b.lines[i - 1].open) || tm.credits < LINE_UNLOCK[i]) return false; tm.credits -= LINE_UNLOCK[i]; b.up = { kind: 'line', i, t: 0, dur: LINE_TIME }; return true; }
function lineUp(b, i) { const tm = G.teams[b.team], ln = b.lines && b.lines[i]; if (!ln || b.up || b.hp <= 0 || !ln.open || ln.lvl >= (b.lvl || 0) || (tm.rp || 0) < LINE_RP[ln.lvl + 1]) return false; tm.rp -= LINE_RP[ln.lvl + 1]; b.up = { kind: 'lineup', i, t: 0, dur: LINE_TIME }; return true; }
function aiFactory(b, tm) {
  if (!b.lines || b.up) return;
  if ((b.lvl || 0) < b.ft && !tm.saving && tm.credits >= lvlCost(b) + 250 && b.lines.some(l => l.open && l.lvl >= (b.lvl || 0))) { upgradeBld(b); return; }
  for (let i = 0; i < b.lines.length; i++) { const ln = b.lines[i]; ln.on = true;
    if (!ln.open) { if (!tm.saving && tm.credits >= LINE_UNLOCK[i] + 250) lineOpen(b, i); break; }
    if (ln.lvl < (b.lvl || 0) && (tm.rp || 0) >= LINE_RP[ln.lvl + 1]) { lineUp(b, i); break; } }
  if (!b.engQ && rnd() < .03) b.engQ = 1;
}
const TT = {
  gun: { name: 'Gun Turret', desc: 'Rapid fire. Hits ground and air.', hp: 420, range: 195, dmg: 13, rof: .35, cost: 150, kind: 'bullet' },
  cannon: { name: 'Cannon', desc: 'Heavy shells. Ground targets only.', hp: 650, range: 215, dmg: 70, rof: 1.6, cost: 220, kind: 'shell', noAir: true },
  flak: { name: 'Flak Battery', desc: 'Air defence. Aircraft only.', hp: 400, range: 300, dmg: 20, rof: .22, cost: 180, kind: 'flak', airOnly: true },
  missile: { name: 'Missile Turret', desc: 'Long range. Double damage to aircraft.', hp: 360, range: 290, dmg: 48, rof: 1.9, cost: 250, kind: 'missile', airMul: 2 },
  rocket: { name: 'Rocket Battery', desc: 'Fires a salvo of four rockets that blankets an area. Ground targets only.', hp: 390, range: 340, minRange: 70, dmg: 26, rof: 3.8, cost: 300, kind: 'missile', splash: 36, noAir: true, salvo: 4 },
  arty: { name: 'Artillery', desc: 'Very long range area fire. Ground only, cannot hit close targets.', hp: 380, range: 430, minRange: 120, dmg: 85, rof: 3.4, cost: 320, kind: 'arty', splash: 46, noAir: true }
};
const HQW = { range: 230, dmg: 22, rof: .45, kind: 'bullet' };
const BT = {
  hq: { name: 'Command Core', hp: 3600, r: 46, income: 6, sight: 10 },
  factory: { name: 'Tank Factory', hp: 950, r: 38, makes: [], sight: 7 },
  airpad: { name: 'Sky Dock', hp: 750, r: 34, makes: ['gun', 'jet', 'bomber'], sight: 7 },
  refinery: { name: 'Refinery', hp: 750, r: 32, income: 5, sight: 6 },
  pad: { name: 'Turret Pad', hp: 1, r: 18, sight: 7 },
  mine: { name: 'Ore Mine', hp: 650, r: 34, income: 9, sight: 6 },
  tech: { name: 'Tech Lab', hp: 700, r: 32, sight: 7 },
  foundry: { name: 'Foundry', hp: 850, r: 36, sight: 6 },
  airfield: { name: 'Airfield', hp: 800, r: 38, sight: 7 },
  laser: { name: 'Laser Array', hp: 700, r: 30, sight: 8 },
  robot: { name: 'Robot Works', hp: 900, r: 36, makes: ['bot', 'botaa', 'botl'], sight: 7 },
  outpost: { name: 'Allied Outpost', hp: 3200, r: 34, sight: 8 }
};
const PW = {
  strike: { name: 'Air Strike', key: 'Q', cost: 200, cd: 45 },
  repair: { name: 'Field Repair', key: 'E', cost: 150, cd: 40 },
  sortie: { name: 'Fighter Sortie', key: 'R', cost: 250, cd: 60, need: 'airfield' },
  laser: { name: 'Laser Strike', key: 'T', cost: 300, cd: 75, need: 'laser' }
};
const DIFF = {
  easy: { inc: .7, wave: 12, think: 2.5, first: 240, gap: 60, w0: 5, wi: 2 },
  normal: { inc: .9, wave: 10, think: 1.6, first: 170, gap: 45, w0: 7, wi: 3 },
  hard: { inc: 1.2, wave: 9, think: 1.1, first: 110, gap: 32, w0: 10, wi: 4 }
};
// Sites: [type, tileX, tileY, owner(-1 neutral), prebuiltTurret]. "half" is mirrored through the centre for the opponent.
const MAPS = [
  { name: 'Twin Fords', desc: 'A compact duel across a river valley. Good first battle.', w: 80, h: 56, seed: 7, scale: 9, water: .37, rock: .66,
    half: [['hq', 8, 28, 0], ['factory', 15, 21, 0], ['refinery', 7, 18, 0], ['pad', 17, 29, 0, 'gun'], ['pad', 12, 36, 0],
      ['refinery', 27, 9, -1], ['factory', 30, 43, -1], ['pad', 33, 25, -1], ['airpad', 20, 48, -1], ['tech', 36, 12, -1], ['foundry', 24, 33, -1]],
    center: [['mine', 40, 28, -1]] },
  { name: 'Shattered Coast', weather: 'rain', desc: 'Islands joined by causeways, under a storm. Sky Docks matter here.', w: 96, h: 64, seed: 23, scale: 10, water: .44, rock: .7,
    half: [['hq', 9, 32, 0], ['factory', 16, 25, 0], ['refinery', 8, 22, 0], ['pad', 18, 34, 0, 'gun'], ['pad', 12, 41, 0],
      ['airpad', 21, 13, -1], ['refinery', 30, 51, -1], ['factory', 35, 20, -1], ['pad', 39, 39, -1], ['refinery', 27, 37, -1], ['mine', 42, 52, -1], ['tech', 44, 10, -1], ['foundry', 22, 46, -1]],
    center: [['airpad', 48, 32, -1]] },
  { name: 'Iron Ridge', weather: 'dust', desc: 'A wide, rocky front in a dust wind, with many structures to fight over.', w: 112, h: 72, seed: 41, scale: 11, water: .34, rock: .61,
    half: [['hq', 10, 36, 0], ['factory', 18, 28, 0], ['refinery', 9, 26, 0], ['pad', 20, 38, 0, 'gun'], ['pad', 14, 46, 0],
      ['airpad', 13, 58, -1], ['refinery', 30, 12, -1], ['factory', 37, 49, -1], ['refinery', 41, 30, -1], ['pad', 47, 41, -1], ['pad', 34, 22, -1], ['factory', 50, 10, -1], ['tech', 46, 58, -1], ['foundry', 28, 42, -1]],
    center: [['mine', 56, 36, -1]] },
  { name: 'Anbar Flats', desc: 'Open desert with long sight lines and few places to hide.', w: 104, h: 64, seed: 57, scale: 12, water: .3, rock: .7,
    half: [['hq', 9, 32, 0], ['factory', 17, 24, 0], ['refinery', 8, 21, 0], ['pad', 19, 34, 0, 'gun'], ['pad', 13, 42, 0],
      ['refinery', 28, 10, -1], ['factory', 32, 46, -1], ['tech', 40, 14, -1], ['foundry', 26, 36, -1], ['pad', 42, 34, -1], ['airpad', 22, 54, -1], ['mine', 44, 52, -1], ['factory', 46, 24, -1]],
    center: [['mine', 52, 32, -1]] },
  { name: 'Marsh Delta', desc: 'Low islands and reed beds joined by narrow causeways.', w: 100, h: 68, seed: 88, scale: 9, water: .46, rock: .74,
    half: [['hq', 9, 34, 0], ['factory', 16, 26, 0], ['refinery', 8, 23, 0], ['pad', 18, 36, 0, 'gun'], ['pad', 12, 44, 0],
      ['airpad', 20, 12, -1], ['refinery', 30, 54, -1], ['factory', 34, 22, -1], ['pad', 38, 42, -1], ['refinery', 26, 40, -1], ['mine', 42, 57, -1], ['tech', 44, 10, -1], ['foundry', 21, 51, -1]],
    center: [['airpad', 50, 34, -1]] },
  { name: 'High Pass', desc: 'A narrow mountain road between walls of rock.', w: 108, h: 70, seed: 131, scale: 10, water: .3, rock: .58,
    half: [['hq', 10, 35, 0], ['factory', 18, 27, 0], ['refinery', 9, 25, 0], ['pad', 20, 37, 0, 'gun'], ['pad', 14, 45, 0],
      ['airpad', 13, 57, -1], ['refinery', 30, 12, -1], ['factory', 36, 48, -1], ['refinery', 40, 30, -1], ['pad', 46, 40, -1], ['pad', 34, 21, -1], ['tech', 48, 58, -1], ['foundry', 27, 41, -1], ['factory', 48, 12, -1]],
    center: [['mine', 54, 35, -1]] }
];
[[22, 16], [27, 27], [27, 32], [30, 24], [27, 30], [27, 31]].forEach((p, i) => MAPS[i].half.push(['robot', p[0], p[1], -1])); // a neutral Robot Works near each base on every map (the later maps share these layouts)
// Shaped ground on three of the first six, then nine more battlefields built on the same site layouts with their own seed and features.
MAPS[0].feat = [['river', 40, 0, 40, 20, 2.2]];                                  // a river down the middle with one wide ford
MAPS[2].feat = [['wall', 36, 2, 36, 30, 2.2], ['wall', 36, 42, 36, 70, 2.2]];    // a rock wall in front of each base with a single gate
MAPS[5].feat = [['wall', 54, 0, 54, 25, 3.2]];                                   // the pass: rock closes the centre except for the middle
for (const [base, name, seed, feat, extra] of [
  [2, 'Serpent Road', 52, [['wall', 30, 0, 30, 40, 2.5], ['wall', 46, 30, 46, 72, 2.5]]],
  [5, 'Crown Ridge', 77, [['wall', 42, 22, 54, 22, 2], ['wall', 42, 22, 42, 31, 2]]],
  [2, 'Fortress Ridge', 95, [['wall', 28, 10, 28, 62, 2.4], ['rocks', 40, 36, 5]]],
  [0, 'Dry Wadi', 19, [['river', 22, 0, 38, 28, 2], ['rocks', 30, 40, 4]]],
  [0, 'River Bend', 33, [['lake', 30, 20, 6], ['river', 36, 30, 36, 56, 1.8]]],
  [3, 'Foundry Lanes', 64, [['wall', 24, 21, 50, 21, 1.8], ['wall', 24, 43, 50, 43, 1.8]]],
  [1, 'Long Causeway', 29, [['lake', 30, 14, 8], ['lake', 34, 52, 8]], { water: .47 }],
  [4, 'Thousand Isles', 101, [], { water: .5 }],
  [1, 'Black Harbour', 113, [['wall', 26, 8, 26, 56, 2.2], ['lake', 38, 32, 6]]]
]) MAPS.push(Object.assign({}, MAPS[base], { name, seed, feat, desc: '' }, extra || {}));

let G = null, W = 0, H = 0, DPR = 1, uid = 1;
const mouse = { x: 0, y: 0, inside: false };
const keys = {};
let drag = null, pan = null, lastClick = { t: 0, k: null };

/* ---------- utilities ---------- */
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(seed) {
  const r = mulberry32(seed), p = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) p[i] = r();
  const g = (x, y) => p[((x * 73856093) ^ (y * 19349663)) & 4095];
  const s = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi); const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  return (x, y) => (n(x, y) + n(x * 2.1 + 7, y * 2.1 + 3) * .5 + n(x * 4.3 + 1, y * 4.3 + 9) * .25) / 1.75;
}
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
addEventListener('resize', resize); resize();

/* ---------- audio (synthesised score and effects) ---------- */
const SMP = { // g: loudness, v: random pitch spread
  bullet: { f: ['bullet_1.wav', 'bullet_2.wav', 'bullet_3.wav'], g: .5, v: .05 }, flak: { f: ['flak_1.wav', 'flak_2.wav'], g: .6, v: .06 },
  shell: { f: ['shell_1.wav', 'shell_2.wav', 'shell_3.wav'], g: .95, v: .06 }, arty: { f: ['arty_1.wav', 'arty_2.wav'], g: 1, v: .05 },
  boom: { f: ['boom_1.wav', 'boom_2.wav', 'boom_3.wav'], g: .85, v: .08 }, bigboom: { f: ['bigboom_1.wav', 'bigboom_2.wav'], g: 1, v: .05 }, laser: { f: ['laser_1.wav'], g: .7, v: 0 },
  missile: { f: ['missile_1.wav'], g: .7, v: .05 }, jet: { f: ['jet_1.wav'], g: .8, v: 0 }, thunder: { f: ['thunder_1.wav'], g: .9, v: .05 }
};
const AU = { ctx: null, on: true, last: {}, el: null, smp: {}, rec: [], vol: { m: .55, f: .75, v: .9 } };
try { const q = JSON.parse(localStorage.getItem('sm_vol')); if (q && q.m >= 0 && q.f >= 0) AU.vol = q; } catch (e) {}
if (!(AU.vol.v >= 0)) AU.vol.v = .9; // announcer volume, added later: older saved settings do not have it
function setVol(k, v) { AU.vol[k] = v; if (k === 'm') { if (AU.mus) AU.mus.gain.value = v; if (AU.el) AU.el.volume = Math.min(1, v); } else if (k === 'f' && AU.sfx) AU.sfx.gain.value = v; try { localStorage.setItem('sm_vol', JSON.stringify(AU.vol)); } catch (e) {} }
function auInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const a = AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
    AU.master = a.createGain(); AU.master.gain.value = AU.on ? .85 : 0;
    const comp = a.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; AU.master.connect(comp); comp.connect(a.destination);
    AU.sfx = a.createGain(); AU.sfx.gain.value = AU.vol.f; AU.sfx.connect(AU.master);
    AU.mus = a.createGain(); AU.mus.gain.value = AU.vol.m; AU.mus.connect(AU.master);
    const len = a.sampleRate * 2.4 | 0, ir = a.createBuffer(2, len, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
    AU.rev = a.createConvolver(); AU.rev.buffer = ir; const rg = a.createGain(); rg.gain.value = .3; AU.rev.connect(rg); rg.connect(AU.master);
    AU.send = a.createGain(); AU.send.gain.value = .45; AU.send.connect(AU.rev);
    const n = a.sampleRate * 2; AU.noise = a.createBuffer(1, n, a.sampleRate);
    const d = AU.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    const cn = 2048, curve = new Float32Array(cn); for (let i = 0; i < cn; i++) { const q = i / (cn - 1) * 2 - 1; curve[i] = Math.tanh(q * 1.5) / Math.tanh(1.5); } AU.curve = curve;
    // Recorded sounds (see sounds/README.txt). Each name has one or more takes; one is picked at random per shot.
    // Anything missing falls back to the built-in synthesised sound of the same name.
    for (const nm in SMP) for (const f of SMP[nm].f) { const el = new Audio(); el.preload = 'auto'; el.addEventListener('canplaythrough', () => { (AU.smp[nm] = AU.smp[nm] || []).push(el); }, { once: true }); el.addEventListener('error', () => {}); el.src = 'sounds/' + f; }
    AU.echoIn = a.createGain(); // slap-back echoes off the landscape
    for (const [dl, gn, fq] of [[.13, .34, 1700], [.27, .22, 1100], [.46, .13, 700], [.71, .07, 480]]) { const dn = a.createDelay(1), gg = a.createGain(), lq = a.createBiquadFilter(); dn.delayTime.value = dl; gg.gain.value = gn; lq.type = 'lowpass'; lq.frequency.value = fq; AU.echoIn.connect(dn); dn.connect(lq); lq.connect(gg); gg.connect(AU.sfx); }
    startMusic(); engineInit();
  } catch (e) { AU.ctx = null; }
}
function env(g, t, a, d, v) { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(Math.max(.0002, v), t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
function osc(dst, type, f0, f1, t, a, d, v) {
  const c = AU.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
  env(g, t, a, d, v); o.connect(g); g.connect(dst); o.start(t); o.stop(t + a + d + .05);
}
function hiss(dst, ftype, f0, f1, q, t, a, d, v) {
  const c = AU.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = AU.noise; s.loop = true;
  f.type = ftype; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + a + d);
  env(g, t, a, d, v); s.connect(f); f.connect(g); g.connect(dst); s.start(t, rnd() * 1.5); s.stop(t + a + d + .05);
}
const ACK = { scout: [95, 150], tank: [48, 78], heavy: [36, 56], gun: [0, 0] };
const UISND = { ui: 1, deny: 1, cap: 1, ready: 1, build: 1, alert: 1 };
// Weapon and blast sounds are layered from noise the way the real ones are heard: a sharp crack, a body,
// a low thump and a tail, with random variation per shot, driven into soft clipping. Distance dulls and delays them.
function sfx(n, x, y) {
  if (!AU.ctx || !AU.on) return;
  let v = 1, pan = 0, far = 0;
  if (x !== undefined) {
    if (!G || !visAt(x, y)) return;
    const p = w2s(x, y), dx = (p.x - W / 2) / (W / 2), dy = (p.y - H / 2) / (H / 2), dd = Math.hypot(dx, dy);
    v = clamp(1.25 - dd * .55, 0, 1) * clamp(.5 + G.cam.z * .5, .5, 1.2); if (v <= .03) return;
    pan = clamp(dx * .8, -1, 1); far = clamp(dd * .55 + (1 / G.cam.z - .7) * .4, 0, 1);
  }
  const now = performance.now(); if (now - (AU.last[n] || 0) < (n === 'bullet' || n === 'flak' ? 45 : 70)) return; AU.last[n] = now;
  if (!UISND[n]) { // keep big fights from turning into a wall of noise
    AU.rec = AU.rec.filter(q => now - q < 160); const loud = n === 'boom' || n === 'bigboom' || n === 'arty' || n === 'shell';
    if (AU.rec.length >= (loud ? 12 : n === 'bullet' || n === 'flak' ? 4 : 8)) return; AU.rec.push(now);
    if (AU.smp[n] && AU.smp[n].length) { const q = SMP[n], a = AU.smp[n][rnd() * AU.smp[n].length | 0].cloneNode(); a.volume = clamp(v * q.g * AU.vol.f * (1 - far * .45), 0, 1); a.preservesPitch = false; a.playbackRate = (1 + (rnd() - .5) * 2 * q.v) * (1 - far * .06); a.play().catch(() => {}); return; }
  }
  const c = AU.ctx;
  if (UISND[n]) {
    const o = AU.sfx, t = c.currentTime;
    if (n === 'ui') { hiss(o, 'highpass', 3000, 3000, .7, t, .001, .012, .12); osc(o, 'sine', 1300, 900, t, .001, .03, .05); }
    else if (n === 'deny') { osc(o, 'triangle', 150, 105, t, .003, .16, .16); hiss(o, 'lowpass', 500, 300, 1, t, .003, .1, .08); }
    else if (n === 'cap') [523, 659, 784].forEach((f, i) => { osc(o, 'sine', f, f, t + i * .09, .005, .3, .1); osc(o, 'sine', f * 2, f * 2, t + i * .09, .005, .2, .03); });
    else if (n === 'ready') { hiss(o, 'bandpass', 1900, 1900, 5, t, .003, .05, .04); osc(o, 'sine', 880, 1100, t, .003, .09, .05); }
    else if (n === 'build') { hiss(o, 'highpass', 2500, 2500, .7, t, .001, .025, .3); [410, 1130, 1870, 2950].forEach(f => osc(o, 'sine', f, f * .985, t, .001, .35, .05)); osc(o, 'sine', 110, 55, t, .002, .14, .3); hiss(o, 'bandpass', 700, 500, 2, t + .16, .002, .08, .12); }
    else for (let i = 0; i < 4; i++) osc(o, 'sawtooth', i % 2 ? 370 : 494, i % 2 ? 370 : 494, t + i * .16, .01, .13, .07);
    return;
  }
  const t = c.currentTime + far * .07, d = c.createWaveShaper(), lp = c.createBiquadFilter(), o = c.createStereoPanner(), sg = c.createGain(), r = .88 + rnd() * .24;
  d.curve = AU.curve; lp.type = 'lowpass'; lp.frequency.value = 650 + 9000 * (1 - far) * (1 - far); o.pan.value = pan; sg.gain.value = .3 + far * .6;
  d.connect(lp); lp.connect(o); o.connect(AU.sfx); o.connect(sg); sg.connect(AU.send);
  if (n !== 'laser' && n !== 'jet' && n !== 'thunder' && !n.startsWith('ack_')) { const eg = c.createGain(); eg.gain.value = .6; o.connect(eg); eg.connect(AU.echoIn); setTimeout(() => eg.disconnect(), 7000); }
  setTimeout(() => { o.disconnect(); sg.disconnect(); }, 7000);
  const crack = (vol, dur, f) => hiss(d, 'bandpass', (f || 2200) * 1.2, (f || 2200) * .6, .5, t, .0006, dur * 1.4, vol * v * .7);
  const clicks = (num, t0, span, vol) => { for (let i = 0; i < num; i++) hiss(d, 'highpass', 2000 + rnd() * 3000, 2500, .7, t + t0 + rnd() * span, .001, .015 + rnd() * .03, vol * v * (.5 + rnd())); };
  const rumble = (num, t0, span, vol, f) => { for (let i = 0; i < num; i++) hiss(d, 'lowpass', f * (.7 + rnd() * .6), f * .5, .8, t + t0 + rnd() * span, .04, .35 + rnd() * .4, vol * v * (.5 + rnd() * .7)); };
  if (n.startsWith('ack_')) {
    const [e0, e1] = ACK[n.slice(4)] || ACK.tank;
    hiss(d, 'highpass', 3500, 3500, .7, t, .001, .01, .2); hiss(d, 'bandpass', 1700, 2100, 3, t + .015, .004, .11, .1); hiss(d, 'highpass', 3500, 3500, .7, t + .14, .001, .01, .16);
    if (e0) { osc(d, 'sawtooth', e0, e1, t + .05, .1, .6, .16); osc(d, 'square', e0 * 1.5, e1 * 1.5, t + .05, .1, .6, .05); hiss(d, 'lowpass', 260, 420, 1, t + .05, .1, .6, .18); }
    else for (let i = 0; i < 8; i++) hiss(d, 'lowpass', 520, 300, 1, t + .05 + i * .05, .004, .04, .22);
    return;
  }
  switch (n) {
    case 'bullet': // machine gun: a three-round burst, each round a crack, a muzzle blast and a thump
      for (let i = 0; i < 3; i++) {
        const tt = t + i * (.074 + rnd() * .012), q = r * (.95 + rnd() * .1), vv = v * (i ? .82 : 1);
        hiss(d, 'lowpass', 7000 * q, 1400, .6, tt, .0004, .014, 1.3 * vv); hiss(d, 'bandpass', 520 * q, 300, .9, tt, .0008, .05, 1 * vv);
        osc(d, 'sine', 150 * q, 55, tt, .0008, .05, .8 * vv); hiss(d, 'bandpass', 2600, 1800, 5, tt + .03, .001, .03, .05 * vv);
      }
      hiss(d, 'lowpass', 1500, 350, .7, t + .02, .01, .45, .14 * v); break;
    case 'flak': // autocannon: two heavy rounds
      for (let i = 0; i < 2; i++) {
        const tt = t + i * .11, q = r * (.95 + rnd() * .1);
        hiss(d, 'lowpass', 5200 * q, 900, .6, tt, .0005, .02, 1.3 * v); hiss(d, 'bandpass', 340 * q, 180, .9, tt, .001, .09, 1.1 * v); osc(d, 'sine', 112 * q, 40, tt, .001, .11, 1 * v);
      }
      hiss(d, 'lowpass', 1200, 260, .7, t + .02, .01, .6, .18 * v); break;
    case 'shell': // tank main gun: pressure wave, blast, sub-bass, barrel ring, rolling tail, spent case
      hiss(d, 'lowpass', 6000 * r, 700, .6, t, .0005, .03, 1.5 * v); hiss(d, 'bandpass', 300 * r, 120, .8, t, .001, .22, 1.3 * v);
      osc(d, 'sine', 82 * r, 27, t, .001, .6, 1.4 * v); osc(d, 'sine', 164 * r, 50, t, .001, .16, .6 * v);
      hiss(d, 'lowpass', 900, 90, .8, t + .03, .03, 1.3, .5 * v); rumble(4, .1, .7, .2, 220);
      [1730, 2410, 3120].forEach(f => osc(d, 'sine', f * r, f * r * .99, t + .02, .001, .35, .012 * v));
      hiss(d, 'bandpass', 3000, 2200, 7, t + .5 + rnd() * .2, .001, .05, .06 * v); break;
    case 'arty': // heavy gun
      hiss(d, 'lowpass', 5000 * r, 500, .6, t, .0006, .04, 1.6 * v); hiss(d, 'bandpass', 220 * r, 90, .8, t, .001, .35, 1.4 * v);
      osc(d, 'sine', 64 * r, 22, t, .001, .95, 1.6 * v); osc(d, 'sine', 128 * r, 40, t, .001, .22, .7 * v);
      hiss(d, 'lowpass', 700, 70, .8, t + .04, .05, 2.2, .55 * v); rumble(6, .15, 1.2, .24, 190);
      [1310, 1890].forEach(f => osc(d, 'sine', f * r, f * r * .99, t + .02, .001, .5, .012 * v)); break;
    case 'missile': // rocket motor
      hiss(d, 'highpass', 2600, 2600, .7, t, .001, .03, .5 * v); hiss(d, 'bandpass', 340 * r, 2600, 1.1, t, .04, .8, .5 * v); hiss(d, 'lowpass', 600, 240, .8, t, .03, .9, .5 * v); osc(d, 'sawtooth', 70, 130, t, .03, .6, .12 * v); break;
    case 'boom': // vehicle explosion
      crack(1.1, .045, 1300 * r); osc(d, 'sine', 78 * r, 23, t, .001, 1, 1.3 * v); osc(d, 'triangle', 160 * r, 40, t, .001, .25, .6 * v);
      hiss(d, 'lowpass', 1700 * r, 55, .7, t, .002, 1.3, 1 * v); hiss(d, 'lowpass', 260, 70, .8, t + .08, .12, 2, .4 * v); rumble(5, .12, .9, .22, 240);
      clicks(9, .15, 1.1, .1); hiss(d, 'bandpass', 2300 * r, 1500, 7, t + .3 + rnd() * .3, .002, .09, .1 * v); break;
    case 'bigboom': // structure going up
      crack(1.2, .06, 1000 * r); osc(d, 'sine', 58 * r, 18, t, .001, 2.4, 1.5 * v); osc(d, 'sine', 46, 18, t + .34, .005, 1.8, 1 * v); osc(d, 'triangle', 120 * r, 34, t, .001, .4, .7 * v);
      hiss(d, 'lowpass', 1400 * r, 45, .7, t, .003, 2.8, 1.1 * v); hiss(d, 'lowpass', 900, 50, .7, t + .34, .003, 2, .7 * v); hiss(d, 'lowpass', 220, 55, .8, t + .1, .2, 3.4, .5 * v);
      rumble(10, .15, 2.4, .26, 210); clicks(18, .2, 2.6, .1); for (let i = 0; i < 3; i++) hiss(d, 'bandpass', 1800 + rnd() * 900, 1200, 8, t + .5 + rnd() * 1.4, .002, .12, .1 * v); break;
    case 'zap': osc(d, 'sawtooth', 2100, 320, t, .004, .2, .1); osc(d, 'sine', 3000, 700, t, .004, .15, .08); hiss(d, 'highpass', 4000, 4000, .7, t, .002, .06, .06); break;
    case 'burn': hiss(d, 'bandpass', 1000, 420, .7, t, .03, .26, .15); hiss(d, 'lowpass', 300, 160, 1, t, .03, .3, .1); break;
    case 'thunder': hiss(d, 'bandpass', 1400, 500, .6, t, .002, .25, .5); hiss(d, 'lowpass', 500, 50, .8, t + .05, .15, 3.6, .9); osc(d, 'sine', 55, 24, t + .05, .1, 2.6, .8); rumble(9, .2, 2.8, .3, 180); break;
    case 'lasercharge': osc(d, 'sine', 180, 2600, t, .7, .1, .16 * v); osc(d, 'sawtooth', 90, 1300, t, .7, .1, .05 * v); hiss(d, 'bandpass', 800, 5000, 6, t, .7, .1, .1 * v); break;
    case 'laser': {
      const dur = 2.5, am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); am.gain.value = .6; lfo.type = 'square'; lfo.frequency.value = 58; lg.gain.value = .4; lfo.connect(lg); lg.connect(am.gain); am.connect(d); lfo.start(t); lfo.stop(t + dur + .3);
      hiss(d, 'lowpass', 8000, 1500, .6, t, .001, .05, 1.2 * v); osc(d, 'sine', 140, 40, t, .001, .25, .9 * v); // discharge crack
      for (const [f, ty, vol] of [[440, 'sawtooth', .16], [446, 'sawtooth', .16], [1320, 'square', .05], [2637, 'sine', .05]]) osc(am, ty, f, f * .97, t, .03, dur, vol * v);
      osc(d, 'sine', 55, 52, t, .05, dur, .5 * v); hiss(am, 'bandpass', 3400, 2600, 3, t, .03, dur, .3 * v); hiss(d, 'highpass', 6000, 6000, .7, t, .03, dur, .06 * v);
      clicks(26, .05, dur - .1, .08); osc(d, 'sine', 300, 45, t + dur, .005, .4, .5 * v); hiss(d, 'lowpass', 1200, 200, .8, t + dur, .005, .6, .3 * v); break;
    }
    case 'jet': hiss(d, 'bandpass', 600, 2600, 1.5, t, .3, 1.6, .5 * v); hiss(d, 'lowpass', 500, 200, 1, t, .2, 2, .5 * v); osc(d, 'sawtooth', 90, 60, t, .3, 1.6, .08 * v); break;
  }
}
// continuous engine, track and rotor beds that follow what is on screen
function engineInit() {
  const a = AU.ctx, E = AU.eng = {}, loop = () => { const s = a.createBufferSource(); s.buffer = AU.noise; s.loop = true; s.start(); return s; };
  const am = (freq, type, depth) => { const g = a.createGain(), l = a.createOscillator(), lg = a.createGain(); g.gain.value = 1 - depth / 2; l.type = type; l.frequency.value = freq; lg.gain.value = depth / 2; l.connect(lg); lg.connect(g.gain); l.start(); return { g, l }; };
  E.g = a.createGain(); E.g.gain.value = 0; E.g.connect(AU.sfx);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; const m1 = am(10.5, 'sawtooth', .8); E.lfo = m1.l;
  E.o1 = a.createOscillator(); E.o1.type = 'sawtooth'; E.o1.frequency.value = 42; E.o2 = a.createOscillator(); E.o2.type = 'square'; E.o2.frequency.value = 63.4;
  const o2g = a.createGain(); o2g.gain.value = .12; E.o1.connect(lp); E.o2.connect(o2g); o2g.connect(lp);
  const en = a.createBiquadFilter(); en.type = 'lowpass'; en.frequency.value = 180; const eng = a.createGain(); eng.gain.value = .9; loop().connect(en); en.connect(eng); eng.connect(m1.g);
  lp.connect(m1.g); m1.g.connect(E.g); E.o1.start(); E.o2.start();
  E.tg = a.createGain(); E.tg.gain.value = 0; E.tg.connect(AU.sfx);
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = .9; const m2 = am(15, 'square', .9); E.tl = m2.l; loop().connect(bp); bp.connect(m2.g); m2.g.connect(E.tg);
  E.rg = a.createGain(); E.rg.gain.value = 0; E.rg.connect(AU.sfx);
  const rl = a.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 460; const m3 = am(19, 'sawtooth', 1.7); loop().connect(rl); rl.connect(m3.g); m3.g.connect(E.rg);
}
function engineUpdate() {
  const E = AU.eng; if (!E) return; const t = AU.ctx.currentTime; let idle = 0, mov = 0, rot = 0, z = 1;
  if (G && !G.paused && !G.over) {
    z = clamp(G.cam.z, .5, 1.6);
    for (const u of G.units) {
      const moved = u.odo !== u._eo; u._eo = u.odo;
      if (u.dead || !visAt(u.x, u.y)) continue; const p = w2s(u.x, u.y); if (p.x < -120 || p.y < -120 || p.x > W + 120 || p.y > H + 120) continue;
      if (u.T.air) rot += u.T.hero ? .2 : u.T.temp || u.T.jetp ? .4 : 1; else if (moved) mov += [.8, 1, 1.4][u.T.cls || 0]; else idle++;
    }
  }
  const rev = Math.min(1, mov / 4), f = 31 + rev * 15;
  E.g.gain.setTargetAtTime(Math.min(.13, idle * .004 + mov * .03) * z, t, .3); E.o1.frequency.setTargetAtTime(f, t, .4); E.o2.frequency.setTargetAtTime(f * 1.51, t, .4); E.lfo.frequency.setTargetAtTime(10 + rev * 7, t, .4);
  E.tg.gain.setTargetAtTime(Math.min(.05, mov * .012) * z, t, .25); E.tl.frequency.setTargetAtTime(11 + rev * 9, t, .4);
  E.rg.gain.setTargetAtTime(Math.min(.16, rot * .05) * z, t, .3);
}
function startMusic() {
  const a = AU.ctx; let custom = false;
  // optional: a file at music/theme.mp3 replaces the built-in score
  const el = new Audio(); el.loop = true; el.volume = .5;
  el.addEventListener('canplaythrough', () => { if (!custom) { custom = true; AU.el = el; if (AU.on) el.play().catch(() => {}); } });
  el.addEventListener('error', () => {}); el.src = 'music/theme.mp3';
  const delay = a.createDelay(1), fb = a.createGain(); delay.delayTime.value = .47; fb.gain.value = .3; delay.connect(fb); fb.connect(delay); delay.connect(AU.mus);
  const mrev = a.createGain(); mrev.gain.value = .7; mrev.connect(AU.rev);
  const BPM = 96, s16 = 60 / BPM / 4, hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const CH = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]; // Am F Dm E
  const MEL = [[76, 0, 0, 0, 74, 0, 72, 0, 0, 0, 71, 0, 72, 0, 0, 0], [72, 0, 0, 0, 69, 0, 0, 0, 65, 0, 69, 0, 72, 0, 0, 0], [74, 0, 0, 0, 0, 0, 72, 0, 74, 0, 77, 0, 74, 0, 0, 0], [76, 0, 0, 0, 0, 0, 0, 0, 71, 0, 0, 0, 68, 0, 71, 0]];
  const note = (dst, type, m, t, dur, v, cut) => {
    const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter(); o.type = type; o.frequency.value = hz(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(Math.max(120, cut * .35), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(.03, dur * .3)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + .05);
  };
  const kick = (t, v) => { osc(AU.mus, 'sine', 135, 38, t, .002, .2, .55 * v); hiss(AU.mus, 'lowpass', 900, 200, .7, t, .001, .04, .12 * v); };
  const snare = (t, v) => { hiss(AU.mus, 'bandpass', 1900, 1500, .9, t, .001, .13, v); osc(AU.mus, 'triangle', 195, 120, t, .001, .08, v * .6); };
  const hat = (t, v) => hiss(AU.mus, 'highpass', 7500, 7500, .7, t, .001, .035, v);
  let step = 0, next = a.currentTime + .2;
  setInterval(() => {
    if (custom || !AU.on || a.state !== 'running') { next = Math.max(next, a.currentTime + .1); return; }
    while (next < a.currentTime + .25) {
      const bar = step >> 4, s = step & 15, ch = CH[bar % 4], t = next, phrase = (bar >> 2) % 4;
      const battle = !!G && !G.paused && G.t - G.lastCombat < 9;
      if (s === 0) for (const m of ch) for (const dt of [-7, 7]) {
        const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter(), L = s16 * 16; o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = dt;
        f.type = 'lowpass'; f.frequency.value = battle ? 950 : 520; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.045, t + L * .3); g.gain.linearRampToValueAtTime(.0001, t + L * 1.05);
        o.connect(f); f.connect(g); g.connect(AU.mus); g.connect(mrev); o.start(t); o.stop(t + L * 1.1);
      }
      if (s % 2 === 0 && (battle || s % 4 === 0)) note(AU.mus, 'sawtooth', ch[0] - 24 + (s === 6 || s === 14 ? 12 : 0), t, s16 * 1.8, .17, battle ? 720 : 380);
      if (battle) { if (s === 0 || s === 8 || s === 11) kick(t, 1); if (s === 4 || s === 12) snare(t, .2); if (s % 2 === 0) hat(t, s % 4 === 0 ? .05 : .03); if (bar % 4 === 3 && s >= 12) snare(t, .08 + .04 * (s - 12)); }
      else { if (s === 0) kick(t, .5); if (s === 8 && phrase > 0) snare(t, .06); if (s % 4 === 2) hat(t, .02); if (phrase === 3 && bar % 4 === 3 && s >= 8 && s % 2 === 0) snare(t, .03 + .01 * (s - 8)); }
      if (battle || phrase >= 2) { const m = ch[[0, 1, 2, 1][s & 3]] + 12 + ((s >> 2) % 2 ? 12 : 0); if (battle || s % 2 === 0) note(delay, 'triangle', m, t, s16 * .9, battle ? .065 : .035, 2400); }
      if (phrase % 2 === 1 || battle) { const m = MEL[bar % 4][s]; if (m) { note(delay, 'square', m - 12, t, s16 * 3.5, .04, 1500); note(AU.mus, 'sawtooth', m - 12, t, s16 * 3.5, .04, 1100); note(mrev, 'sawtooth', m - 24, t, s16 * 3.5, .03, 700); } }
      step++; next += s16;
    }
  }, 60);
}
// Announcer. Lines are WAV files in sounds/voice; they play one at a time, and the same line is not repeated too soon.
const VO = { el: {}, q: [], busy: false, last: {}, gap: { promoted: 25, nocredits: 6, base_attack: 12, core_attack: 12, van_attack: 25, van_repaired: 10 } };
const VOK = ['start', 'captured', 'lost', 'enemy_capture', 'upgraded', 'core_up', 'research', 'built', 'turret', 'core_attack', 'base_attack', 'promoted', 'strike', 'strike_in', 'sortie', 'laser', 'enemy_laser', 'repair', 'nocredits', 'victory', 'defeat', 'failed', 'van_ready', 'van_lost', 'van_repaired', 'van_attack'];
// English lines are in sounds/voice, Kurdish in sounds/voice/ckb, Arabic in sounds/voice/ar. A missing line falls back to English.
function voLoad() {
  for (const k in VO.el) VO.el[k].pause(); VO.el = {}; VO.q.length = 0; VO.busy = false; const lang = LANG;
  for (const k of VOK) {
    const el = new Audio(); el.preload = 'auto'; let fb = lang === 'en';
    el.addEventListener('canplaythrough', () => { if (LANG === lang) VO.el[k] = el; }, { once: true });
    el.addEventListener('error', () => { if (!fb) { fb = true; el.src = 'sounds/voice/' + k + '.wav?v=6'; } });
    el.addEventListener('ended', () => { VO.busy = false; voNext(); });
    el.src = lang === 'en' ? 'sounds/voice/' + k + '.wav?v=6' : 'sounds/voice/' + lang + '/' + k + '.wav?v=3'; // bump the number when the files change, so browsers do not replay old copies
  }
}
voLoad();
function voNext() {
  if (VO.busy || !VO.q.length) return; const k = VO.q.shift(), el = VO.el[k];
  if (!el || !AU.on) return voNext();
  VO.busy = true; el.currentTime = 0; el.volume = clamp(AU.vol.v, 0, 1); el.play().catch(() => { VO.busy = false; });
  clearTimeout(VO.tm); VO.tm = setTimeout(() => { VO.busy = false; voNext(); }, 6500); // safety net if "ended" never arrives
}
function voice(k, urgent) {
  if (!CFG.voice) return;
  const now = performance.now(); if (!AU.on || (VO.last[k] !== undefined && now - VO.last[k] < (VO.gap[k] || 7) * 1000) || VO.q.includes(k)) return; VO.last[k] = now;
  if (urgent) VO.q.unshift(k); else if (VO.q.length < 2) VO.q.push(k); voNext();
}
function setMute(on) { AU.on = on; if (AU.master) AU.master.gain.value = on ? .85 : 0; if (AU.el) { if (on) AU.el.play().catch(() => {}); else AU.el.pause(); } if (!on) { VO.q.length = 0; for (const k in VO.el) VO.el[k].pause(); VO.busy = false; } $('bmute').textContent = tr(on ? 'Sound on' : 'Sound off'); }

/* ---------- map generation ---------- */
// Skirmish maps for three and four armies. They are square; one sector (the western one) is laid out and the others are that sector turned round the centre.
{ const SECTOR = [['hq', 10, 48, 0], ['factory', 18, 41, 0], ['refinery', 9, 39, 0], ['pad', 20, 50, 0, 'gun'], ['pad', 14, 57, 0], ['robot', 27, 45, -1], ['refinery', 29, 36, -1], ['factory', 31, 57, -1], ['airpad', 22, 62, -1], ['tech', 40, 48, -1], ['foundry', 36, 41, -1], ['mine', 36, 54, -1]];
  for (const [name, rot, seed, extra] of [
    ['Trident', 3, 307, { scale: 11, water: .31, rock: .69 }],
    ['Three Rivers', 3, 331, { scale: 10, water: .33, rock: .72, feat: [['river', 44, 41, 30, 17, 1.8]] }],
    ['Broken Wheel', 3, 349, { scale: 12, water: .28, rock: .64, feat: [['wall', 44, 41, 32, 20, 2.2]] }],
    ['Four Winds', 4, 211, { scale: 11, water: .3, rock: .7 }],
    ['Crossfire', 4, 223, { scale: 10, water: .29, rock: .68, feat: [['wall', 26, 30, 26, 41, 2], ['wall', 26, 55, 26, 66, 2]] }],
    ['Lakeland', 4, 239, { scale: 9, water: .41, rock: .74 }]
  ]) MAPS.push(Object.assign({ name, desc: '', w: 96, h: 96, seed, rot, half: SECTOR, center: [['mine', 48, 48, -1]] }, extra)); }
const mapCap = d => d.rot || 2; // how many armies a map has room for
function buildMap(def, lite) {
  const w = def.w, h = def.h, nz = makeNoise(def.seed), nz2 = makeNoise(def.seed + 99), rng = mulberry32(def.seed * 13 + 5);
  const t = new Uint8Array(w * h); // 0 grass 1 dirt 2 water 3 road 4 rock
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sx = x, sy = y;
    if (def.rot) { const cx = (w - 1) / 2, cy = (h - 1) / 2, dx = x - cx, dy = y - cy, st = Math.PI * 2 / def.rot, k = Math.floor(((Math.atan2(dy, dx) - Math.PI + st / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / st), c = Math.cos(-k * st), sn = Math.sin(-k * st); sx = cx + dx * c - dy * sn; sy = cy + dx * sn + dy * c; }
    else if (y * w + x >= w * h / 2) { sx = w - 1 - x; sy = h - 1 - y; }
    const v = nz(sx / def.scale, sy / def.scale);
    t[y * w + x] = v < def.water ? 2 : v > def.rock ? 4 : nz2(sx / 5, sy / 5) > .56 ? 1 : 0;
  }
  // Shaped features: ['wall'|'river', x0, y0, x1, y1, r] lines and ['rocks'|'lake'|'clear', x, y, r] blobs, in the left half's coordinates.
  // Roads are laid afterwards and cut through them, which is what makes the gates, fords and passes.
  const paint = (cx, cy, r, v) => { const R = Math.ceil(r + 1); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = Math.round(cx) + dx, y = Math.round(cy) + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue; const rr = r + (nz2(x / 3, y / 3) - .5) * 1.7; if (dx * dx + dy * dy <= rr * rr) t[y * w + x] = v; } };
  const turn = (x, y, k) => { const cx = (w - 1) / 2, cy = (h - 1) / 2, a = k * Math.PI * 2 / def.rot, c = Math.cos(a), sn = Math.sin(a); return [Math.round(cx + (x - cx) * c - (y - cy) * sn), Math.round(cy + (x - cx) * sn + (y - cy) * c)]; };
  for (const f of def.feat || []) for (let mir = 0; mir < (def.rot || 2); mir++) {
    const P = (x, y) => def.rot ? turn(x, y, mir) : mir ? [w - 1 - x, h - 1 - y] : [x, y], v = f[0] === 'wall' || f[0] === 'rocks' ? 4 : f[0] === 'river' || f[0] === 'lake' ? 2 : 0;
    if (f.length === 4) { const p = P(f[1], f[2]); paint(p[0], p[1], f[3], v); }
    else { const a = P(f[1], f[2]), b = P(f[3], f[4]), n = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), 1); for (let i = 0; i <= n; i++) paint(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, f[5], v); }
  }
  const sites = [];
  for (const [k, x, y, o, tur] of def.half) {
    if (def.rot) { for (let r = 0; r < def.rot; r++) { const p = turn(x, y, r); sites.push({ k, x: p[0], y: p[1], o: o < 0 ? -1 : r, tur }); } continue; }
    sites.push({ k, x, y, o, tur });
    sites.push({ k, x: w - 1 - x, y: h - 1 - y, o: o < 0 ? -1 : 1 - o, tur });
  }
  for (const [k, x, y, o, tur] of def.center) sites.push({ k, x, y, o, tur });
  const set = (x, y, v, onlyBlocked) => { if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return; const i = y * w + x; if (onlyBlocked && t[i] !== 2 && t[i] !== 4) return; t[i] = v; };
  // minimum spanning tree of roads guarantees every site is reachable by land
  const inT = [0], edges = [];
  while (inT.length < sites.length) {
    let best = null, bd = 1e9;
    for (const a of inT) for (let b = 0; b < sites.length; b++) {
      if (inT.includes(b)) continue;
      const d = Math.hypot(sites[a].x - sites[b].x, sites[a].y - sites[b].y);
      if (d < bd) { bd = d; best = [a, b]; }
    }
    inT.push(best[1]); edges.push(best);
  }
  for (const [a, b] of edges) {
    const A = sites[a], B = sites[b], n = Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(A.x + (B.x - A.x) * i / n), y = Math.round(A.y + (B.y - A.y) * i / n);
      set(x, y, 3); set(x + 1, y, 3); set(x, y + 1, 3); set(x + 1, y + 1, 3);
    }
  }
  for (const s of sites) {
    const R = s.k === 'hq' ? 6 : s.k === 'pad' ? 3 : 4;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy); if (d > R + .3) continue;
      if (d <= R - 2) set(s.x + dx, s.y + dy, 3); else set(s.x + dx, s.y + dy, 0, true);
    }
  }
  const pass = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) pass[i] = t[i] !== 2 && t[i] !== 4 ? 1 : 0;
  if (lite) return { w, h, t, sites }; // enough for the preview on the skirmish screen
  const MG = 12, m = { w, h, t, pass, sites, WW: w * TILE, WH: h * TILE, theme: def.theme, MG, EW: w + MG * 2, EH: h + MG * 2,
    ext: (x, y) => { const v = nz(x / def.scale, y / def.scale); return v < def.water ? 2 : v > def.rock ? 4 : nz2(x / 5, y / 5) > .56 ? 1 : 0; } };
  renderTerrain(m, nz2, rng);
  m.vis = new Uint8Array(w * h); m.exp = new Uint8Array(w * h);
  m.fogC = document.createElement('canvas'); m.fogC.width = m.EW; m.fogC.height = m.EH;
  m.fogX = m.fogC.getContext('2d'); m.fogImg = m.fogX.createImageData(m.EW, m.EH);
  m.fogB = document.createElement('canvas'); m.fogB.width = m.EW; m.fogB.height = m.EH; m.fogBX = m.fogB.getContext('2d'); // blurred copy, so the edge of what you can see is soft and rounded
  for (let i = 0; i < m.EW * m.EH; i++) { m.fogImg.data[i * 4] = 5; m.fogImg.data[i * 4 + 1] = 8; m.fogImg.data[i * 4 + 2] = 11; m.fogImg.data[i * 4 + 3] = 255; }
  return m;
}
function renderTerrain(m, nz, rng) {
  const S = 16, MG = m.MG, w = m.EW, h = m.EH, MGP = MG * TILE, EWp = w * TILE, EHp = h * TILE, cw = w * S, chh = h * S, T = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const qx = x - MG, qy = y - MG; T[y * w + x] = qx >= 0 && qy >= 0 && qx < m.w && qy < m.h ? m.t[qy * m.w + qx] : m.ext(qx, qy); }
  OX = m.WH * K; mkSprites();
  const c = document.createElement('canvas'); c.width = cw; c.height = chh;
  const x = c.getContext('2d'), img = x.createImageData(cw, chh), d = img.data, cov = new Float32Array(5);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ds = m.theme === 'desert', G1 = ds ? [184, 158, 106] : [64, 102, 54], G2 = ds ? [204, 178, 122] : [86, 122, 64], DIRT = ds ? [150, 122, 82] : [128, 108, 78], ROAD = [142, 132, 112], ROCK = [100, 100, 104], SAND = [190, 174, 130], SHAL = [62, 128, 144], DEEP = [28, 72, 110], FOAM = [225, 240, 240];
  // each pixel softly blends the surrounding tiles, then gets gentle tonal variation and fine grain
  for (let py = 0; py < chh; py++) for (let px = 0; px < cw; px++) {
    const ux = px * 8 / S, uy = py * 8 / S;
    const wx = (nz(ux / 14, uy / 14) - .5) * .5, wy = (nz(ux / 14 + 40, uy / 14 + 17) - .5) * .5;
    const fx = (px + .5) / S + wx - .5, fy = (py + .5) / S + wy - .5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    cov.fill(0);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) cov[T[clamp(y0 + j, 0, h - 1) * w + clamp(x0 + i, 0, w - 1)]] += (i ? ax : 1 - ax) * (j ? ay : 1 - ay);
    const n1 = nz(ux / 34, uy / 34), fine = nz(ux * 1.7 + 9, uy * 1.7 + 3), mid = nz(ux / 6 + 5, uy / 6);
    let col = mix(G1, G2, sm(.3, .7, n1));
    col = mix(col, DIRT, sm(.25, .75, cov[1])); col = mix(col, ROCK, sm(.25, .75, cov[4])); col = mix(col, ROAD, sm(.3, .7, cov[3]));
    let jit = (fine - .5) * 15 + (mid - .5) * 9 + (rng() - .5) * 5; const wv = cov[2];
    if (wv > .5) { col = mix(SHAL, DEEP, Math.pow(sm(.5, 1, wv), .7)); jit = (mid - .5) * 8 + (fine - .5) * 4; if (wv < .54) col = mix(col, FOAM, .3); }
    else if (wv > .18) col = mix(col, SAND, sm(.18, .46, wv));
    const i4 = (py * cw + px) * 4; d[i4] = col[0] + jit; d[i4 + 1] = col[1] + jit; d[i4 + 2] = col[2] + jit * .7; d[i4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const wc = document.createElement('canvas'); wc.width = EWp; wc.height = EHp;
  const g = wc.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, EWp, EHp);
  for (let i = 0, n = w * h * 2; i < n; i++) { g.fillStyle = rng() < .5 ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.03)'; g.fillRect(rng() * EWp, rng() * EHp, 1 + rng() * 1.5, 1 + rng() * 1.5); }
  const props = [], glints = [], dot = (px, py, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill(); };
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const k = T[ty * w + tx], ox = tx * TILE, oy = ty * TILE, R = () => rng() * TILE;
    if (k === 0) {
      for (let i = 0, n = rng() * 2.4 | 0; i < n; i++) {
        const px = ox + R(), py = oy + R(); g.strokeStyle = m.theme === 'desert' ? 'rgba(120,96,56,.3)' : rng() < .55 ? 'rgba(34,66,30,.3)' : 'rgba(150,186,96,.24)'; g.lineWidth = 1; g.beginPath();
        for (let b = 0; b < 3; b++) { g.moveTo(px + b * 1.5, py); g.lineTo(px + b * 1.5 + (rng() - .5) * 4, py - 3 - rng() * 3.5); } g.stroke();
      }
      if (rng() < .08) { const col = ['rgba(242,233,160,.85)', 'rgba(255,255,255,.8)', 'rgba(232,160,192,.8)'][rng() * 3 | 0], px = ox + R(), py = oy + R(); for (let i = 0; i < 4; i++) dot(px + (rng() - .5) * 9, py + (rng() - .5) * 9, .9, col); }
      if (rng() < .1) { const px = ox + R(), py = oy + R(), r = 4 + rng() * 4; dot(px + 2, py + 2, r, 'rgba(0,0,0,.18)'); dot(px, py, r, 'rgba(38,74,34,.8)'); dot(px - r * .3, py - r * .3, r * .5, 'rgba(120,168,84,.45)'); }
      if (rng() < .05) { const px = ox + R(), py = oy + R(); dot(px + .8, py + .8, 1.8, 'rgba(0,0,0,.25)'); dot(px, py, 1.6, 'rgba(150,150,146,.8)'); }
    } else if (k === 1) {
      for (let i = 0; i < 2; i++) { const px = ox + R(), py = oy + R(), r = .8 + rng() * 1.4; dot(px + .6, py + .6, r, 'rgba(0,0,0,.22)'); dot(px, py, r, 'rgba(150,134,108,.7)'); }
      if (rng() < .22) { let px = ox + R(), py = oy + R(); g.strokeStyle = 'rgba(58,44,30,.38)'; g.lineWidth = .9; g.beginPath(); g.moveTo(px, py); for (let i = 0; i < 4; i++) { px += (rng() - .5) * 12; py += (rng() - .5) * 12; g.lineTo(px, py); } g.stroke(); }
      if (rng() < .08) { g.strokeStyle = 'rgba(96,104,60,.5)'; g.lineWidth = 1; const px = ox + R(), py = oy + R(); g.beginPath(); for (let b = 0; b < 3; b++) { g.moveTo(px + b * 1.5, py); g.lineTo(px + b * 1.5 + (rng() - .5) * 3, py - 3 - rng() * 2); } g.stroke(); }
    } else if (k === 3) {
      if (rng() < .5) { g.fillStyle = 'rgba(66,58,46,.24)'; g.fillRect(ox + rng() * 24, oy + rng() * 28, 3 + rng() * 6, 1.4); }
      if (rng() < .12) { const px = ox + R(), py = oy + R(), r = 5 + rng() * 6, gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(30,26,22,.22)'); gr.addColorStop(1, 'rgba(30,26,22,0)'); g.fillStyle = gr; g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill(); }
      if (rng() < .3) dot(ox + R(), oy + R(), .8 + rng(), 'rgba(196,186,166,.45)');
    } else if (k === 4) {
      for (let i = 0; i < 4; i++) dot(ox + R(), oy + R(), 1.5 + rng() * 4, i % 2 ? 'rgba(40,42,48,.34)' : 'rgba(150,152,160,.2)');
      for (let i = 0, n = 1 + (rng() * 2 | 0); i < n; i++) props.push(mkProp(ox - MGP + 5 + rng() * 22, oy - MGP + 5 + rng() * 22, rng() < (m.theme === 'desert' ? .04 : .3) ? SPR.trees[rng() * SPR.trees.length | 0] : SPR.rocks[rng() * SPR.rocks.length | 0], .8 + rng() * .5));
    } else if (rng() < .45) glints.push({ X: ix(ox - MGP + R(), oy - MGP + 8), Y: iy(ox - MGP + 8, oy - MGP + R()), ph: rng() * TAU, w: 5 + rng() * 9 });
  }
  // fade the margin into the background colour so the map has no hard edge
  const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(5,8,11,0)'); gr.addColorStop(.25, 'rgba(5,8,11,.3)'); gr.addColorStop(1, 'rgba(5,8,11,1)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
  fade(MGP, 0, 0, 0, 0, 0, MGP, EHp); fade(EWp - MGP, 0, EWp, 0, EWp - MGP, 0, MGP, EHp); fade(0, MGP, 0, 0, 0, 0, EWp, MGP); fade(0, EHp - MGP, 0, EHp, 0, EHp - MGP, EWp, MGP);
  const IW = Math.ceil((m.WW + m.WH) * K), EIW = Math.ceil((EWp + EHp) * K), ic = document.createElement('canvas'); ic.width = EIW; ic.height = Math.ceil(EIW / 2);
  const g2 = ic.getContext('2d'); m.offX = 2 * MGP * K; m.offY = MGP * K;
  g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high';
  g2.setTransform(K, K * .5, -K, K * .5, EHp * K, 0); g2.drawImage(wc, 0, 0);
  g2.setTransform(K, K * .5, -K, K * .5, OX + m.offX, m.offY); // later drawing (scorch marks, tracks) uses world coordinates
  { const mc = document.createElement('canvas'); mc.width = cw; mc.height = chh; const mg = mc.getContext('2d'); mg.fillStyle = '#fff'; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (T[y * w + x] === 2) mg.fillRect(x * S - 1, y * S - 1, S + 2, S + 2);
    const mb = document.createElement('canvas'); mb.width = cw; mb.height = chh; const bg = mb.getContext('2d'); bg.filter = 'blur(5px)'; bg.drawImage(mc, 0, 0); bg.filter = 'none'; bg.globalCompositeOperation = 'destination-in'; bg.drawImage(mc, 0, 0); // soft towards the shore, never spilling onto land
    const wm = document.createElement('canvas'); wm.width = Math.ceil(EIW / 2); wm.height = Math.ceil(EIW / 4); const wg = wm.getContext('2d'); wg.imageSmoothingEnabled = true; wg.setTransform(K * .5, K * .25, -K * .5, K * .25, EHp * K * .5, 0); wg.drawImage(mb, 0, 0, cw, chh, 0, 0, EWp, EHp); m.wmask = wm;
    const fr = document.createElement('canvas'); fr.width = cw; fr.height = chh; const fg = fr.getContext('2d'); fg.drawImage(mc, 0, 0); fg.globalCompositeOperation = 'destination-out'; fg.filter = 'blur(3.5px)'; for (let i = 0; i < 3; i++) fg.drawImage(mc, 0, 0); fg.filter = 'none'; // what is left is a thin band at the edge
    const fb = document.createElement('canvas'); fb.width = cw; fb.height = chh; const fbg = fb.getContext('2d'); fbg.filter = 'blur(1.2px)'; fbg.drawImage(fr, 0, 0);
    const wf = document.createElement('canvas'); wf.width = wm.width; wf.height = wm.height; const wfg = wf.getContext('2d'); wfg.imageSmoothingEnabled = true; wfg.setTransform(K * .5, K * .25, -K * .5, K * .25, EHp * K * .5, 0); wfg.drawImage(fb, 0, 0, cw, chh, 0, 0, EWp, EHp); m.wfoam = wf; }
  props.sort((a, b) => a.d - b.d); m.props = props; m.glints = glints; m.world = ic; m.wg = g2; m.IW = IW;
  m.clouds = Array.from({ length: 16 }, () => ({ X0: rng() * (IW + 900), Y: rng() * IW * .5, sc: 1 + rng() * 1.2, sp: 9 + rng() * 9 }));
  m.mini = document.createElement('canvas'); m.mini.width = m.w * 6; m.mini.height = m.h * 6;
  m.mini.getContext('2d').drawImage(c, MG * S, MG * S, m.w * S, m.h * S, 0, 0, m.w * 6, m.h * 6);
}

/* ---------- pathfinding ---------- */
const PF = {};
function pfInit(m) { const n = m.w * m.h; PF.g = new Float64Array(n); PF.f = new Float64Array(n); PF.from = new Int32Array(n); PF.st = new Uint32Array(n); PF.cl = new Uint32Array(n); PF.stamp = 0; PF.heap = []; }
function passAt(x, y) { const m = G.map; if (x < 0 || y < 0 || x >= m.WW || y >= m.WH) return false; return m.pass[(y / TILE | 0) * m.w + (x / TILE | 0)] === 1; }
function nearestPass(tx, ty) {
  const m = G.map; tx = clamp(tx, 0, m.w - 1); ty = clamp(ty, 0, m.h - 1);
  if (m.pass[ty * m.w + tx]) return ty * m.w + tx;
  for (let r = 1; r < 18; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = tx + dx, y = ty + dy;
    if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.pass[y * m.w + x]) return y * m.w + x;
  }
  return -1;
}
function los(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d < 1) return true;
  const n = Math.ceil(d / 8), nx = -dy / d * 10, ny = dx / d * 10;
  for (let i = 0; i <= n; i++) { const x = a.x + dx * i / n, y = a.y + dy * i / n; if (!passAt(x, y) || !passAt(x + nx, y + ny) || !passAt(x - nx, y - ny)) return false; }
  return true;
}
// does the line a-c pass through the box of half-size hx, hy round b?
function segBox(a, c, b, hx, hy) {
  let t0 = 0, t1 = 1; const dx = c.x - a.x, dy = c.y - a.y, P = [-dx, dx, -dy, dy], Q = [a.x - (b.x - hx), b.x + hx - a.x, a.y - (b.y - hy), b.y + hy - a.y];
  for (let i = 0; i < 4; i++) { if (P[i] === 0) { if (Q[i] <= 0) return false; } else { const t = Q[i] / P[i]; if (P[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } } }
  return t1 - t0 > 1e-6;
}
// The map's paths know nothing of structures. Small ones are simply brushed past; a Heavy Factory is long, so a path that would
// cross it is led round its corners instead of into its wall.
function boxRound(p, sx, sy) {
  if (!p.length) return p;
  for (const b of G.blds) {
    if (!b.T.box) continue;
    const hx = b.T.box[0] + 24, hy = b.T.box[1] + 24, hit = (a, c) => segBox(a, c, b, hx - 2, hy - 2), ins = q => Math.abs(q.x - b.x) < hx - 2 && Math.abs(q.y - b.y) < hy - 2, len = (a, c) => Math.hypot(c.x - a.x, c.y - a.y);
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(q => ({ x: b.x + q[0] * hx, y: b.y + q[1] * hy })), out = []; let a = { x: sx, y: sy };
    for (const c of p) {
      if (hit(a, c) && !ins(c)) {
        if (ins(a)) { const dx = a.x - b.x, dy = a.y - b.y; a = hx - Math.abs(dx) < hy - Math.abs(dy) ? { x: b.x + (dx < 0 ? -hx : hx), y: a.y } : { x: a.x, y: b.y + (dy < 0 ? -hy : hy) }; out.push(a); } // standing against the wall: step clear of it first
        let best = null, bd = 1e9; // the shortest way by one corner, or by two neighbouring ones
        for (let k = 0; k < 4; k++) for (const via of [[cs[k]], [cs[k], cs[(k + 1) % 4]], [cs[k], cs[(k + 3) % 4]]]) {
          const pts = [a, ...via, c]; let d = 0, ok = true;
          for (let i = 1; i < pts.length && ok; i++) { if (hit(pts[i - 1], pts[i])) ok = false; d += len(pts[i - 1], pts[i]); }
          for (const q of via) if (!passAt(q.x, q.y)) d += 400; // a corner on rock or water is a last resort
          if (ok && d < bd) { bd = d; best = via; }
        }
        if (best) for (const q of best) out.push({ x: q.x, y: q.y });
      }
      out.push(c); a = c;
    }
    p = out;
  }
  return p;
}
function findPath(sx, sy, tx, ty) { return boxRound(mapPath(sx, sy, tx, ty), sx, sy); }
function mapPath(sx, sy, tx, ty) {
  const m = G.map, w = m.w, h = m.h, pass = m.pass;
  tx = clamp(tx, 4, m.WW - 4); ty = clamp(ty, 4, m.WH - 4);
  const s = nearestPass(sx / TILE | 0, sy / TILE | 0), e = nearestPass(tx / TILE | 0, ty / TILE | 0);
  if (s < 0 || e < 0) return [];
  const end = passAt(tx, ty) ? { x: tx, y: ty } : { x: (e % w + .5) * TILE, y: ((e / w | 0) + .5) * TILE };
  if (s === e) return [end];
  const { g, f, from, st, cl } = PF, stamp = ++PF.stamp, heap = PF.heap, cap = w * h * 8; heap.length = 0; let pushed = 0;
  const ex = e % w, ey = e / w | 0;
  const push = i => { heap.push(i); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (f[heap[p]] <= f[heap[c]]) break; const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let b = c; if (l < heap.length && f[heap[l]] < f[heap[b]]) b = l; if (r < heap.length && f[heap[r]] < f[heap[b]]) b = r; if (b === c) break; const t = heap[b]; heap[b] = heap[c]; heap[c] = t; c = b; } }
    return top;
  };
  g[s] = 0; f[s] = 0; from[s] = -1; st[s] = stamp; push(s);
  let found = false;
  while (heap.length) {
    const c = pop(); if (c === e) { found = true; break; }
    if (cl[c] === stamp) continue; cl[c] = stamp; // each tile is expanded once; older copies of it in the queue are skipped
    if (pushed > cap) break; // safety net: never let one search run away
    const cx = c % w, cy = c / w | 0, gc = g[c];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const n = y * w + x; if (!pass[n] || cl[n] === stamp) continue;
      if (dx && dy && (!pass[cy * w + x] || !pass[y * w + cx])) continue;
      const ng = gc + (dx && dy ? 1.414 : 1);
      if (st[n] === stamp && g[n] <= ng) continue;
      st[n] = stamp; g[n] = ng; from[n] = c;
      const hx = Math.abs(x - ex), hy = Math.abs(y - ey); f[n] = ng + Math.max(hx, hy) + .414 * Math.min(hx, hy); push(n); pushed++;
    }
  }
  if (!found) return [end];
  const pts = []; for (let c = e; c !== s && c >= 0; c = from[c]) pts.push({ x: (c % w + .5) * TILE, y: ((c / w | 0) + .5) * TILE });
  pts.reverse(); pts[pts.length - 1] = end;
  const out = []; let cur = { x: sx, y: sy }, i = 0;
  while (i < pts.length) { let j = Math.min(pts.length - 1, i + 14); while (j > i && !los(cur, pts[j])) j--; out.push(pts[j]); cur = pts[j]; i = j + 1; }
  return out;
}

/* ---------- entities ---------- */
function coreLvl(ti) { const h = G.blds.find(b => b.k === 'hq' && b.team === ti); return h ? h.lvl || 0 : 0; }
function capOf(ti) { return CAP + 10 * coreLvl(ti); }
function maxHp(e) { return e.isB ? (e.k === 'pad' ? (e.turret ? TT[e.turret].hp * (1 + .3 * (e.lvl || 0)) : 1) : e.T.hp * (e.fort ? 1.6 : 1) * (e.k === 'hq' ? 1 + .25 * (e.lvl || 0) : 1)) : e.T.hp * (1 + .15 * (e.rank || 0)) * (e.hpM || 1); }
function targetable(e) { return e && !e.dead && e.team >= 0 && e.hp > 0; }
// two sides are enemies when they are different and not in the same alliance (G.al holds each side's alliance number)
function hostile(a, b) { return a !== b && a >= 0 && b >= 0 && G.al[a] !== G.al[b]; }
function friendly(a, b) { return a === b || (a >= 0 && b >= 0 && G.al[a] === G.al[b]); }
function capturable(b, t) { return b.k !== 'hq' && b.team !== t && (b.team === -1 || b.hp <= 0); }
function canHit(w, e) { if (w.unarmed) return false; return e.T && e.T.air && !e.isB ? !(w.noAir || w.kind === 'shell' || w.kind === 'arty') : !w.airOnly; }
function visAt(x, y) { const m = G.map; if (x < 0 || y < 0 || x >= m.WW || y >= m.WH) return false; return m.vis[(y / TILE | 0) * m.w + (x / TILE | 0)] === 1; }
function expAt(x, y) { const m = G.map; return m.exp[(y / TILE | 0) * m.w + (x / TILE | 0)] === 1; }
function seen(e) { return friendly(e.team, 0) || visAt(e.x, e.y); }

function mkUnit(k, team, x, y) {
  const T = UT[k], u = { id: uid++, k, T, team, x, y, a: rnd() * TAU, ta: 0, hp: T.hp, cd: rnd() * T.rof, order: null, tgt: null, think: rnd() * .3, flash: 0, hitBy: null, lastHit: -99, dead: false, busy: 0, kills: 0, rank: 0 };
  u.ta = u.a; G.units.push(u); return u;
}
function mkBld(s) {
  const T = BT[s.k], b = { id: uid++, isB: true, k: s.k, T, team: s.o, x: (s.x + .5) * TILE, y: (s.y + .5) * TILE, hp: s.k === 'pad' ? 0 : T.hp, cap: 0, capTeam: -1, prod: null, paid: false, pt: 0, rally: null, turret: null, cd: 0, ta: rnd() * TAU, tgt: null, think: rnd(), lastHit: -99, hitBy: null, claim: -99, smoke: 0 };
  if (s.tur) { b.turret = s.tur; b.hp = TT[s.tur].hp; }
  if (T.makes && b.team >= 0) b.prod = T.makes.includes('bt0') ? 'bt0' : T.makes[0];
  G.blds.push(b); return b;
}

function startGame(mi, diff, zone, loading, sk) {
  const def = zone ? Object.assign({}, MAPS[mi], zone.over) : sk ? Object.assign({}, MAPS[mi], sk.over) : MAPS[mi], m = buildMap(def), NT = sk ? sk.n : 2, dk = i => sk && i > 0 ? sk.diffs[i - 1] : diff;
  G = {
    map: m, mi, def, zone: zone || null, obj: zone ? zone.obj : { type: 'destroy' }, diff: zone && zone.obj.type === 'survive' ? Object.assign({}, DIFF[diff], { first: DIFF[diff].first * .5, gap: DIFF[diff].gap * .6 }) : DIFF[diff], diffName: diff, units: [], blds: [], shots: [], parts: [], strikes: [], fires: [], beams: [],
    sk: sk || null, al: sk ? sk.al.slice() : [0, 1, 2, 3],
    teams: Array.from({ length: NT }, (_, i) => ({ dif: zone && zone.obj.type === 'survive' ? Object.assign({}, DIFF[diff], { first: DIFF[diff].first * .5, gap: DIFF[diff].gap * .6 }) : DIFF[dk(i)], credits: sk ? sk.credits : 500, dmgU: 0, arm: 0, alive: true, pw: { strike: 25, repair: 10, sortie: 15, laser: 20 }, tech: 0, foundry: 0, airfield: 0, laser: 0, count: 0, income: 0, ai: i > 0, aiT: 3 + rnd(), waveT: DIFF[dk(i)].first * (zone && zone.obj.type === 'survive' ? .5 : 1), kills: 0, lost: 0 })),
    t: 0, sel: [], cam: { x: 0, y: 0, z: 1.3 }, speed: 1, paused: false, over: false, groups: {}, mode: null, lastAlert: -99, lastCombat: -99, alertPos: null, incT: 0, visT: 0, uiT: 0
  };
  pfInit(m); wxInit(m, def);
  const inv = {}; if (sk && sk.slots) sk.slots.slice(0, NT).forEach((sec, ti) => { inv[sec] = ti; }); else for (let i = 0; i < NT; i++) inv[i] = i; // sector -> army
  for (const s of m.sites) { if (s.o < 0) { mkBld(s); continue; } const ti = inv[s.o]; if (ti === undefined) { if (s.k === 'hq' || s.k === 'pad') continue; mkBld(Object.assign({}, s, { o: -1 })); } else mkBld(Object.assign({}, s, { o: ti })); } // an empty sector keeps its structures, neutral, but has no base
  setupFactories();
  for (const b of G.blds) if (b.k === 'hq') for (let i = 0; i < 3; i++) mkUnit('bt0', b.team, b.x - 40 + i * 40, b.y + 90);
  setupMission(loading);
  const hq = G.blds.find(b => b.k === 'hq' && b.team === 0); G.cam.x = hq.x; G.cam.y = hq.y;
  const mc = $('mini'), mw = 260, mh = Math.round(mw * m.h / m.w), dpr = Math.min(2, window.devicePixelRatio || 1); mc.width = mw * dpr; mc.height = mh * dpr; mc.style.width = mw + 'px'; mc.style.height = mh + 'px';
  updFog();
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden'); $('pauseov').classList.add('hidden');
  $('bspeed').textContent = tr('Speed {0}×', 1); $('toasts').innerHTML = '';
  toast(zone ? zone.mission + ': ' + zone.brief : sk ? 'Skirmish: capture structures and destroy every enemy Command Core.' : 'Capture structures, then destroy the Crimson Command Core.'); $('obj').textContent = objText(); VO.q.length = 0; VO.last = {}; if (!loading) voice('start');
}

/* ---------- effects ---------- */
// where an order was given: a ring that closes in, four arrows pointing at the spot and a pulsing centre
function orderMark(x, y, size, color) { if (G.parts.length < 1600) G.parts.push({ kind: 'ring', mark: true, x, y, vx: 0, vy: 0, life: 1, max: 1, size: Math.max(13, size * .6), color, vz: 0, z: 0, g: 0 }); }
function part(kind, x, y, vx, vy, life, size, color, vz, z, g) { if (G.parts.length < 1600) G.parts.push({ kind, x, y, vx, vy, life, max: life, size, color, vz: vz || 0, z: z || 0, g: g || 0 }); }
function boom(x, y, s, z) {
  const m = G.map; z = z || 0;
  if (!z && x > 0 && y > 0 && x < m.WW && y < m.WH) {
    const g = m.wg, r = 16 * s, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(14,11,9,.55)'); gr.addColorStop(.6, 'rgba(20,15,11,.25)'); gr.addColorStop(1, 'rgba(15,12,10,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (s >= 1.5) { g.strokeStyle = 'rgba(70,58,44,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * .45, 0, TAU); g.stroke(); }
    for (let i = 0; i < 5 * s; i++) { const a = rnd() * TAU, d = rnd() * r * 1.3; g.fillStyle = 'rgba(18,14,11,.4)'; g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + rnd() * 2.5, 1 + rnd() * 2); }
  }
  if (visAt(x, y)) {
    const P = (kind, v0, v1, life, size, vz, g, z0) => { const a = rnd() * TAU, v = v0 + rnd() * (v1 - v0); part(kind, x + Math.cos(a) * 3 * s, y + Math.sin(a) * 3 * s, Math.cos(a) * v, Math.sin(a) * v, life, size, null, vz, z + (z0 || 4), g); };
    part('flash', x, y, 0, 0, .16, 38 * s, null, 0, z + 8);
    part('ring', x, y, 0, 0, .32, 36 * s, '255,240,210', 0, z);
    for (let i = 0; i < 6 * s; i++) P('fire', 10, 55 * s, .35 + rnd() * .45, 9 * s + rnd() * 7, 22 + rnd() * 55 * s);
    for (let i = 0; i < 5 * s; i++) P('smoke', 6, 26, 1.4 + rnd() * 1.6, 8 * s + rnd() * 6, 16 + rnd() * 24, 0, 10);
    for (let i = 0; i < 3 * s; i++) P('debris', 50, 170, 1.1 + rnd() * .8, 2 + rnd() * 3, 110 + rnd() * 170, 420);
    for (let i = 0; i < 8 * s; i++) P('ember', 30, 150, .7 + rnd() * .9, 1.5, 80 + rnd() * 180, 300);
    for (let i = 0; i < 5 * s; i++) P('spark', 90, 260, .2 + rnd() * .25, 2, 30 + rnd() * 130);
    if (!z) for (let i = 0; i < 3 * s; i++) P('dust', 20, 60, .9 + rnd() * .6, 9 * s, 6, 0, 2);
  }
  sfx(s > 2 ? 'bigboom' : 'boom', x, y);
}
function burn(x, y, t, s) { if (G.fires.length < 40) G.fires.push({ x, y, t, s: s || 1, acc: 0 }); }
function updFires(dt) {
  for (const f of G.fires) {
    f.t -= dt; f.acc -= dt;
    if (f.acc <= 0) { f.acc = .07; if (visAt(f.x, f.y)) { part('fire', f.x + (rnd() - .5) * 9 * f.s, f.y + (rnd() - .5) * 9 * f.s, 0, 0, .3 + rnd() * .3, (5 + rnd() * 4) * f.s, null, 28 + rnd() * 22, 3); if (rnd() < .45) part('smoke', f.x, f.y, (rnd() - .5) * 8, (rnd() - .5) * 8, 1.4 + rnd(), 6 * f.s, null, 30, 14); if (rnd() < .2) part('ember', f.x, f.y, (rnd() - .5) * 40, (rnd() - .5) * 40, .8, 1.5, null, 90, 6, 200); } }
  }
  G.fires = G.fires.filter(f => f.t > 0);
}
function trackMark(u) {
  const g = G.map.wg, w = u.T.r * .72; g.save(); g.translate(u.x, u.y); g.rotate(u.a); g.fillStyle = 'rgba(30,24,16,.06)';
  g.fillRect(-3, -w - 1.5, 5, 3); g.fillRect(-3, w - 1.5, 5, 3); g.restore();
}
function toast(msg, cls) {
  if (msg === 'Not enough credits.') voice('nocredits');
  const t = $('toasts'), d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = tr(msg); t.appendChild(d);
  while (t.children.length > 4) t.firstChild.remove();
  setTimeout(() => d.remove(), 4000);
}

/* ---------- combat ---------- */
function fire(src, w, tg, x, y) {
  let dmg = w.dmg * (1 + .15 * G.teams[src.team].dmgU) * (1 + .15 * (src.rank || 0)) * (src.dmgM || 1) * (src.isB && src.k === 'pad' ? 1 + .25 * (src.lvl || 0) : 1);
  if (tg.isB && w.bmul) dmg *= w.bmul;
  if (tg.T && tg.T.air && w.airMul) dmg *= w.airMul;
  G.shots.push({ x, y, sx: x, sy: y, tgt: tg, tx: tg.x, ty: tg.y, kind: w.kind, dmg, team: src.team, splash: w.splash || 0, src, spd: w.kind === 'laser' ? 2600 : w.kind === 'flame' ? 250 : w.kind === 'bullet' ? 760 : w.kind === 'flak' ? 640 : w.kind === 'shell' ? 480 : w.kind === 'arty' ? 300 : 290, a: Math.atan2(tg.y - y, tg.x - x), tr: 0, h0: src.isB ? BH[src.k] + 10 : src.T.air ? AIRH : 12, h1: tg.isB ? BH[tg.k] * .6 : tg.T.air ? AIRH : 7 });
  sfx(w.kind === 'laser' ? 'zap' : w.kind === 'flame' ? 'burn' : w.kind, x, y);
  if (visAt(x, y)) {
    const sh = G.shots[G.shots.length - 1], small = w.kind === 'bullet' || w.kind === 'flak';
    part('flash', x, y, 0, 0, .07, small ? 8 : w.kind === 'missile' ? 12 : 20, null, 0, sh.h0);
    if (!small) for (let i = 0; i < 3; i++) part('smoke', x, y, Math.cos(sh.a) * 34 * rnd(), Math.sin(sh.a) * 34 * rnd(), .6 + rnd() * .4, 4, null, 8, sh.h0);
  }
  if (src.team === 0 || tg.team === 0) G.lastCombat = G.t;
}
function damage(e, d, src) {
  if (e.dead || e.hp <= 0 || e.team < 0) return;
  d /= 1 + .15 * G.teams[e.team].arm;
  e.hp -= d; e.lastHit = G.t; if (src) e.hitBy = src;
  if (!e.isB && e.T.hero && e.team === 0 && e.hp > 0) voice('van_attack');
  if (e.isB) {
    if (e.team === 0 && G.t - G.lastAlert > 10) { G.lastAlert = G.t; G.alertPos = { x: e.x, y: e.y }; toast(tr('{0} under attack! (Space)', e.T.name), 'bad'); sfx('alert'); voice(e.k === 'hq' ? 'core_attack' : 'base_attack', true); }
    if (e.hp <= 0) bldDown(e, src);
  } else if (e.hp <= 0) killUnit(e, src);
}
const VET = [2, 5, 10];
// kills earn stars: each star is +15% damage and hit points; the third also fires 20% faster and self-repairs
function credit(src, n) {
  if (!src || src.isB || !src.T || src.dead) return;
  src.kills += n;
  while (src.rank < 3 && src.kills >= VET[src.rank]) {
    src.rank++; src.hp += src.T.hp * .15;
    part('ring', src.x, src.y, 0, 0, .7, 34, '255,207,90', 0, src.T.air ? AIRH : 0);
    if (src.team === 0) { toast(tr('{0} promoted {1}', src.T.name, '★'.repeat(src.rank)), 'good'); sfx('cap'); voice('promoted'); }
  }
}
function vetLine(u) { const pc = v => Math.round((v - 1) * 100); return (u.spdM > 1 || u.hpM > 1 || u.dmgM > 1 ? tr('Upgraded line: {0}.', [u.spdM > 1 ? tr('+{0}% speed', pc(u.spdM)) : '', u.hpM > 1 ? tr('+{0}% hit points', pc(u.hpM)) : '', u.dmgM > 1 ? tr('+{0}% damage', pc(u.dmgM)) : '', u.regen ? tr('self-repair') : ''].filter(Boolean).join(tr(', '))) + ' ' : '') + tr('Kills {0}', u.kills) + ' · ' + (u.rank ? tr('{0} veteran', '★'.repeat(u.rank)) : tr('no stars yet')) + ' · ' + (u.rank < 3 ? tr('next star at {0}.', VET[u.rank]) : tr('top rank.')); }
function killUnit(u, src) {
  if (u.dead) return; u.dead = true; boom(u.x, u.y, 1.1, u.T.air ? AIRH : 0); if (!u.T.air) burn(u.x, u.y, 2.5, .8);
  if (u.T.hero) { G.teams[u.team].advT = 30; if (u.team === 0 && !G.over) { toast(tr('Vanguard lost. A new one will be ready at the Command Core in {0} seconds.', 30), 'bad'); sfx('alert'); voice('van_lost', true); } }
  G.teams[u.team].lost++; if (src && src.team >= 0 && src.team !== u.team) { G.teams[src.team].kills++; credit(src, 1); }
}
function bldDown(b, src) {
  const owner = b.team; if (src && src.team !== owner) credit(src, 2);
  if (b.k === 'hq' && G.over) { b.hp = 1; return; }
  if (owner === 0 && b.k !== 'hq') G.teams[0].bLost = (G.teams[0].bLost || 0) + 1;
  if (b.k === 'hq') { b.hp = 0; for (let i = 0; i < 7; i++) boom(b.x + (rnd() - .5) * 80, b.y + (rnd() - .5) * 80, 2 + rnd() * 1.5); eliminate(owner); return; }
  boom(b.x, b.y, b.k === 'pad' ? 1.5 : 2.4); burn(b.x, b.y, b.k === 'pad' ? 3 : 9, b.k === 'pad' ? 1 : 1.7);
  if (b.k === 'pad') b.turret = null;
  resetLines(b); b.hp = 0; b.team = -1; b.paid = false; b.pt = 0; b.cap = 0; b.tgt = null; b.up = null; b.lvl = 0; b.fort = false;
  if (owner === 0) { toast(tr('{0} lost.', b.T.name), 'bad'); voice('lost'); }
}
function eliminate(t) {
  const tm = G.teams[t]; if (!tm.alive) return; tm.alive = false; if (t === 0) G.coreLost = true;
  for (const b of G.blds) if (b.team === t) { resetLines(b); b.team = -1; b.paid = false; if (b.k === 'pad') { b.turret = null; b.hp = 0; } }
  for (const u of G.units) if (u.team === t && !u.dead) { u.dead = true; boom(u.x, u.y, 1.1); }
  tm.outAt = G.t;
  const foesLeft = G.teams.some((q, i) => q.alive && hostile(i, 0)), friendsLeft = G.teams.some((q, i) => q.alive && friendly(i, 0)), win = !foesLeft;
  if (foesLeft && friendsLeft) { // the battle goes on
    if (G.over) return;
    if (t === 0) { G.spec = true; G.sel = []; G.mode = null; toast('Your Command Core was destroyed. Your allies fight on: you are watching.', 'bad'); sfx('alert'); voice('failed', true); }
    else { toast(tr('{0} has been eliminated.', tr(TEAMC[t].n)), friendly(t, 0) ? 'bad' : 'good'); sfx('cap'); }
    return;
  }
  if (!G.over) { G.over = true; G.why = !win ? (G.teams[0].alive || t === 0 ? 'Your Command Core was destroyed.' : 'Your alliance was defeated.') : !G.teams[0].alive ? 'Your allies destroyed every enemy Command Core.' : G.sk ? 'Every enemy Command Core was destroyed.' : 'The Crimson Command Core was destroyed.'; const g = G; setTimeout(() => { if (G === g) endGame(win); }, 1800); }
}
// what each star is for: timed defences are judged on how well the base held, the rest on speed and losses
function starList(secs) {
  const tm = G.teams[0], ty = G.obj.type;
  if (ty === 'survive' || ty === 'defend') {
    const k = G.blds.find(b => b.team === 0 && b.k === (ty === 'defend' ? 'outpost' : 'hq'));
    return [['Mission won', true], ['No structures lost', !tm.bLost], [ty === 'defend' ? 'Allied Outpost above 75% health' : 'Command Core above 75% health', !!k && k.hp >= maxHp(k) * .75]];
  }
  return [['Mission won', true], ['Finished in under 10 minutes', secs < 600], ['Fewer than 15 units lost', tm.lost < 15]];
}
function endGame(win) {
  if (!G) return;
  const s = Math.floor(G.t), tm = G.teams[0], e = $('end'), sl = starList(s), stars = sl.filter(q => q[1]).length, narrow = win && stars === 1 && (G.obj.type === 'survive' || G.obj.type === 'defend'), vets = G.units.filter(u => u.team === 0 && u.rank).length;
  let nx = null, extra = '';
  try { localStorage.removeItem('sm_save'); } catch (er) {}
  if (win && G.zone && G.zone.mid) {
    CAMP.done[G.zone.mid] = Math.max(CAMP.done[G.zone.mid] || 0, stars);
    CAMP.vets = G.units.filter(u => u.team === 0 && !u.dead && u.rank && !u.T.temp && !u.T.convoy && !u.T.hero).sort((a, b) => b.kills - a.kills).slice(0, 6).map(u => ({ k: u.k, rank: u.rank, kills: u.kills }));
    campSave(); nx = ORDER[ORDER.indexOf(G.zone.mid) + 1] || null;
    extra = '<p>' + (CAMP.vets.length ? tr(CAMP.vets.length > 1 ? '{0} veterans will join your next mission.' : '{0} veteran will join your next mission.', CAMP.vets.length) : tr('No veterans survived to carry over.')) + (nx ? '' : ' ' + tr('The campaign is complete!')) + '</p>';
  }
  if (G.sk) { const order = G.teams.map((t, i) => i).sort((a, b) => (G.teams[b].alive - G.teams[a].alive) || ((G.teams[b].outAt || 0) - (G.teams[a].outAt || 0))); extra = '<table class="rank"><tr><th></th><th>' + tr('Army') + '</th><th>' + tr('Team') + '</th><th>' + tr('Destroyed') + '</th><th>' + tr('Lost') + '</th><th></th></tr>' + order.map((i, n) => { const t = G.teams[i]; return '<tr><td>' + (n + 1) + '</td><td><i class="dot" style="background:' + TEAMC[i].c + '"></i>' + (i ? tr(TEAMC[i].n) : tr('You')) + '</td><td>' + 'ABCD'[G.al[i]] + '</td><td>' + t.kills + '</td><td>' + t.lost + '</td><td>' + (t.alive ? tr('standing') : tr('out at {0}', Math.floor((t.outAt || 0) / 60) + ':' + String(Math.floor((t.outAt || 0) % 60)).padStart(2, '0'))) + '</td></tr>'; }).join('') + '</table>'; }
  e.innerHTML = `<h2 style="color:${win ? '#ffb347' : '#ff5d4a'}">${tr(win ? (narrow ? 'NARROW VICTORY' : 'VICTORY') : 'DEFEAT')}</h2>${G.why ? '<p class="why">' + tr(G.why) + '</p>' : ''}${win ? '<div style="font-size:42px;letter-spacing:.2em;color:#ffcf5a;margin-bottom:6px">' + '★'.repeat(stars) + '<span style="opacity:.2">' + '★'.repeat(3 - stars) + '</span></div><div class="starlist">' + sl.map(q => '<span class="' + (q[1] ? 'got' : '') + '">' + (q[1] ? '★ ' : '☆ ') + tr(q[0]) + '</span>').join('') + '</div>' : ''}<p>${G.zone ? G.zone.mission + ' — ' + G.zone.name : G.def.name} · ${tr(G.diffName[0].toUpperCase() + G.diffName.slice(1))} · ${tr('{0}m {1}s', Math.floor(s / 60), s % 60)} · ${tr('destroyed {0}', tm.kills)} · ${tr('lost {0}', tm.lost)} · ${tr('{0} veterans alive', vets)}</p>${extra}<div class="row">${nx ? '<button id="nextm" class="primary">' + tr('Next mission') + '</button>' : ''}<button id="again">${tr('Back to menu')}</button></div>`;
  e.classList.remove('hidden'); $('again').onclick = toMenu; if ($('nextm')) $('nextm').onclick = () => { const f = findMission(nx); toMenu(); selZone = f.z; selM = f.m; showScreen('zones'); buildZones(); }; VO.q.length = 0; voice(win ? 'victory' : G.coreLost ? 'defeat' : 'failed', true);
}
function toMenu() { G = null; engineUpdate(); $('hud').classList.add('hidden'); $('end').classList.add('hidden'); $('pauseov').classList.add('hidden'); $('menu').classList.remove('hidden'); showScreen('main'); buildMain(); }

/* ---------- orders ---------- */
function orderMove(us, x, y, am) {
  let cap = 0; if (us.length > 1) { cap = 1e9; for (const u of us) if (!u.T.air) cap = Math.min(cap, u.T.spd * (u.spdM || 1)); cap = cap === 1e9 ? 0 : cap * 1.12; }
  us.forEach((u, i) => {
    const r = i ? 19 * Math.sqrt(i) : 0, a = i * 2.4, tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
    u.order = { k: am ? 'amove' : 'move', path: u.T.air ? [{ x: clamp(tx, 10, G.map.WW - 10), y: clamp(ty, 10, G.map.WH - 10) }] : findPath(u.x, u.y, tx, ty), i: 0 }; if (cap && !u.T.air) u.order.cap = cap;
  });
}
function ownSel() { return G.sel.filter(e => !e.isB && e.team === 0 && !e.T.convoy); }
function clearStanding(u) { u.patrol = null; u.guard = null; u.hold = false; }
function orderSpecial(kind, wx, wy, sx, sy) {
  const us = ownSel(); if (!us.length) return;
  if (kind === 'patrol') { for (const u of us) { clearStanding(u); u.patrol = { a: { x: u.x, y: u.y }, b: { x: wx, y: wy }, next: 'a' }; u.order = null; u.reT = 0; } orderMark(wx, wy, 22, '255,207,90'); sfx('ack_' + us[0].k); }
  else if (kind === 'guard') {
    const t = pick(sx, sy, true) || (b => b && b.team === 0 && b.hp > 0 ? b : null)(pickBld(sx, sy));
    if (!t) { toast('Guard: click one of your own units or structures.', 'bad'); sfx('deny'); return; }
    for (const u of us) if (u !== t) { clearStanding(u); u.guard = t; u.order = null; u.reT = 0; }
    orderMark(t.x, t.y, t.T.r + 16, '120,200,255'); sfx('ack_' + us[0].k);
  }
}
function orderAtk(us, t) {
  const cant = [];
  for (const u of us) { if (canHit(u.T, t)) u.order = { k: 'atk', tgt: t, path: null, i: 0, rp: 0 }; else cant.push(u); }
  if (cant.length) orderMove(cant, t.x, t.y);
}
// what a production line's level gives the units it builds
function lineBonus(b) { const L = b.lvl || 0; return b.k === 'factory' ? { spd: 1 + .1 * L, hp: L >= 2 ? 1.15 : 1, dmg: 1, regen: false } : { spd: L >= 1 ? 1.15 : 1, hp: L >= 1 ? 1.2 : 1, dmg: L >= 2 ? 1.25 : 1, regen: L >= 2 }; }
function lineNext(b) {
  const L = b.lvl || 0;
  if (b.k === 'factory') return tr(L === 0 ? 'Level 2 unlocks Scorcher, Javelin and Bastion and makes units 10% faster.' : L === 1 ? 'Level 3 unlocks Prism and Titan; units get 20% speed and 15% hit points.' : 'All units unlocked: +20% speed, +15% hit points.');
  if (b.k === 'robot') return tr(L === 0 ? 'Level 2 unlocks the Warden; robots get 15% speed and 20% hit points.' : L === 1 ? 'Level 3 unlocks the Arc; robots also get 25% damage and self-repair.' : 'All robots unlocked: +15% speed, +20% hit points, +25% damage, self-repair.');
  return tr(L === 0 ? 'Level 2 unlocks the Swift jet; aircraft get 15% speed and 20% hit points.' : L === 1 ? 'Level 3 unlocks the Anvil bomber; aircraft also get 25% damage and self-repair.' : 'All aircraft unlocked: +15% speed, +20% hit points, +25% damage, self-repair.');
}
function unlocked(b, k) { return (UT[k].tier || 0) <= (b.lvl || 0); }
// some units are limited to a few at a time (the Advancer): units in the field plus ones being built
function limitHit(ti, k) { const m = UT[k] && UT[k].max; if (!m) return false; let n = 0; for (const u of G.units) if (u.team === ti && u.k === k && !u.dead) n++; for (const b of G.blds) if (b.team === ti && b.prod === k && b.paid) n++; return n >= m; }
// an Advancer parked beside a friendly structure: upgrades there cost a quarter less and run at double speed
function onTop(u, b) { return dist(u, b) < b.T.r * .6 + 26; } // the Vanguard works a structure by sitting over its roof
function advNear(b) { return null; } // the Vanguard no longer helps upgrades (it captures and repairs); kept so the upgrade code reads the same
function upMul(b) { return advNear(b) ? .75 : 1; }
function fortCost(b) { return Math.round(250 * upMul(b)); }
// once a second: each side keeps exactly one Vanguard; a lost one is rebuilt on the Core after its timer runs out
function vanguardTick(tm, i) {
  if (G.over || G.noVan) return;
  if (G.units.some(u => u.k === 'adv' && u.team === i && !u.dead)) { tm.advT = 0; return; }
  const hq = G.blds.find(b => b.k === 'hq' && b.team === i && b.hp > 0); if (!hq) return;
  if (tm.advT > 0 && tm.advT <= 30) { tm.advT--; if (tm.advT > 0) return; }
  const u = mkUnit('adv', i, hq.x, hq.y); u.a = u.ta = -Math.PI / 4;
  if (G.t > 3) { part('ring', hq.x, hq.y, 0, 0, .7, 40, '140,210,255', 0, BH.hq + 20); if (i === 0) { toast('A new Vanguard is ready at the Command Core.', 'good'); sfx('ready', hq.x, hq.y); voice('van_ready'); } }
}
// The Vanguard works by sitting over a roof: it captures a neutral or knocked-out structure and repairs a friendly one.
// Being hit stops the work for 3 seconds.
function updAdvancer(u, dt) {
  const tm = G.teams[u.team], hq = G.blds.find(b => b.k === 'hq' && b.team === u.team && b.hp > 0), hurt = G.t - u.lastHit < 3;
  const docked = !!hq && !u.order && dist(u, hq) < 30; u.docked = docked;
  const fb = u.fixB;
  if (fb && !u.order && !hurt && fb.team === u.team && fb.hp > 0 && fb.hp < maxHp(fb)) {
    fb.hp = Math.min(maxHp(fb), fb.hp + 75 * dt);
    if (fb.hp >= maxHp(fb) && u.team === 0) { toast(tr('Vanguard repaired {0}.', fb.k === 'pad' && fb.turret ? TT[fb.turret].name : fb.T.name), 'good'); sfx('build'); voice('van_repaired'); }
  }
  const pb = !u.order ? (u.capB || u.fixB) : null, want = docked ? BH.hq + 14 + (hq.lvl || 0) * 14 : pb ? (pb.k === 'pad' ? 18 : BH[pb.k]) + 36 : AIRH; // it comes down over the roof it is working on
  if (pb && !docked) { const f = Math.min(1, dt * 2.5); u.x += (pb.x - u.x) * f; u.y += (pb.y - u.y) * f; }
  u.alt = u.alt === undefined ? want : u.alt + clamp(want - u.alt, -34 * dt, 34 * dt);
  if (docked) { const f = Math.min(1, dt * 3); u.x += (hq.x - u.x) * f; u.y += (hq.y - u.y) * f; if (u.hp < maxHp(u)) u.hp = Math.min(maxHp(u), u.hp + maxHp(u) * .05 * dt); } // docked: repairs itself
  u.wt = (u.wt || 0) - dt; if (u.wt > 0) return; u.wt = .4;
  let capB = null, fixB = null;
  for (const b of G.blds) { if (!onTop(u, b)) continue; if (capturable(b, u.team)) capB = b; else if (b.team === u.team && b.hp > 0 && (b.k !== 'pad' || b.turret) && b.hp < maxHp(b)) fixB = b; }
  u.capB = capB; u.fixB = capB ? null : fixB; u.stalled = hurt && !!(capB || fixB); u.site = null;
  if (!tm.ai || !hq) return;
  // the computer's Vanguard: come home when hurt, mend a damaged structure at home, otherwise raid the nearest enemy structure now and then
  if (!u.retreat && u.hp < maxHp(u) * .4) { u.retreat = true; u.aiFix = null; orderMove([u], hq.x, hq.y); }
  if (u.retreat) { if (docked && u.hp > maxHp(u) * .9) u.retreat = false; else if (!u.order && !docked) orderMove([u], hq.x, hq.y); return; }
  if (u.aiFix) { const b = u.aiFix; if (b.team !== u.team || b.hp <= 0 || b.hp >= maxHp(b) * .98) u.aiFix = null; else { if (!u.order && !onTop(u, b)) orderMove([u], b.x, b.y); return; } }
  if (u.nextRaid === undefined) u.nextRaid = G.t + (G.diffName === 'easy' ? 300 : G.diffName === 'hard' ? 110 : 170) + rnd() * 60;
  if (docked) {
    const dmg = G.blds.filter(b => b.team === u.team && b.k !== 'hq' && b.k !== 'pad' && b.hp > 0 && b.hp < maxHp(b) * .6 && G.t - b.lastHit > 6).sort((p, q) => p.hp / maxHp(p) - q.hp / maxHp(q))[0];
    if (dmg) { u.aiFix = dmg; orderMove([u], dmg.x, dmg.y); }
    else if (G.t > u.nextRaid) {
      const foes = G.blds.filter(b => hostile(b.team, u.team) && b.hp > 0 && b.k !== 'hq').sort((p, q) => dist(p, u) - dist(q, u)), t = foes[0] || G.blds.find(b => b.k === 'hq' && hostile(b.team, u.team) && b.hp > 0);
      if (t) orderAtk([u], t); u.nextRaid = G.t + 80 + rnd() * 60;
    }
  } else if (!u.order && !u.capB) orderMove([u], hq.x, hq.y);
}
function setProd(b, k) {
  if (k && !unlocked(b, k)) return;
  if (b.prod === k) return;
  if (k && UT[k].max && b.prod && !UT[b.prod].max) b.prevProd = b.prod;
  b.prod = k; b.paid = false; b.pt = 0;
}
function buildTurret(b, k) {
  const tm = G.teams[b.team]; if (b.turret || tm.credits < TT[k].cost) return false;
  tm.credits -= TT[k].cost; b.turret = k; b.hp = TT[k].hp; b.cd = 1; return true;
}
function resMax(tm) { return tm.tech > 0 ? 5 : 3; }
function upCost(l, tm) { return Math.round((300 + 250 * l) * (tm && tm.tech > 0 ? .75 : 1)); }
function buyUp(ti, k) {
  const tm = G.teams[ti], c = upCost(tm[k], tm); if (tm.res || tm[k] >= resMax(tm) || tm.credits < c) return false;
  tm.credits -= c; tm.res = { k, t: 0, dur: upTime(tm[k]) }; return true;
}
function incomeOf(b) { return b.T.income * (1 + .5 * (b.lvl || 0)); }
function lvlMax(b) { return b.k === 'factory' ? (b.ft || 0) : b.k === 'hq' ? 2 : b.k === 'pad' ? (b.turret ? 2 : 0) : b.T.makes ? 2 : b.T.income && b.k !== 'hq' ? 4 : 0; }
function lvlCost(b) { return Math.round((b.k === 'hq' ? 500 + 400 * (b.lvl || 0) : b.k === 'pad' ? TT[b.turret].cost * .6 * ((b.lvl || 0) + 1) : (b.k === 'robot' ? 500 + 300 * (b.lvl || 0) : b.T.makes ? 250 : 200) + 200 * (b.lvl || 0)) * upMul(b)); }
function buildRate(b) { return (1 + .25 * (b.lvl || 0)) * (1 + .3 * Math.min(2, G.teams[b.team].foundry)); }
/* ---------- timed upgrades ---------- */
function upTime(l) { return 5 * (l + 1); } // 5 seconds for the first level, 5 more for each level after
function upgradeBld(b) {
  const tm = G.teams[b.team]; if (b.up || b.hp <= 0 || (b.lvl || 0) >= lvlMax(b) || tm.credits < lvlCost(b)) return false;
  tm.credits -= lvlCost(b); b.up = { kind: 'lvl', t: 0, dur: upTime(b.lvl || 0) }; return true;
}
function fortify(b) {
  const tm = G.teams[b.team]; if (b.up || b.fort || b.k === 'hq' || b.k === 'pad' || b.hp <= 0 || tm.credits < fortCost(b)) return false;
  tm.credits -= fortCost(b); b.up = { kind: 'fort', t: 0, dur: 5 }; return true;
}
function finishUp(b) {
  const u = b.up; b.up = null; if (b.k === 'pad' && !b.turret) return;
  if (u.kind === 'line' || u.kind === 'lineup') { const ln = b.lines && b.lines[u.i]; if (ln) { if (u.kind === 'line') { ln.open = true; ln.on = true; } else ln.lvl++; } part('ring', b.x, b.y, 0, 0, .6, b.T.r + 26, u.kind === 'line' ? '255,200,90' : '110,200,255'); }
  else if (u.kind === 'fort') { b.hp *= 1.6; b.fort = true; part('ring', b.x, b.y, 0, 0, .6, b.T.r + 26, '170,200,230'); }
  else {
    b.lvl = (b.lvl || 0) + 1; part('ring', b.x, b.y, 0, 0, .6, b.T.r + 26, '255,200,90');
    if (b.k === 'pad') b.hp += TT[b.turret].hp * .3;
    if (b.k === 'hq') { b.hp += b.T.hp * .25; if (b.team === 0) toast(tr(b.lvl === 1 ? 'Command Core level {0}: unit limit {1}, Airfield unlocked.' : 'Command Core level {0}: unit limit {1}, Laser Array unlocked.', b.lvl + 1, capOf(0)), 'good'); }
  }
  if (visAt(b.x, b.y)) for (let i = 0; i < 16; i++) { const a = rnd() * TAU; part('dust', b.x + Math.cos(a) * b.T.r, b.y + Math.sin(a) * b.T.r, Math.cos(a) * 46, Math.sin(a) * 46, 1.1 + rnd() * .5, 11, null, 9, 2); }
  if (b.team === 0) { sfx('build'); voice(b.k === 'hq' && u.kind !== 'fort' ? 'core_up' : 'upgraded'); }
}
function updUpgrade(b, dt) {
  const u = b.up, r = b.T.r, hh = b.k === 'pad' ? 16 : BH[b.k]; u.t += dt * (advNear(b) ? 2 : 1);
  if (visAt(b.x, b.y)) {
    if (rnd() < dt * 18) part('dust', b.x + (rnd() - .5) * r * 2.3, b.y + (rnd() - .5) * r * 2.3, (rnd() - .5) * 28, (rnd() - .5) * 28, .9 + rnd() * .7, 7 + rnd() * 7, null, 9 + rnd() * 16, rnd() * hh * .6);
    if (rnd() < dt * 5) { const a = rnd() * TAU, px = b.x + Math.cos(a) * r * .8, py = b.y + Math.sin(a) * r * .8, h = rnd() * hh; part('flash', px, py, 0, 0, .09, 8, null, 0, h); for (let i = 0; i < 4; i++) part('spark', px, py, (rnd() - .5) * 120, (rnd() - .5) * 120, .3, 2, null, 30 + rnd() * 70, h, 260); }
  }
  if (u.t >= u.dur) finishUp(b);
}
function scaffold(b) {
  const h = (b.k === 'pad' ? 18 : BH[b.k]) + 8, r = b.T.r * .97, n = 6, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU + .3, px = b.x + Math.cos(a) * r, py = b.y + Math.sin(a) * r; pts.push([ix(px, py), iy(px, py)]); }
  tI(); ctx.strokeStyle = 'rgba(235,205,130,.8)'; ctx.lineWidth = 1.2; ctx.beginPath();
  for (const q of pts) { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0], q[1] - h); }
  for (const lv of [.34, .67, 1]) for (let i = 0; i < n; i++) { const a = pts[i], c = pts[(i + 1) % n]; ctx.moveTo(a[0], a[1] - h * lv); ctx.lineTo(c[0], c[1] - h * lv); }
  ctx.stroke();
}
/* ---------- weather and ambience ---------- */
const WX = { kind: 'clear', drops: [], birds: [], mist: [], flash: 0, bolt: 15, last: 0 };
function wxInit(m, def) {
  WX.kind = def.weather || 'clear'; WX.flash = 0; WX.bolt = 8 + rnd() * 14; WX.last = performance.now() / 1000;
  WX.drops = Array.from({ length: 170 }, () => ({ x: rnd(), y: rnd(), s: .6 + rnd() * .8 }));
  WX.birds = Array.from({ length: WX.kind === 'rain' ? 1 : 3 }, () => ({ X0: rnd() * (m.IW + 1200), Y: rnd() * m.IW * .5, v: 55 + rnd() * 35, n: 4 + (rnd() * 4 | 0), ph: rnd() * 9 }));
  WX.mist = Array.from({ length: WX.kind === 'dust' ? 3 : 8 }, () => ({ X0: rnd() * (m.IW + 900), Y: rnd() * m.IW * .5, sc: 1.1 + rnd() * 1.2, sp: 3 + rnd() * 5 }));
}
// Everything beyond the game area (scenery, clouds, mist, birds) sinks into the dark together with the ground,
// so nothing is left floating over the empty space outside the map.
function drawEdgeFade(m) {
  const M = m.MG * TILE, B = 9000, w = m.WW, h = m.WH; tG(0, 0, 0);
  const strip = (x0, y0, x1, y1, rx, ry, rw, rh) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(5,8,11,0)'); g.addColorStop(.5, 'rgba(5,8,11,.86)'); g.addColorStop(.8, 'rgba(5,8,11,1)'); g.addColorStop(1, 'rgba(5,8,11,1)'); ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh); };
  strip(0, 0, -M, 0, -M, -M, M, h + 2 * M); strip(w, 0, w + M, 0, w, -M, M, h + 2 * M); strip(0, 0, 0, -M, -M, -M, w + 2 * M, M); strip(0, h, 0, h + M, -M, h, w + 2 * M, M);
  ctx.fillStyle = '#05080b'; ctx.fillRect(-B, -B, B - M + 3, 2 * B + h); ctx.fillRect(w + M - 3, -B, B, 2 * B + h); ctx.fillRect(-M, -B, w + 2 * M, B - M + 3); ctx.fillRect(-M, h + M - 3, w + 2 * M, B);
}
// Animated water. Nothing is drawn as lines: the surface is a soft network of light, like the pattern sunlight makes on
// shallow water, built from cell noise. Two copies at different sizes drift slowly across each other so the network keeps
// changing shape, a much larger layer adds calm lighter and darker patches, and a foam edge breathes along the shore.
const WOC = { c: document.createElement('canvas'), g: null, pA: null, pB: null };
function waterTex(kind) {
  const W2 = 512, H2 = 256, gx = kind ? 5 : 9, gy = kind ? 3 : 5, cwd = W2 / gx, chd = H2 / gy, q = mulberry32(kind ? 71 : 37), pts = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) pts.push([(i + .15 + q() * .7) * cwd, (j + .15 + q() * .7) * chd * 2]); // y is kept in square units, the picture is squashed 2:1 like the ground
  const c = document.createElement('canvas'); c.width = W2; c.height = H2; const g = c.getContext('2d'), img = g.createImageData(W2, H2), d = img.data;
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const P2 = Math.PI * 2, u = x / W2, v = y / H2, amp = kind ? 26 : 15; /* bend the lookup so cell edges become flowing curves, not straight facets */ const xw = ((x + amp * (Math.sin(P2 * (v * 2 + u)) + .6 * Math.sin(P2 * (u * 3 - v * 2) + 1.3) + .35 * Math.sin(P2 * (v * 5 + u * 2) + 2.1))) % W2 + W2) % W2, yv = ((y + amp * .5 * (Math.sin(P2 * (u * 2 - v) + .7) + .6 * Math.sin(P2 * (v * 3 + u * 2) + 2.4) + .35 * Math.sin(P2 * (u * 5 - v) + .4))) % H2 + H2) % H2; const ci = xw / cwd | 0, cj = yv / chd | 0, yy = yv * 2; let f1 = 1e9, f2 = 1e9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + gx) % gx, jj = (cj + dj + gy) % gy, p = pts[jj * gx + ii];
      let dx = p[0] - xw, dy = p[1] - yy; if (dx > W2 / 2) dx -= W2; else if (dx < -W2 / 2) dx += W2; if (dy > H2) dy -= H2 * 2; else if (dy < -H2) dy += H2 * 2;
      const dd = Math.sqrt(dx * dx + dy * dy); if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
    }
    const i4 = (y * W2 + x) * 4;
    if (kind === 0) { const e = 1 - Math.min(1, (f2 - f1) / (cwd * .42)), a = e * e * e * e; d[i4] = 200; d[i4 + 1] = 236; d[i4 + 2] = 255; d[i4 + 3] = a * 105; } // bright where two cells meet: the light network
    else { const t = Math.min(1, f1 / (cwd * .75)), lt = 1 - t; if (lt > .5) { d[i4] = 120; d[i4 + 1] = 205; d[i4 + 2] = 225; d[i4 + 3] = (lt - .5) * 2 * 46; } else { d[i4] = 6; d[i4 + 1] = 30; d[i4 + 2] = 66; d[i4 + 3] = (.5 - lt) * 2 * 60; } } // calm lighter shallows and darker deeps
  }
  g.putImageData(img, 0, 0);
  const o = document.createElement('canvas'); o.width = W2; o.height = H2; const og = o.getContext('2d'); og.filter = 'blur(' + (kind ? 7 : 2.4) + 'px)'; for (const ox of [-W2, 0, W2]) for (const oy of [-H2, 0, H2]) og.drawImage(c, ox, oy); return o; // blurred across the seams so it still tiles
}
function drawWater(m, now, vx0, vx1, vy0, vy1) {
  if (!m.wmask) return; const oc = WOC.c;
  if (!WOC.g) { WOC.g = oc.getContext('2d'); WOC.pA = WOC.g.createPattern(waterTex(0), 'repeat'); WOC.pB = WOC.g.createPattern(waterTex(1), 'repeat'); }
  const g = WOC.g; if (oc.width !== cv.width || oc.height !== cv.height) { oc.width = cv.width; oc.height = cv.height; }
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, oc.width, oc.height);
  const breathe = .5 + .5 * Math.sin(now * .5);
  // [pattern, size, drift x, drift y, strength]
  for (const [pat, sc, dx, dy, al] of [[WOC.pB, 2.4, now * 2.2, now * 1.1, .9], [WOC.pA, .7, now * 3.4, now * 1.5, .26 + .1 * breathe], [WOC.pA, 1.25, -now * 2.3, now * 2.1, .2 + .1 * (1 - breathe)]]) {
    const tw = 512 * sc, th = 256 * sc, ox = ((dx % tw) + tw) % tw, oy = ((dy % th) + th) % th;
    g.setTransform(S * sc, 0, 0, S * sc, CX + ox * S, CY + oy * S); g.globalAlpha = al; g.fillStyle = pat;
    g.fillRect((vx0 - ox) / sc - 520, (vy0 - oy) / sc - 270, (vx1 - vx0) / sc + 1040, (vy1 - vy0) / sc + 540);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.setTransform(S, 0, 0, S, CX, CY); g.imageSmoothingEnabled = true; g.drawImage(m.wmask, -m.offX, -m.offY, m.world.width, m.world.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(oc, 0, 0);
  if (m.wfoam) { tI(); ctx.globalAlpha = .3 + .16 * Math.sin(now * 1.1); ctx.drawImage(m.wfoam, -m.offX, -m.offY, m.world.width, m.world.height); ctx.globalAlpha = 1; } // foam along the shore, slowly breathing
}
function drawMist(m, now, vx0, vx1, vy0, vy1) { // low ground haze drifting the opposite way to the clouds
  const span = m.IW + 900; tI();
  for (const q of WX.mist) { const X = span - (q.X0 + now * q.sp) % span - 450, w = 460 * q.sc; if (X + w < vx0 || X > vx1 || q.Y + w / 2 < vy0 || q.Y > vy1) continue; ctx.globalAlpha = WX.kind === 'rain' ? .16 : .1; ctx.drawImage(SPR.cloud, X, q.Y, w, w / 2); }
  ctx.globalAlpha = 1;
}
function drawBirds(m, now, vx0, vx1, vy0, vy1) {
  const span = m.IW + 1200; tI(); ctx.lineCap = 'round';
  for (const f of WX.birds) {
    const X = (f.X0 + now * f.v) % span - 600, Y = f.Y + Math.sin(now * .3 + f.ph) * 30; if (X < vx0 - 120 || X > vx1 + 120 || Y < vy0 - 60 || Y > vy1 + 260) continue;
    for (let i = 0; i < f.n; i++) {
      const row = (i + 1) >> 1, bx = X - row * 13, by = Y + (i % 2 ? row : -row) * 7, fl = Math.sin(now * 9 + i * 1.7 + f.ph) * 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(bx - 4 + 60, by + 150); ctx.lineTo(bx + 4 + 60, by + 150); ctx.stroke();
      ctx.strokeStyle = 'rgba(28,30,36,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx - 5, by - fl); ctx.lineTo(bx, by); ctx.lineTo(bx - 5, by + 3 + fl * .2); ctx.moveTo(bx, by); ctx.lineTo(bx + 3, by); ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}
function drawScreenFx(now) { // screen-space: time of day, rain, lightning, blowing dust
  const dt = Math.min(.1, now - WX.last); WX.last = now;
  let p = (G.t / 480 + .05) % 1, bell = (c, w) => Math.max(0, 1 - Math.abs(p - c) / w), dusk = Math.max(bell(.5, .1), bell(.93, .07)), night = clamp((p - .52) / .08, 0, 1) * clamp((.94 - p) / .06, 0, 1);
  if (G.def.night) { dusk = 0; night = 1.05; } // a night mission stays dark throughout
  if (dusk > 0) { ctx.fillStyle = `rgba(255,128,50,${dusk * .11})`; ctx.fillRect(0, 0, W, H); }
  if (night > 0) { ctx.fillStyle = `rgba(8,16,52,${night * .3})`; ctx.fillRect(0, 0, W, H); }
  if (WX.kind === 'rain') {
    ctx.fillStyle = 'rgba(28,42,66,.13)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(195,215,240,.3)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const d of WX.drops) { const x = ((d.x + now * .22 * d.s) % 1) * (W + 120) - 60, y = ((d.y + now * 1.9 * d.s) % 1) * (H + 80) - 40; ctx.moveTo(x, y); ctx.lineTo(x - 5 * d.s, y + 17 * d.s); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,230,250,.22)'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const x = rnd() * W, y = 50 + rnd() * (H - 50), r = 2 + rnd() * 3; ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * .5, 0, 0, TAU); } ctx.stroke();
    if (!G.paused) { WX.bolt -= dt; if (WX.bolt <= 0) { WX.bolt = 14 + rnd() * 26; WX.flash = 1; setTimeout(() => sfx('thunder'), 300 + rnd() * 900); } }
    if (WX.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${WX.flash * (.2 + rnd() * .25)})`; ctx.fillRect(0, 0, W, H); WX.flash -= dt * 3.2; }
  } else if (WX.kind === 'dust') {
    ctx.fillStyle = 'rgba(160,118,62,.06)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(214,184,132,.16)'; ctx.lineWidth = 1.3; ctx.beginPath();
    for (const d of WX.drops) { const x = ((d.x + now * .3 * d.s) % 1) * (W + 240) - 120, y = d.y * H + Math.sin(now * 1.3 + d.x * 40) * 12; ctx.moveTo(x, y); ctx.lineTo(x - 30 * d.s, y + 3); }
    ctx.stroke();
  }
}

function usePower(ti, k, x, y) {
  const tm = G.teams[ti], P = PW[k];
  if (P.need && !G.blds.some(b => b.team === ti && b.k === P.need && b.hp > 0)) { if (ti === 0) { sfx('deny'); toast(tr('Needs a working {0}.', BT[P.need].name), 'bad'); } return false; }
  if (tm.pw[k] > 0 || tm.credits < P.cost) { if (ti === 0) { sfx('deny'); toast(tm.pw[k] > 0 ? tr('{0} is recharging.', P.name) : 'Not enough credits.', 'bad'); } return false; }
  tm.credits -= P.cost; tm.pw[k] = P.cd;
  if (k === 'sortie') { launchSortie(ti, x, y); if (ti === 0) voice('sortie'); else if (visAt(x, y)) toast('Enemy fighters inbound!', 'bad'); }
  else if (k === 'laser') { sfx('lasercharge', x, y); G.beams.push({ x, y, team: ti, src: G.blds.find(b => b.team === ti && b.k === 'laser' && b.hp > 0), t: -.8, dur: 2.6 }); if (ti !== 0 && expAt(x, y)) { toast('Enemy laser strike!', 'bad'); sfx('alert'); voice('enemy_laser', true); G.alertPos = { x, y }; G.lastAlert = G.t; } if (ti === 0) voice('laser'); }
  else if (k === 'strike') {
    G.strikes.push({ x, y, team: ti, t: 1.8, n: 6, gap: 0 });
    if (ti === 0) voice('strike'); else if (visAt(x, y)) { toast('Enemy air strike inbound!', 'bad'); sfx('alert'); voice('strike_in', true); }
  } else {
    for (const u of G.units) if (u.team === ti && !u.dead && Math.hypot(u.x - x, u.y - y) < 140) u.hp = Math.min(maxHp(u), u.hp + maxHp(u) * .5);
    for (const b of G.blds) if (b.team === ti && b.hp > 0 && Math.hypot(b.x - x, b.y - y) < 140 + b.T.r) b.hp = Math.min(maxHp(b), b.hp + maxHp(b) * .35);
    part('ring', x, y, 0, 0, .7, 140, '110,230,150'); if (ti === 0) { sfx('cap'); voice('repair'); }
  }
  return true;
}

/* ---------- simulation ---------- */
function tryMove(u, nx, ny) {
  if (u.exit) return; // driving out of a Heavy Factory: nothing pushes it
  const m = G.map; nx = clamp(nx, 8, m.WW - 8); ny = clamp(ny, 8, m.WH - 8);
  if (u.T.air || !passAt(u.x, u.y)) { u.x = nx; u.y = ny; return; }
  for (const b of G.blds) {
    if (b.T.box) { const q = boxOut(b, nx, ny, u.T.r * .55); if (q) { nx = q[0]; ny = q[1]; } continue; }
    const R = b.T.r * (b.k === 'pad' ? .75 : .92) + u.T.r * .55, dx = nx - b.x, dy = ny - b.y;
    if (dx > R || dx < -R || dy > R || dy < -R) continue; const d = Math.hypot(dx, dy); if (d >= R) continue;
    const ang = (d < .01 ? u.a + Math.PI : Math.atan2(dy, dx)) + (u.id & 1 ? .05 : -.05); nx = b.x + Math.cos(ang) * R; ny = b.y + Math.sin(ang) * R; // pushed out to the edge, nudged sideways so it goes round
  }
  if (passAt(nx, ny)) { u.x = nx; u.y = ny; } else if (passAt(nx, u.y)) u.x = nx; else if (passAt(u.x, ny)) u.y = ny;
}
function follow(u, o, dt) {
  const p = o.path; if (!p || o.i >= p.length) return false;
  const wp = p[o.i], dx = wp.x - u.x, dy = wp.y - u.y, d = Math.hypot(dx, dy), last = o.i === p.length - 1;
  if (d < (last ? 9 : 16)) { o.i++; o.best = undefined; return o.i < p.length; }
  if (last && d < 36) { o.near = (o.near || 0) + dt; if (o.near > 1.5) { o.i++; return false; } }
  if (o.best === undefined || d < o.best - 1) { o.best = d; o.stall = 0; } else {
    o.stall += dt;
    if (o.stall > 1.6) { // no progress: blocked beside the goal means "arrived"; blocked far away means find another way round
      o.best = undefined;
      if (last && d < 150) { o.i++; return false; }
      const e = p[p.length - 1]; if (!u.T.air) { o.path = findPath(u.x, u.y, e.x + (rnd() - .5) * 24, e.y + (rnd() - .5) * 24); o.i = 0; }
      return true;
    }
  }
  const want = Math.atan2(dy, dx);
  u.a = turn(u.a, want, Math.max(5.5, u.T.spd / 10) * dt);
  const sp = Math.min(Math.min(u.T.spd * (u.spdM || 1), o.cap || 1e9) * Math.max(.15, Math.cos(angd(u.a, want))) * dt, d);
  tryMove(u, u.x + Math.cos(u.a) * sp, u.y + Math.sin(u.a) * sp);
  u.odo = (u.odo || 0) + sp;
  if (!u.T.air) { if (!u.T.bot && !u.T.wheeled && u.odo - (u.mk || 0) > 7) { u.mk = u.odo; trackMark(u); } if (rnd() < dt * 5 && visAt(u.x, u.y)) part('dust', u.x - Math.cos(u.a) * u.T.r, u.y - Math.sin(u.a) * u.T.r, (rnd() - .5) * 12, (rnd() - .5) * 12, .7, 4 + rnd() * 4, null, 7, 2); }
  return true;
}
function edgeDist(u, e) { return dist(u, e) - (e.isB ? e.T.r * .7 : 0); }
function acquire(u) {
  const T = u.T, o = u.order;
  if (T.unarmed) { u.tgt = null; return; }
  if (o && o.k === 'atk' && targetable(o.tgt) && hostile(o.tgt.team, u.team) && edgeDist(u, o.tgt) <= T.range) { u.tgt = o.tgt; return; }
  let best = null, bd = 1e9;
  for (const e of G.units) { if (e.dead || !hostile(e.team, u.team) || !canHit(T, e)) continue; const d = dist(u, e) + (T.demo ? 70 : 0); if (d < bd) { bd = d; best = e; } }
  for (const b of G.blds) { if (!hostile(b.team, u.team) || b.hp <= 0) continue; const d = edgeDist(u, b); if (d < bd) { bd = d; best = b; } }
  u.tgt = best && bd <= T.range ? best : null;
  if ((!o || o.k === 'amove') && !u.hold && !T.hero) { // the Vanguard never wanders off on its own // idle and attack-moving units engage what comes close, then carry on; units holding position do not chase
    if (best && bd <= T.range + 110) u.order = { k: 'atk', tgt: best, path: null, i: 0, rp: 0, resume: o && o.path && o.path.length ? o.path[o.path.length - 1] : null };
    else if (u.hitBy && targetable(u.hitBy) && hostile(u.hitBy.team, u.team) && canHit(T, u.hitBy) && G.t - u.lastHit < 3) u.order = { k: 'atk', tgt: u.hitBy, path: null, i: 0, rp: 0 };
  }
}
function updUnit(u, dt) {
  const T = u.T; u.flash -= dt; u.think -= dt;
  if (u.exit) { hfDrive(u, dt); return; }
  if (u.life !== undefined && !updFighter(u, dt)) return;
  if (u.hp < maxHp(u) * .4 && rnd() < dt * 5 && visAt(u.x, u.y)) part('smoke', u.x, u.y, (rnd() - .5) * 8, (rnd() - .5) * 8, .9, 4, null, 22, T.air ? AIRH : 10);
  if ((u.rank >= 3 || u.regen) && G.t - u.lastHit > 5 && u.hp < maxHp(u)) u.hp = Math.min(maxHp(u), u.hp + maxHp(u) * .02 * dt);
  if (u.think <= 0) { u.think = .25 + rnd() * .1; acquire(u); }
  if (u.k === 'eng') updEngineer(u, dt); else if (u.k === 'adv') updAdvancer(u, dt);
  if (!u.order && (u.patrol || u.guard) && G.t - (u.reT || 0) > 1) {
    u.reT = G.t;
    if (u.patrol) { const p = u.patrol; p.next = p.next === 'b' ? 'a' : 'b'; orderMove([u], p[p.next].x, p[p.next].y, true); }
    else { const gd = u.guard; if (gd.dead || gd.team !== u.team || (gd.isB && gd.hp <= 0)) u.guard = null; else if (dist(u, gd) > (gd.isB ? gd.T.r + 120 : 95)) orderMove([u], gd.x + (rnd() - .5) * 90, gd.y + (rnd() - .5) * 90, true); }
  }
  const o = u.order;
  if (o) {
    if (o.k === 'atk') {
      const tg = o.tgt;
      if (!targetable(tg) || !hostile(tg.team, u.team)) {
        u.order = null;
        if (tg && tg.isB && (!T.air || T.hero) && capturable(tg, u.team)) orderMove([u], tg.x + (rnd() - .5) * 70, tg.y + (rnd() - .5) * 70);
        else if (o.resume) orderMove([u], o.resume.x + (rnd() - .5) * 50, o.resume.y + (rnd() - .5) * 50, true);
      } else if (edgeDist(u, tg) > T.range * .85) {
        o.rp -= dt;
        if (!o.path || o.rp <= 0 || o.i >= o.path.length) { o.path = T.air ? [{ x: tg.x, y: tg.y }] : findPath(u.x, u.y, tg.x, tg.y); o.i = 0; o.rp = 1.2 + rnd(); }
        follow(u, o, dt);
      }
    } else if (!follow(u, o, dt)) u.order = null;
  }
  u.cd -= dt; const tg = u.tgt;
  if (targetable(tg) && hostile(tg.team, u.team)) {
    const want = Math.atan2(tg.y - u.y, tg.x - u.x);
    if (T.air && !T.temp) { u.a = turn(u.a, want, 4 * dt); u.ta = u.a; } else u.ta = turn(u.ta, want, 8 * dt);
    if (u.cd <= 0 && Math.abs(angd(u.ta, want)) < .3 && edgeDist(u, tg) <= T.range + 14) {
      fire(u, T, tg, u.x + Math.cos(u.ta) * (T.r + 4), u.y + Math.sin(u.ta) * (T.r + 4)); u.cd = T.rof * (u.rank >= 3 ? .8 : 1); u.flash = .07;
    }
  } else { u.tgt = null; u.ta = turn(u.ta, u.a, 4 * dt); }
}
// Engineers mend the most damaged friendly unit or structure within reach; idle ones drive to damage nearby.
function updEngineer(u, dt) {
  u.rt = (u.rt || 0) - dt;
  if (u.rt <= 0) {
    u.rt = .4; let best = null, bf = 1, far = null, ff = .9;
    for (const e of G.units) { if (e === u || e.dead || e.team !== u.team || e.T.temp) continue; const f = e.hp / maxHp(e); if (f >= 1) continue; const d = dist(u, e); if (d < 130 && f < bf) { bf = f; best = e; } else if (d < 460 && f < ff) { ff = f; far = e; } }
    for (const b of G.blds) { if (b.team !== u.team || b.hp <= 0) continue; const f = b.hp / maxHp(b); if (f >= 1) continue; const d = dist(u, b) - b.T.r; if (d < 130 && f < bf) { bf = f; best = b; } else if (d < 460 && f < ff) { ff = f; far = b; } }
    u.fix = best;
    if (!best && far && !u.order && !u.hold && G.t - (u.seekT || 0) > 3) { u.seekT = G.t; orderMove([u], far.x + (rnd() - .5) * 60, far.y + (far.isB ? far.T.r + 30 : 0) + (rnd() - .5) * 40); }
  }
  const f = u.fix;
  if (f) {
    if (f.dead || f.hp <= 0 || f.team !== u.team || f.hp >= maxHp(f)) { u.fix = null; return; }
    f.hp = Math.min(maxHp(f), f.hp + (f.isB ? 30 : 16) * dt);
    if (rnd() < dt * 9 && visAt(f.x, f.y)) part('spark', f.x + (rnd() - .5) * 14, f.y + (rnd() - .5) * 14, (rnd() - .5) * 80, (rnd() - .5) * 80, .25, 2, null, 40 + rnd() * 50, f.isB ? BH[f.k] * .5 : 8, 240);
  }
}
function separate() {
  const us = G.units;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j]; if (!a.T.air !== !b.T.air) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.T.r + b.T.r + 2;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      const d = Math.hypot(dx, dy); if (d >= rr) continue;
      if (d < .01) { tryMove(a, a.x + rnd() - .5, a.y + rnd() - .5); continue; }
      const p = (rr - d) * .3 / d; tryMove(a, a.x - dx * p, a.y - dy * p); tryMove(b, b.x + dx * p, b.y + dy * p);
    }
    if (a.T.air) continue;
    for (const b of G.blds) {
      if (b.T.box) { const q = boxOut(b, a.x, a.y, a.T.r * .6); if (q) tryMove(a, q[0], q[1]); continue; }
      const R = b.T.r * .78 + a.T.r, dx = a.x - b.x, dy = a.y - b.y;
      if (dx > R || dx < -R || dy > R || dy < -R) continue;
      const d = Math.hypot(dx, dy) || .01; if (d < R) { const p = (R - d) * .5 / d; tryMove(a, a.x + dx * p, a.y + dy * p); }
    }
  }
}
function updBld(b, dt) {
  const tm = b.team >= 0 ? G.teams[b.team] : null;
  if (b.up) { if (b.hp <= 0 && b.k !== 'pad' || b.team < 0) b.up = null; else updUpgrade(b, dt); }
  if (tm && b.hp > 0 && b.k !== 'pad' && b.hp < maxHp(b) * .35 && rnd() < dt * 6 && visAt(b.x, b.y)) { const px = b.x + (rnd() - .5) * b.T.r, py = b.y + (rnd() - .5) * b.T.r; part('smoke', px, py, (rnd() - .5) * 8, (rnd() - .5) * 8, 1.5, 7, null, 26, BH[b.k] * .7); if (rnd() < .5) part('fire', px, py, 0, 0, .4, 7, null, 26, BH[b.k] * .6); }
  // tank factory: every unlocked line builds its own model; lines running together each work a little slower
  if (b.lines) {
    if (hfOn(b)) { if (b.T === BT.factory) b.T = HFT || (HFT = Object.assign({}, BT.factory, { r: 62, box: [77, 47] })); hfUpd(b, dt); }
    if (tm && b.k === 'factory' && b.hp > 0 && !(G.noProd && b.team === 0)) {
      let run = 0; for (const ln of b.lines) if (ln.paid) run++;
      const rate = buildRate(b) * LINE_SHARE[run];
      for (const ln of b.lines) {
        if (!ln.open) continue;
        if (!ln.paid) { if (ln.on && tm.count + tm.pend < capOf(b.team)) { ln.paid = true; ln.pt = 0; if (b.engQ > 0) { b.engQ = 0; ln.k = 'eng'; } else ln.k = ln.role + lineCls(b, ln); tm.pend++; } continue; }
        ln.pt += dt * rate;
        if (ln.pt >= UT[ln.k].time) {
          ln.paid = false; ln.pt = 0; tm.count++;
          const gi = hfOn(b) ? b.lines.indexOf(ln) : -1, ex = gi >= 0 ? hfLane(b, gi) : null, out = ex && passAt(ex.x, ex.y1); // a Heavy Factory's tanks drive out of their own gate
          const u = mkUnit(ln.k, b.team, out ? ex.x : b.x + (rnd() - .5) * 16, out ? ex.y0 : b.y + b.T.r * .8), r = b.rally || { x: b.x + (rnd() - .5) * 90, y: b.y + b.T.r + 60 + rnd() * 40 }, rx = r.x + (rnd() - .5) * 30, ry = r.y + (rnd() - .5) * 30;
          if (out) { u.a = u.ta = Math.PI / 2; u.exit = { b, i: gi, x: ex.x, y1: ex.y1, yd: ex.yd, rx, ry, v: 0 }; hfGates(b)[gi].u = u; } else orderMove([u], rx, ry);
          if (b.team === 0) sfx('ready', b.x, b.y);
        }
      }
      b.paid = b.lines.some(l => l.paid);
    } else b.paid = false;
  }
  // production
  if (tm && b.T.makes && b.prod && !(G.noProd && b.team === 0)) {
    const T = UT[b.prod];
    if (!b.paid) { if (tm.count + tm.pend < capOf(b.team) && !limitHit(b.team, b.prod)) { b.paid = true; b.pt = 0; tm.pend++; } } // units are free; only time and the unit limit hold production back
    else {
      b.pt += dt * buildRate(b);
      if (b.pt >= T.time) {
        b.paid = false; b.pt = 0;
        const u = mkUnit(b.prod, b.team, b.x + (rnd() - .5) * 16, b.y + b.T.r * .8), lb = lineBonus(b); tm.count++; if (limitHit(b.team, b.prod)) setProd(b, b.prevProd && unlocked(b, b.prevProd) ? b.prevProd : 'bt0');
        u.spdM = lb.spd; u.hpM = lb.hp; u.dmgM = lb.dmg; u.regen = lb.regen; u.hp = maxHp(u);
        const r = b.rally || { x: b.x + (rnd() - .5) * 90, y: b.y + b.T.r + 60 + rnd() * 40 };
        orderMove([u], r.x + (rnd() - .5) * 30, r.y + (rnd() - .5) * 30);
        if (b.team === 0) sfx('ready', b.x, b.y);
      }
    }
  }
  // weapon
  const w = tm ? (b.k === 'hq' || b.k === 'outpost' ? HQW : b.k === 'pad' && b.turret ? TT[b.turret] : null) : null, rgm = b.k === 'pad' ? 1 + .1 * (b.lvl || 0) : 1;
  if (w && b.hp > 0) {
    b.cd -= dt; b.think -= dt;
    if (b.think <= 0) {
      b.think = .3; let best = null, bd = w.range * rgm;
      for (const u of G.units) { if (u.dead || !hostile(u.team, b.team) || !canHit(w, u)) continue; const d = dist(u, b); if (d < (w.minRange || 0)) continue; if (d < bd) { bd = d; best = u; } }
      b.tgt = best;
    }
    const tg = b.tgt;
    if (tg && !tg.dead) {
      const want = Math.atan2(tg.y - b.y, tg.x - b.x); b.ta = turn(b.ta, want, 6 * dt);
      if (b.cd <= 0 && Math.abs(angd(b.ta, want)) < .3 && dist(b, tg) <= w.range * rgm + 10) { fire(b, w, tg, b.x + Math.cos(b.ta) * 18, b.y + Math.sin(b.ta) * 18); b.cd = w.rof; if (w.salvo) { b.salvo = w.salvo - 1; b.salT = .16; } }
      if (b.salvo > 0) { b.salT -= dt; if (b.salT <= 0) { b.salT = .16; const side = (b.salvo % 2 ? 6 : -6); fire(b, w, tg, b.x + Math.cos(b.ta) * 16 - Math.sin(b.ta) * side, b.y + Math.sin(b.ta) * 16 + Math.cos(b.ta) * side); b.salvo--; } } // the rest of a rocket salvo
    } else if (b.k === 'hq') b.ta += dt * .6; else b.salvo = 0;
  }
  // slow self repair
  if (tm && b.hp > 0 && G.t - b.lastHit > 12) b.hp = Math.min(maxHp(b), b.hp + maxHp(b) * .012 * dt);
  // capture
  if (b.k !== 'hq') {
    let present = -1, n = 0, contested = false; const R = b.T.r + 72;
    for (const u of G.units) {
      if (u.dead || (u.T.air && !u.T.hero) || u.T.convoy) continue; const dx = u.x - b.x, dy = u.y - b.y, cw = u.k === 'eng' ? 3 : 1; // the Vanguard captures from the air, at the speed of one tank
      if (dx > R || dx < -R || dy > R || dy < -R || dx * dx + dy * dy > R * R || (u.T.hero && (!onTop(u, b) || G.t - u.lastHit < 3))) continue;
      if (present === -1) { present = u.team; n = cw; } else if (u.team === present) n += cw; else if (hostile(u.team, present)) contested = true;
    }
    if (present >= 0 && !contested && capturable(b, present)) {
      if (b.capTeam !== present) { b.capTeam = present; b.cap = 0; }
      b.cap += dt * Math.min(n, 6) / 6;
      if (b.cap >= 1) {
        b.team = present; b.cap = 0; b.lastHit = G.t - 6;
        if (b.k === 'pad') { b.hp = 0; b.turret = null; } else b.hp = Math.max(b.hp, b.T.hp * .4);
        resetLines(b); b.paid = false; b.pt = 0; b.rally = null; b.prod = b.T.makes ? (b.T.makes.includes('bt0') ? 'bt0' : b.T.makes[0]) : null;
        if (present === 0) { toast(tr('{0} captured.', b.T.name), 'good'); sfx('cap'); voice('captured'); } else if (expAt(b.x, b.y)) { if (hostile(present, 0)) { toast(tr('{0} captured: {1}.', tr(TEAMC[present].n), b.T.name), 'bad'); voice('enemy_capture'); } else toast(tr('{0} captured: {1}.', tr(TEAMC[present].n), b.T.name), 'good'); }
        part('ring', b.x, b.y, 0, 0, .6, b.T.r + 30, friendly(present, 0) ? '66,165,255' : '255,93,74');
      }
    } else if (b.cap > 0) b.cap = Math.max(0, b.cap - dt * .4);
  }
  // wreck smoke
  if (b.k !== 'pad' && b.hp <= 0) { b.smoke -= dt; if (b.smoke <= 0) { b.smoke = .35; if (visAt(b.x, b.y)) part('smoke', b.x + (rnd() - .5) * b.T.r, b.y + (rnd() - .5) * b.T.r, (rnd() - .5) * 8, (rnd() - .5) * 8, 1.6, 7 + rnd() * 5, null, 24, BH[b.k]); } }
}
function splash(x, y, r, dmg, team, src, hitAir) {
  for (const u of G.units) { if (u.dead || !hostile(u.team, team) || (u.T.air && !hitAir)) continue; const d = Math.hypot(u.x - x, u.y - y); if (d < r + u.T.r) damage(u, dmg * (1 - .5 * d / (r + u.T.r)), src); }
  for (const b of G.blds) { if (!hostile(b.team, team) || b.hp <= 0) continue; const d = Math.hypot(b.x - x, b.y - y); if (d < r + b.T.r * .8) damage(b, dmg, src); }
}
function updShots(dt) {
  for (const s of G.shots) {
    const tg = s.tgt;
    if (s.kind !== 'arty' && tg && !tg.dead && (tg.isB ? tg.hp > 0 : true)) { s.tx = tg.x; s.ty = tg.y; }
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), st = s.spd * dt;
    s.a = Math.atan2(dy, dx);
    if (s.kind === 'missile') { s.tr -= dt; if (s.tr <= 0) { s.tr = .04; if (visAt(s.x, s.y)) part('smoke', s.x, s.y, 0, 0, .45, 3, null, 3, s.h0 + (s.h1 - s.h0) * .5); } }
    if (d <= st + 4) {
      s.done = true;
      if (s.kind === 'arty') { boom(s.tx, s.ty, 1.3); splash(s.tx, s.ty, s.splash, s.dmg * (tg && tg.isB ? 1 : 1), s.team, s.src, false); if (tg && tg.isB && targetable(tg) && hostile(tg.team, s.team) && Math.hypot(tg.x - s.tx, tg.y - s.ty) >= s.splash + tg.T.r * .8) damage(tg, s.dmg, s.src); }
      else {
        if (s.kind === 'flame') { splash(s.tx, s.ty, s.splash, s.dmg, s.team, s.src, false); if (tg && tg.isB && targetable(tg) && hostile(tg.team, s.team) && Math.hypot(tg.x - s.tx, tg.y - s.ty) >= s.splash + tg.T.r * .8) damage(tg, s.dmg, s.src); if (visAt(s.tx, s.ty)) { part('fire', s.tx + (rnd() - .5) * 14, s.ty + (rnd() - .5) * 14, 0, 0, .45, 9, null, 22, 3); if (rnd() < .3) part('smoke', s.tx, s.ty, (rnd() - .5) * 10, (rnd() - .5) * 10, .9, 6, null, 20, 8); } }
        else if (targetable(tg) && hostile(tg.team, s.team)) damage(tg, s.dmg, s.src);
        if (s.kind === 'missile') boom(s.tx, s.ty, .8, s.h1 > 30 ? AIRH : 0);
        else if (s.kind === 'flak') { if (visAt(s.tx, s.ty)) { part('flash', s.tx, s.ty, 0, 0, .1, 14, null, 0, s.h1); for (let i = 0; i < 3; i++) part('smoke', s.tx + (rnd() - .5) * 10, s.ty + (rnd() - .5) * 10, (rnd() - .5) * 14, (rnd() - .5) * 14, .8 + rnd() * .5, 5, null, 5, s.h1); } }
        else if (visAt(s.tx, s.ty)) for (let i = 0; i < (s.kind === 'shell' ? 4 : 2); i++) { const a = rnd() * TAU, v = 40 + rnd() * 80; part('spark', s.tx, s.ty, Math.cos(a) * v, Math.sin(a) * v, .15 + rnd() * .15, 2); }
      }
    } else { s.x += dx / d * st; s.y += dy / d * st; }
  }
  G.shots = G.shots.filter(s => !s.done);
}
function updStrikes(dt) {
  for (const s of G.strikes) {
    if (s.t > 0) { s.t -= dt; if (s.t <= 0) { part('jet', s.x - 700, s.y - 120, 1400, 240, 1, 1); sfx('missile', s.x, s.y); } continue; }
    s.gap -= dt;
    if (s.gap <= 0 && s.n > 0) { s.gap = .14; s.n--; const a = rnd() * TAU, r = rnd() * 70, x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r; boom(x, y, 1.8); splash(x, y, 62, 115, s.team, { team: s.team }, false); }
  }
  G.strikes = G.strikes.filter(s => s.t > 0 || s.n > 0);
}
function updFog() {
  const m = G.map, w = m.w, h = m.h, vis = m.vis, exp = m.exp; vis.fill(0);
  const mark = (x, y, r) => {
    const tx = x / TILE | 0, ty = y / TILE | 0, r2 = r * r + r;
    for (let dy = -r; dy <= r; dy++) { const yy = ty + dy; if (yy < 0 || yy >= h) continue; for (let dx = -r; dx <= r; dx++) { const xx = tx + dx; if (xx < 0 || xx >= w || dx * dx + dy * dy > r2) continue; vis[yy * w + xx] = 1; exp[yy * w + xx] = 1; } }
  };
  for (const u of G.units) if (friendly(u.team, 0) && !u.dead) mark(u.x, u.y, u.T.sight);
  for (const b of G.blds) if (friendly(b.team, 0)) mark(b.x, b.y, b.T.sight);
  if (G.over) { vis.fill(1); exp.fill(1); }
  const d = m.fogImg.data, MG = m.MG; // the margin copies the nearest playable tile so the fog runs smoothly past the edge
  for (let y = 0; y < m.EH; y++) for (let x = 0; x < m.EW; x++) { const i = clamp(y - MG, 0, h - 1) * w + clamp(x - MG, 0, w - 1); d[(y * m.EW + x) * 4 + 3] = vis[i] ? 0 : exp[i] ? 96 : 150; }
  m.fogX.putImageData(m.fogImg, 0, 0);
  const bx = m.fogBX; bx.clearRect(0, 0, m.EW, m.EH); bx.filter = 'blur(1.4px)'; bx.drawImage(m.fogC, 0, 0); bx.filter = 'none';
}

/* ---------- construction, sorties and laser ---------- */
const BUILD = { pad: 100, airfield: 450, laser: 600 }, NEEDL = { robot: 0, airfield: 1, laser: 2 }; // Core level each needs (0 = from the start)
function canPlace(ti, k, x, y) {
  const m = G.map, T = BT[k]; if (x < 48 || y < 48 || x > m.WW - 48 || y > m.WH - 48) return false;
  const tx = x / TILE | 0, ty = y / TILE | 0, cx = (tx + .5) * TILE, cy = (ty + .5) * TILE, R = Math.max(0, Math.round(T.r / TILE * .8));
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (!m.pass[(ty + dy) * m.w + tx + dx]) return false;
  let near = false;
  for (const b of G.blds) { const d = Math.hypot(b.x - cx, b.y - cy); if (d < b.T.r + T.r + 14) return false; if (b.team === ti && b.k !== 'pad' && b.hp > 0 && d < 300) near = true; }
  return near;
}
function buildCap(ti, k) {
  const own = G.blds.filter(b => b.team === ti);
  if (k === 'pad') return own.filter(b => b.k === 'pad').length >= 2 + 2 * own.filter(b => b.k !== 'pad').length ? tr('Turret limit reached. Hold more structures to build more.') : '';
  const need = NEEDL[k] || 0; if (coreLvl(ti) < need) return tr('Upgrade the Command Core to level {0} first.', need + 1);
  return own.some(b => b.k === k) ? tr('You already hold a {0}.', BT[k].name) : '';
}
const turPrice = k => TT[k].cost + 50; // a turret built straight onto the ground: the weapon plus its foundation
function place(ti, k, x, y, tk) {
  const tm = G.teams[ti], cap = buildCap(ti, k), cost = tk ? turPrice(tk) : BUILD[k];
  if (tm.credits < cost || cap || !canPlace(ti, k, x, y)) { if (ti === 0) toast(tm.credits < cost ? 'Not enough credits.' : cap || 'Cannot build there. Pick clear ground near one of your structures.', 'bad'); return null; }
  tm.credits -= cost;
  const b = mkBld({ k, x: x / TILE | 0, y: y / TILE | 0, o: ti }); b.built = true;
  if (tk) { b.turret = tk; b.hp = TT[tk].hp; b.cd = 1; }
  if (k !== 'pad') { b.hp = BT[k].hp * .5; b.lastHit = G.t - 12; tm[k] = (tm[k] || 0) + 1; }
  part('ring', b.x, b.y, 0, 0, .6, b.T.r + 26, '120,255,170'); for (let i = 0; i < 6; i++) part('dust', b.x + (rnd() - .5) * b.T.r, b.y + (rnd() - .5) * b.T.r, (rnd() - .5) * 30, (rnd() - .5) * 30, .9, 8, null, 8, 2);
  return b;
}
function sellTurret(b) { if (!b.turret) return false; G.teams[b.team].credits += Math.round(TT[b.turret].cost * .5); b.turret = null; b.hp = 0; b.lvl = 0; b.up = null; return true; }
function launchSortie(ti, x, y) {
  const base = G.blds.find(b => b.team === ti && b.k === 'airfield' && b.hp > 0); if (!base) return;
  for (let i = 0; i < 3; i++) { const u = mkUnit('fighter', ti, base.x + (i - 1) * 16, base.y + (i - 1) * 10); u.life = 26; u.home = base; u.a = u.ta = Math.atan2(y - base.y, x - base.x); u.order = { k: 'move', path: [{ x: x + (i - 1) * 40, y: y + (i - 1) * 24 }], i: 0 }; }
  sfx('jet', base.x, base.y);
}
function updFighter(u, dt) {
  u.life -= dt;
  if (u.life <= 0 && !u.ret) { u.ret = true; u.tgt = null; u.order = { k: 'move', path: [{ x: u.home.x, y: u.home.y }], i: 0 }; }
  if (u.ret) { if (!u.order || u.order.k !== 'move') { u.dead = true; return false; } return true; }
  // keep moving around the target instead of hovering
  if (u.tgt && (!u.order || u.order.k === 'atk')) { u.orb = (u.orb || 0) - dt; if (u.orb <= 0) { u.orb = 1.3; const a = rnd() * TAU; u.order = { k: 'move', path: [{ x: u.tgt.x + Math.cos(a) * 130, y: u.tgt.y + Math.sin(a) * 130 }], i: 0 }; } }
  return true;
}
function updBeams(dt) {
  for (const b of G.beams) {
    b.t += dt;
    if (b.t > 0 && b.t < b.dur) {
      if (!b.snd) { b.snd = 1; sfx('laser', b.x, b.y); }
      b.acc = (b.acc || 0) - dt;
      if (b.acc <= 0) {
        b.acc = .1; splash(b.x, b.y, 34, 24, b.team, { team: b.team }, true);
        if (visAt(b.x, b.y)) { for (let i = 0; i < 3; i++) { const a = rnd() * TAU, v = 60 + rnd() * 140; part('spark', b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, .25, 2, null, 60 + rnd() * 120, 3); } part('fire', b.x + (rnd() - .5) * 14, b.y + (rnd() - .5) * 14, 0, 0, .4, 9, null, 30, 3); if (rnd() < .5) part('smoke', b.x, b.y, (rnd() - .5) * 10, (rnd() - .5) * 10, 1.4, 7, null, 30, 10); }
        const g = G.map.wg; g.fillStyle = 'rgba(14,10,8,.1)'; g.beginPath(); g.arc(b.x + (rnd() - .5) * 16, b.y + (rnd() - .5) * 16, 10, 0, TAU); g.fill();
      }
    }
  }
  G.beams = G.beams.filter(b => b.t < b.dur && b.src.hp > 0 && b.src.team === b.team);
}
function drawBeams() {
  for (const b of G.beams) {
    if (b.team !== 0 && !visAt(b.x, b.y) && !visAt(b.src.x, b.src.y)) continue;
    const col = b.team === 0 ? '90,200,255' : '255,80,60';
    if (b.t <= 0) { tG(b.x, b.y, 0); ctx.strokeStyle = `rgba(${col},${.5 + .5 * Math.sin(G.t * 20)})`; ctx.lineWidth = 2.5; circ(0, 0, 34); ctx.stroke(); glow(b.src.x, b.src.y, 54, 10 + (b.t + .8) * 22, .9); continue; }
    const X0 = ix(b.src.x, b.src.y), Y0 = iy(b.src.x, b.src.y) - 54, X1 = ix(b.x, b.y), Y1 = iy(b.x, b.y), fl = .75 + rnd() * .25;
    tI(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [w, al] of [[11, .22], [5, .6], [1.8, 1]]) { ctx.strokeStyle = w < 2 ? `rgba(255,255,255,${fl})` : `rgba(${col},${al * fl})`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke(); }
    spr(SPR.glowW, X1, Y1, 22 + rnd() * 10, 1); spr(SPR.glowW, X0, Y0, 16, 1);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
  }
}
function drawModeCursor() {
  const w = s2w(mouse.x, mouse.y);
  if (G.mode.startsWith('b:')) {
    const k = G.mode.slice(2), ok = canPlace(0, k, w.x, w.y), cx = ((w.x / TILE | 0) + .5) * TILE, cy = ((w.y / TILE | 0) + .5) * TILE;
    ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(120,255,170,.22)'; ctx.lineWidth = 1.5;
    for (const b of G.blds) if (b.team === 0 && b.k !== 'pad' && b.hp > 0) { tG(b.x, b.y, 0); circ(0, 0, 300); ctx.stroke(); }
    ctx.setLineDash([]); tG(cx, cy, 0); k === 'pad' ? poly(6, 18, 0) : circ(0, 0, BT[k].r);
    ctx.fillStyle = ok ? 'rgba(110,230,150,.4)' : 'rgba(255,93,74,.4)'; ctx.fill(); ctx.strokeStyle = ok ? 'rgba(110,230,150,.95)' : 'rgba(255,93,74,.95)'; ctx.lineWidth = 2; ctx.stroke();
    if (k === 'pad' && G.tk && TT[G.tk]) { const T = TT[G.tk]; ctx.setLineDash([10, 7]); ctx.strokeStyle = ok ? 'rgba(255,207,90,.85)' : 'rgba(255,93,74,.6)'; ctx.lineWidth = 2; circ(0, 0, T.range); ctx.stroke(); if (T.minRange) { ctx.strokeStyle = 'rgba(255,93,74,.55)'; circ(0, 0, T.minRange); ctx.stroke(); } ctx.setLineDash([]); } // how far it will reach (and the dead zone close in)
    return;
  }
  const R = { strike: 80, repair: 140, sortie: 120, laser: 34, patrol: 18, guard: 18 }[G.mode];
  tG(w.x, w.y, 0); ctx.strokeStyle = G.mode === 'repair' ? 'rgba(110,230,150,.9)' : G.mode === 'laser' ? 'rgba(90,200,255,.95)' : 'rgba(255,93,74,.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]); circ(0, 0, R); ctx.stroke(); ctx.setLineDash([]);
}
function aiBuild(ti) {
  const tm = G.teams[ti], own = G.blds.filter(b => b.team === ti && b.k !== 'pad' && b.hp > 0); if (!own.length) return;
  const tryAt = (k, s) => { for (let i = 0; i < 8; i++) { const a = rnd() * TAU, d = s.T.r + BT[k].r + 40 + rnd() * 120, x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d; if (!buildCap(ti, k) && canPlace(ti, k, x, y)) return place(ti, k, x, y); } return null; };
  const hq = own.find(b => b.k === 'hq') || own[0];
  if (hq.k === 'hq' && G.diffName !== 'easy' && G.t > 150 && (hq.lvl || 0) < (!tm.airfield ? 1 : !tm.laser ? 2 : 0)) { tm.saving = true; upgradeBld(hq); return; }
  tm.saving = G.diffName !== 'easy' && G.t > 150 && (!tm.airfield || !tm.laser);
  if (tm.saving && !tm.airfield) { if (tm.credits >= 470) tryAt('airfield', hq); }
  else if (tm.saving) { if (tm.credits >= 620) tryAt('laser', hq); }
  else if (tm.credits > 330 && rnd() < .07) { const p = tryAt('pad', own[rnd() * own.length | 0]); if (p) buildTurret(p, ['gun', 'cannon', 'missile', 'rocket'][rnd() * 4 | 0]); }
  const foes = G.blds.filter(b => hostile(b.team, ti) && b.hp > 0);
  if (tm.laser && tm.pw.laser <= 0 && tm.credits >= PW.laser.cost + 100 && foes.length && rnd() < .4) { const t = foes[rnd() * foes.length | 0]; usePower(ti, 'laser', t.x, t.y); }
  if (tm.airfield && tm.pw.sortie <= 0 && tm.credits >= PW.sortie.cost + 100 && rnd() < .4) { const us = G.units.filter(u => hostile(u.team, ti) && !u.dead), t = us.length ? us[rnd() * us.length | 0] : foes[0]; if (t) usePower(ti, 'sortie', t.x, t.y); }
}

/* ---------- AI ---------- */
// extra picks for the computer's factories, from a look at the other side's army and defences
function aiCounter(ti) {
  let turrets = 0, armour = 0, light = 0, gunships = 0;
  for (const b of G.blds) if (hostile(b.team, ti) && b.k === 'pad' && b.turret) turrets++;
  for (const u of G.units) { if (u.dead || u.team === ti || u.T.hero) continue; if (u.k === 'bt2' || u.k === 'ar1') armour++; else if (u.k === 'bt0' || u.k === 'eng' || u.k === 'ad1' || u.k === 'ad0') light++; else if (u.k === 'gun') gunships++; }
  const add = [];
  if (turrets >= 3) add.push('ar1', 'ar1', 'ar1'); // siege guns outrange most turrets
  if (armour >= 4) add.push('bt2', 'bt2', 'ar1');
  if (light >= 5) add.push('bt0', 'bt0', 'bt0');
  if (gunships >= 3) add.push('ad1', 'ad0', 'ad0');
  return add;
}
// how well a structure is guarded: units and turrets within reach of it
function guardOf(b, ti) {
  let g = 0; for (const u of G.units) if (!u.dead && hostile(u.team, ti) && !u.T.hero && dist(u, b) < 330) g += u.k === 'bt2' ? 2 : 1;
  for (const p of G.blds) if (hostile(p.team, ti) && p.hp > 0 && (p.k === 'hq' || (p.k === 'pad' && p.turret)) && dist(p, b) < 330) g += p.k === 'hq' ? 4 : 2;
  return g;
}
function aiThink(ti) {
  const tm = G.teams[ti], mine = G.blds.filter(b => b.team === ti), hq = mine.find(b => b.k === 'hq'); if (!hq) return;
  const army = G.units.filter(u => u.team === ti && !u.dead && !u.T.hero);
  for (const b of mine) {
    if (b.k === 'factory') { aiFactory(b, tm); continue; }
    if (b.T.makes) { if (!b.prod || limitHit(ti, b.prod) || rnd() < .12) { if (b.k === 'airpad') { const ap = ['gun', 'gun', 'jet', 'jet', 'bomber'].filter(k => unlocked(b, k)); setProd(b, ap[rnd() * ap.length | 0]); } else { const air = G.units.some(u => hostile(u.team, ti) && u.T.air && !u.T.hero && !u.dead), pool = ['bt0', 'bt0', 'bt0', 'bt0', 'eng', 'ad1', 'ar1', 'ar1', 'bt2', 'bt2', 'bt2', 'fl1', 'en2', 'en2', 'bot', 'bot', 'botl', 'botl'].concat(air ? ['ad0', 'ad0', 'botaa'] : [], aiCounter(ti), TANKS).filter(k => b.T.makes.includes(k) && unlocked(b, k) && !limitHit(ti, k)); setProd(b, pool[rnd() * pool.length | 0]); } } }
    else if (b.k === 'pad' && !b.turret && tm.credits >= 440 && !tm.saving) { const ks = G.units.some(u => hostile(u.team, ti) && u.T.air && !u.T.hero && !u.dead) ? ['flak', 'missile', 'gun'] : ['gun', 'cannon', 'cannon', 'missile', 'arty', 'rocket']; buildTurret(b, ks[rnd() * ks.length | 0]); }
  }
  aiBuild(ti);
  if (!tm.saving && (tm.credits > 700 || (tm.credits > 460 && rnd() < .2))) buyUp(ti, tm.dmgU <= tm.arm ? 'dmgU' : 'arm');
  if (tm.credits > 420 && rnd() < .35) { const u = mine.filter(b => (b.lvl || 0) < lvlMax(b) && b.hp > 0 && !b.up && (!tm.saving || b.k === 'factory')).sort((p, q) => (q.k === 'factory') - (p.k === 'factory'))[0]; if (u) upgradeBld(u); } // production lines first: they unlock better units
  // defend
  const hit = mine.find(b => G.t - b.lastHit < 4 && b.hp > 0) || G.blds.find(b => b.team !== ti && friendly(b.team, ti) && b.hp > 0 && G.t - b.lastHit < 4 && dist(b, hq) < 1500);
  if (hit && targetable(hit.hitBy) && hostile(hit.hitBy.team, ti)) {
    const def = army.filter(u => dist(u, hit) < 900 && (!u.order || u.order.k !== 'atk')).sort((a, b) => dist(a, hit) - dist(b, hit)).slice(0, 8);
    orderAtk(def, hit.hitBy); def.forEach(u => u.busy = G.t + 8);
  }
  // expand with idle ground units
  const idle = army.filter(u => !u.order && !u.T.air && G.t > u.busy);
  if (idle.length >= 2) {
    const lead = idle[0], foeHq = G.blds.find(b => b.k === 'hq' && hostile(b.team, ti)), caps = G.blds.filter(b => b.team === -1 && capturable(b, ti) && G.t - b.claim > 22 && (tm.waves > 0 || !foeHq || dist(b, foeHq) > 760)) /* stay out of the enemy's back yard until the first attack */.sort((a, b) => dist(a, lead) - dist(b, lead));
    if (caps.length) { const c = caps[0]; c.claim = G.t; const squad = idle.sort((a, b) => dist(a, c) - dist(b, c)).slice(0, 3); orderMove(squad, c.x, c.y + c.T.r * .5); squad.forEach(u => u.busy = G.t + 16); }
  }
  // a gathered wave goes in together once its time is up
  if (tm.stage && G.t >= tm.stage.t) { const st = tm.stage; tm.stage = null; const f = st.force.filter(u => !u.dead), t = targetable(st.tgt) && hostile(st.tgt.team, ti) ? st.tgt : G.blds.filter(b => hostile(b.team, ti) && b.hp > 0).sort((a, b) => dist(a, st.tgt) - dist(b, st.tgt))[0]; if (f.length && t) { orderAtk(f, t); f.forEach(u => u.busy = G.t + 30); tm.atk = { force: f, n0: f.length, t0: G.t }; } }
  if (tm.atk) { const a = tm.atk, left = a.force.filter(u => !u.dead); if (!left.length || G.t - a.t0 > 70) tm.atk = null; else if (G.t - a.t0 > 12 && left.length < a.n0 * .35) { orderMove(left, hq.x + (rnd() - .5) * 120, hq.y + 110 + rnd() * 60); left.forEach(u => u.busy = G.t + 14); tm.atk = null; tm.waveT = Math.max(tm.waveT, tm.dif.gap * .7); } } // a beaten wave pulls back instead of dying to the last unit
  // attack wave
  tm.waveT -= tm.dif.think;
  if (army.length >= tm.dif.wave && tm.waveT <= 0 && !tm.stage) {
    const foes = G.blds.filter(b => hostile(b.team, ti) && b.hp > 0);
    const soft = foes.filter(b => b.k !== 'hq'), pool = soft.length && rnd() < .8 ? soft : foes;
    const power = G.teams.map((q, i) => q.alive && hostile(i, ti) ? G.blds.filter(b => b.team === i && b.hp > 0).length * 3 + q.count : -1), lead = power.indexOf(Math.max(...power)), manyFoes = power.filter(p => p >= 0).length > 1;
    const ally = G.teams.find((q, i) => i !== ti && q.alive && friendly(i, ti) && q.stage && targetable(q.stage.tgt)), focus = ally ? ally.stage.tgt : null;
    const sc = b => dist(b, hq) + guardOf(b, ti) * 170 - (manyFoes && b.team === lead ? 320 : 0) - (b === focus ? 600 : 0); pool.sort((a, b) => sc(a) - sc(b)); // near and poorly guarded first; the leader and an ally's target are worth a longer trip
    if (focus && hostile(focus.team, ti) && !pool.includes(focus)) pool.unshift(focus);
    const sp = missionTarget(ti); if (sp) pool.unshift(sp);
    if (pool.length) { const force = army.slice().sort((a, b) => dist(a, pool[0]) - dist(b, pool[0])).slice(0, tm.dif.w0 + tm.dif.wi * (tm.waves || 0)); const tg = pool[0], dd = dist(hq, tg) || 1, sd = Math.min(dd * .55, Math.max(0, dd - 520)), sx = hq.x + (tg.x - hq.x) * sd / dd, sy = hq.y + (tg.y - hq.y) * sd / dd; orderMove(force.filter(u => !u.T.air), sx, sy, true); tm.stage = { t: G.t + 9 + sd / 55, tgt: tg, force }; force.forEach(u => u.busy = G.t + 45); tm.waveT = tm.dif.gap; tm.waves = (tm.waves || 0) + 1; }
  }
  // air strike on player clusters
  if (G.diffName !== 'easy' && tm.pw.strike <= 0 && tm.credits >= PW.strike.cost + 150) {
    const foes = G.units.filter(u => hostile(u.team, ti) && !u.dead && !u.T.air && !u.T.convoy);
    for (let k = 0; k < 4 && foes.length; k++) {
      const c = foes[rnd() * foes.length | 0]; let n = 0; for (const f of foes) if (dist(f, c) < 90) n++;
      if (n >= 4) { usePower(ti, 'strike', c.x, c.y); break; }
    }
  }
}

function update(dt) {
  G.t += dt; for (const tm of G.teams) tm.pend = 0;
  for (const b of G.blds) if (b.team >= 0) { if (b.lines) { for (const l of b.lines) if (l.paid) G.teams[b.team].pend++; } else if (b.paid) G.teams[b.team].pend++; }
  G.teams.forEach((tm, i) => { if (tm.res) { tm.res.t += dt; if (tm.res.t >= tm.res.dur) { tm[tm.res.k]++; if (i === 0) { toast(tr(tm.res.k === 'dmgU' ? 'Weapons research level {0} complete.' : 'Armour research level {0} complete.', tm[tm.res.k]), 'good'); sfx('cap'); voice('research'); } tm.res = null; } } });
  for (const tm of G.teams) { tm.count = 0; for (const k in tm.pw) if (tm.pw[k] > 0) tm.pw[k] = Math.max(0, tm.pw[k] - dt); }
  for (const u of G.units) if (!u.dead && !u.T.temp && !u.T.convoy && !u.T.hero) G.teams[u.team].count++;
  G.incT += dt;
  if (G.incT >= 1) {
    G.incT -= 1; checkObjective();
    G.teams.forEach((tm, i) => { if (!tm.alive) return; vanguardTick(tm, i); let inc = 0; tm.tech = tm.foundry = tm.airfield = tm.laser = 0; for (const b of G.blds) if (b.team === i && b.hp > 0) { if (b.T.income) inc += incomeOf(b); if (b.k === 'tech' || b.k === 'foundry' || b.k === 'airfield' || b.k === 'laser') tm[b.k]++; } if (tm.ai) inc *= tm.dif.inc; tm.income = inc; tm.credits += inc; tm.rpRate = ((G.blds.some(b => b.k === 'hq' && b.team === i && b.hp > 0) ? .2 : 0) + .6 * tm.tech) * (tm.ai ? tm.dif.inc : 1); tm.rp = (tm.rp || 0) + tm.rpRate; });
  }
  for (const u of G.units) if (!u.dead) { try { updUnit(u, dt); } catch (e) { logErr('unit ' + u.k, e); u.order = null; } }
  separate();
  for (const b of G.blds) { try { updBld(b, dt); } catch (e) { logErr('bld ' + b.k, e); } }
  updShots(dt); updStrikes(dt); updFires(dt); updBeams(dt);
  for (const p of G.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.g) { p.vz -= p.g * dt; if (p.z <= 0 && p.vz < 0) { p.z = 0; p.vz *= -.35; p.vx *= .5; p.vy *= .5; } } else if (p.z < 0) p.z = 0; if (p.kind === 'fire' || p.kind === 'spark' || p.kind === 'smoke' || p.kind === 'dust') { p.vx *= .93; p.vy *= .93; } }
  G.parts = G.parts.filter(p => p.life > 0);
  if (G.units.some(u => u.dead)) { G.units = G.units.filter(u => !u.dead); G.sel = G.sel.filter(e => !e.dead); }
  if (!G.over) G.teams.forEach((tm, i) => { if (tm.ai && tm.alive) { tm.aiT -= dt; if (tm.aiT <= 0) { tm.aiT = tm.dif.think; aiThink(i); } } });
  G.visT -= dt; if (G.visT <= 0) { G.visT = .2; updFog(); }
}

/* ---------- drawing (isometric) ---------- */
const K = .75, AIRH = 46, BH = { hq: 46, factory: 24, airpad: 8, refinery: 26, pad: 6, mine: 30, tech: 34, foundry: 30, airfield: 16, laser: 58, outpost: 24, robot: 28 }, SUNX = .7, SUNY = -.35;
let OX = 0, S = 1, CX = 0, CY = 0;
const ix = (x, y) => (x - y) * K + OX, iy = (x, y) => (x + y) * K * .5;
function unIso(X, Y) { X -= OX; return { x: X / (2 * K) + Y / K, y: Y / K - X / (2 * K) }; }
// ground-plane transform: local coordinates are world offsets from (x,y), lifted h pixels
function tG(x, y, h, a) { ctx.setTransform(S * K, S * K * .5, -S * K, S * K * .5, S * ix(x, y) + CX, S * (iy(x, y) - (h || 0)) + CY); if (a) ctx.rotate(a); }
function tI() { ctx.setTransform(S, 0, 0, S, CX, CY); }
function w2s(x, y, h) { const c = G.cam; return { x: (ix(x, y) - ix(c.x, c.y)) * c.z + W / 2, y: (iy(x, y) - (h || 0) - iy(c.x, c.y)) * c.z + H / 2 }; }
// extrude a footprint by drawing it at successive heights; the lower part is shaded darker
function stack(x, y, a, z0, z1, col, fn) {
  const sh = z1 - z0 > 5 ? z0 + (z1 - z0) * .45 : -1;
  for (let h = z0; h <= z1; h += 2) { tG(x, y, h, a); fn(); ctx.fillStyle = col; ctx.fill(); if (h < sh) { ctx.fillStyle = 'rgba(0,0,0,.17)'; ctx.fill(); } }
}
function top(x, y, a, h, fn, col, hi) { tG(x, y, h, a); fn(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = `rgba(255,255,255,${hi === undefined ? .2 : hi})`; ctx.lineWidth = .8; ctx.stroke(); }
// a stroked outline at one height reads as a row of windows or a trim line on the walls
function band(x, y, a, h, fn, col, dash, lw) { tG(x, y, h, a); fn(); ctx.strokeStyle = col; ctx.lineWidth = lw || 2; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); }
function poly(n, r, rot) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = (rot || 0) + i / n * TAU; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function spr(img, X, Y, r, al) { ctx.globalAlpha = al; ctx.drawImage(img, X - r, Y - r, r * 2, r * 2); }
function glow(x, y, h, r, al, img) { tI(); ctx.globalCompositeOperation = 'lighter'; spr(img || SPR.glowW, ix(x, y), iy(x, y) - h, r, al); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
function mast(x, y, h0, h1, col, lw) { tI(); ctx.strokeStyle = col; ctx.lineWidth = lw || 1; ctx.beginPath(); ctx.moveTo(ix(x, y), iy(x, y) - h0); ctx.lineTo(ix(x, y), iy(x, y) - h1); ctx.stroke(); }
// cast shadow: the footprint smeared along the sun direction in proportion to height
function shade(x, y, a, h, fn, al) { ctx.fillStyle = `rgba(0,0,0,${al})`; const n = h > 16 ? 5 : 3; for (let i = 1; i <= n; i++) { const f = i / n * h; tG(x + f * SUNX, y + f * SUNY, 0, a); fn(); ctx.fill(); } }

const SPR = { rocks: null, trees: null }; // rocks, trees, glows and puffs are loaded from assets/ (see loadAssets)
function mkSprites() { // the large cumulus clouds are textures worked out from noise, like the terrain, so they are still made here
  if (SPR.clouds) return;
  // Detailed cumulus clouds, three different ones at 1024x512: big lobes with a flat base, smaller billows along the top,
  // fine puffs at the edges, a blue-grey underside and a lit top-left, all shaded inside the cloud's own outline.
  const bigCloud = seed => {
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), q = mulberry32(seed), puffs = [];
    const lobes = 6 + (q() * 4 | 0), span = 620 + q() * 160, x0 = (W - span) / 2;
    for (let i = 0; i < lobes; i++) { const t = i / (lobes - 1), mid = 1 - Math.abs(t - .5) * 1.5, r = 70 + mid * 70 + q() * 26; puffs.push([x0 + t * span + (q() - .5) * 40, 318 - mid * 46 + (q() - .5) * 20, r]); }
    for (let i = 0; i < 46; i++) { const p = puffs[q() * lobes | 0], a = -Math.PI * (.08 + q() * .84), d = p[2] * (.55 + q() * .5); puffs.push([p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * .85, 26 + q() * 44]); } // billows on the upper side
    const nb = puffs.length; for (let i = 0; i < 90; i++) { const p = puffs[q() * nb | 0], a = -Math.PI * q() * 1.02 + .02, d = p[2] * (.8 + q() * .35); puffs.push([p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * .8, 9 + q() * 20]); } // fine detail at the edge
    const blob = (x, y, r, col, a0, mid) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + col + ',' + a0 + ')'); gr.addColorStop(mid, 'rgba(' + col + ',' + a0 * .82 + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    for (const p of puffs) blob(p[0], p[1], p[2], '255,255,255', 1, .62);
    g.globalCompositeOperation = 'destination-out'; const fl = g.createLinearGradient(0, 345, 0, 400); fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = fl; g.fillRect(0, 345, W, H - 345); // flat, soft base
    g.globalCompositeOperation = 'source-atop';
    const ug = g.createLinearGradient(0, 190, 0, 395); ug.addColorStop(0, 'rgba(120,140,170,0)'); ug.addColorStop(.55, 'rgba(120,140,170,.22)'); ug.addColorStop(1, 'rgba(84,104,138,.62)'); g.fillStyle = ug; g.fillRect(0, 0, W, H); // underside in shade
    for (const p of puffs) if (p[2] > 24) { blob(p[0] + p[2] * .22, p[1] + p[2] * .36, p[2] * .8, '96,116,150', .2, .3); blob(p[0] - p[2] * .28, p[1] - p[2] * .32, p[2] * .62, '255,255,255', .5, .25); } // each billow: shadow below right, light above left
    for (let i = 0; i < 70; i++) { const p = puffs[q() * puffs.length | 0]; blob(p[0] + (q() - .5) * p[2], p[1] + (q() - .5) * p[2], 6 + q() * 16, q() < .5 ? '255,255,255' : '130,150,180', .16, .4); } // wisps
    g.globalCompositeOperation = 'source-over';
    const o = document.createElement('canvas'); o.width = W; o.height = H; const og = o.getContext('2d'); og.filter = 'blur(1.4px)'; og.drawImage(c, 0, 0); return o;
  };
  const cloudShadow = src => { const o = document.createElement('canvas'); o.width = 512; o.height = 256; const g = o.getContext('2d'); g.filter = 'blur(7px)'; g.drawImage(src, 0, 0, 512, 256); g.filter = 'none'; g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256); return o; };
  SPR.clouds = [11, 29, 53].map(bigCloud); SPR.cloudsS = SPR.clouds.map(cloudShadow);
}
function mkProp(x, y, sp, sc) { return { sprite: sp.c, x, y, d: x + y, X: ix(x, y) - sp.ax * sc, Y: iy(x, y) - sp.ay * sc, w: sp.w * sc, h: sp.h * sc }; }

const WRECK = { c: '#44484c', d: '#2a2d30', l: '#5c6166' }, W1 = '#171c22', W2 = '#232a31', WIN = 'rgba(255,214,128,.8)';
/* ---------- assets ----------
   Every drawing in the game is a file under assets/ (see assets/README.md); nothing is drawn from shapes written in this script.
   Models are plan-view SVG files whose shapes carry a height (data-z). The code below loads them, extrudes them into the
   2.5D view and runs the small expressions (data-if, data-rot, data-fill ...) that animate them. */
const ASSETS = { ready: false, dir: 'assets/', models: {}, fail: null }, FLAGS = {}, IC = {}, CUR = {};
function loadText(url) {
  return new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', url);
    x.onload = () => x.status === 200 || (x.status === 0 && x.responseText) ? res(x.responseText) : rej(new Error(url + ' (' + x.status + ')'));
    x.onerror = () => rej(new Error(url)); x.send(); });
}
function svgCanvas(txt, w, h, sc) { // an SVG picture rendered once into a canvas
  return new Promise((res, rej) => { const url = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' })), im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = w * sc; c.height = h * sc; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('an SVG picture could not be drawn')); }; im.src = url; });
}
const svgAttr = (txt, n, d) => { const m = txt.match(new RegExp('<svg[^>]*\\s' + n + '="([^"]*)"')); return m ? m[1] : d; };
// expressions: a plain number stays a number, anything else is compiled once. Inside one, Math's functions and the entity's values are in scope.
const MX = {};
function mExpr(s) { if (s == null) return null; s = s.trim(); if (s !== '' && !isNaN(+s)) return +s; return MX[s] || (MX[s] = new Function('$', 'with(Math){with($){return(' + s + ')}}')); }
const mVal = (v, $) => typeof v === 'function' ? v($) : v;
const mList = s => s == null ? null : s.split(';').map(mExpr);
function mMul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]; }
function mTf(s) { // translate(), rotate() and scale() from an SVG transform attribute
  let M = null; if (!s) return M;
  for (const m of s.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
    const v = m[2].split(/[\s,]+/).filter(Boolean).map(Number), r = v[0] * Math.PI / 180;
    const T = m[1] === 'translate' ? [1, 0, 0, 1, v[0], v[1] || 0] : m[1] === 'rotate' ? [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0] : [v[0], 0, 0, v[1] === undefined ? v[0] : v[1], 0, 0];
    M = M ? mMul(M, T) : T;
  }
  return M;
}
function mPath(el) {
  const g = n => +el.getAttribute(n) || 0, tag = el.tagName; let p = new Path2D();
  if (tag === 'rect') { g('rx') ? p.roundRect(g('x'), g('y'), g('width'), g('height'), g('rx')) : p.rect(g('x'), g('y'), g('width'), g('height')); }
  else if (tag === 'circle') p.arc(g('cx'), g('cy'), g('r'), 0, TAU);
  else if (tag === 'ellipse') p.ellipse(g('cx'), g('cy'), g('rx'), g('ry'), 0, 0, TAU);
  else if (tag === 'line') { p.moveTo(g('x1'), g('y1')); p.lineTo(g('x2'), g('y2')); }
  else if (tag === 'polygon' || tag === 'polyline') { const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); for (let i = 0; i + 1 < v.length; i += 2) i ? p.lineTo(v[i], v[i + 1]) : p.moveTo(v[i], v[i + 1]); if (tag === 'polygon') p.closePath(); }
  else if (tag === 'path') p = new Path2D(el.getAttribute('d') || '');
  else if (tag === 'g') for (const c of el.children) { const t = mTf(c.getAttribute('transform')); p.addPath(mPath(c), t ? new DOMMatrix(t) : undefined); } // several shapes used as one
  return p;
}
function mNode(el, m) {
  const A = n => el.getAttribute(n), tag = el.tagName, cls = ' ' + (A('class') || '') + ' ', has = c => cls.includes(' ' + c + ' ');
  if (/^(defs|style|title|desc|metadata)$/.test(tag)) return null;
  if (has('anchor')) { m.anchors[A('id')] = [+A('cx'), +A('cy')]; return null; }
  const n = { cond: mExpr(A('data-if')), tf: mTf(A('transform')), move: mList(A('data-move')), rot: mExpr(A('data-rot')), scale: mExpr(A('data-scale')), lift: mExpr(A('data-lift')), kids: null, shadow: null };
  if (tag === 'g' && !has('solid') && !has('shadow')) { n.kids = [...el.children].map(c => mNode(c, m)).filter(Boolean); return n; }
  const col = k => { const d = A('data-' + k), s = A(k); return d ? mExpr(d) : s === 'none' ? null : s == null ? (k === 'fill' ? '#000' : null) : s; };
  n.z = mList(A('data-z') || '0'); n.alpha = A('opacity') == null ? 1 : +A('opacity'); n.dalpha = mExpr(A('data-alpha'));
  n.fill = col('fill'); n.stroke = col('stroke'); n.lw = A('data-lw') ? mExpr(A('data-lw')) : +(A('stroke-width') || 1);
  n.dash = A('data-dash') ? mList(A('data-dash')) : A('stroke-dasharray') ? A('stroke-dasharray').trim().split(/[\s,]+/).map(Number) : null; n.doff = mExpr(A('data-dashoffset'));
  const g = k => +A(k) || 0;
  if (has('shadow')) { n.shadow = A('data-shadow') || 'cast'; n.off = mList(A('data-off')); n.path = mPath(el); }
  else if (has('glow')) { n.kind = 'glow'; n.cx = g('cx'); n.cy = g('cy'); n.r = A('data-r') ? mExpr(A('data-r')) : g('r'); n.glow = A('data-glow') || 'W'; }
  else if (has('strut') || has('tube')) { n.kind = has('tube') ? 'tube' : 'strut'; n.p = [g('x1'), g('y1'), g('x2'), g('y2')]; n.lite = A('data-lite'); }
  else if (has('disc')) { n.kind = 'disc'; n.cx = g('cx'); n.cy = g('cy'); n.r = g('r'); n.sx = mExpr(A('data-sx')); }
  else if (has('billboard')) { n.kind = 'board'; const at = (A('data-at') || '0;0').split(';').map(Number); n.cx = at[0]; n.cy = at[1]; n.pts = A('points').trim().split(/[\s,]+/).map(Number); }
  else if (has('taper')) { n.kind = 'taper'; const tp = A('data-taper').trim().split(/\s+/).map(Number), tf = A('data-top-fill') || '#888';
    n.b = tag === 'circle' ? [g('cx'), g('cy'), g('r')] : [g('x'), g('y'), g('width'), g('height'), g('rx')]; n.tp = tp; n.topFill = /^(#|rgb)/.test(tf) ? tf : mExpr(tf); }
  else { n.kind = 'shape'; n.path = mPath(el); }
  return n;
}
function mCompile(txt, name) {
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml'); if (doc.querySelector('parsererror')) throw new Error('assets/' + name + ' is not valid SVG');
  const m = { name, anchors: {} }; m.root = { cond: null, tf: null, move: null, rot: null, scale: null, lift: null, shadow: null, kids: [...doc.documentElement.children].map(c => mNode(c, m)).filter(Boolean) };
  return m;
}
const MI = [1, 0, 0, 1, 0, 0], GLOWK = { W: 'glowW', R: 'glowR', O: 'glowO' };
// ground-plane transform at world point (x,y), lifted h, followed by the model's own plan transform
function mSet(x, y, h, M) { ctx.setTransform(S * K, S * K * .5, -S * K, S * K * .5, S * ix(x, y) + CX, S * (iy(x, y) - h) + CY); ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]); }
// Draw a model at a world point. $ holds the values its expressions may use; shadow = true draws only its shadow shapes.
function drawModel(m, x, y, $, shadow) { $.t = G.t; $.rnd = rnd; mDraw(m.root, MI, x, y, 0, $, !!shadow); }
function mDraw(n, M, x, y, zo, $, sh) {
  if (n.cond !== null && !mVal(n.cond, $)) return;
  if (n.tf) M = mMul(M, n.tf);
  if (n.move) M = mMul(M, [1, 0, 0, 1, mVal(n.move[0], $), mVal(n.move[1], $)]);
  if (n.rot !== null) { const r = mVal(n.rot, $), c = Math.cos(r), s = Math.sin(r); M = mMul(M, [c, s, -s, c, 0, 0]); }
  if (n.lift !== null) zo += mVal(n.lift, $);
  if (n.kids) { for (const k of n.kids) mDraw(k, M, x, y, zo, $, sh); return; }
  if (!!n.shadow !== sh) return;
  if (sh) { // shadows lie on the ground: 'cast' is smeared away from the sun by its height, 'flat' is a plain patch (under an aircraft when it has a height)
    const h = mVal(n.z[0], $); ctx.fillStyle = n.fill;
    if (n.shadow === 'cast') { const k = h > 16 ? 5 : 3; for (let i = 1; i <= k; i++) { const q = i / k * h; mSet(x + q * SUNX, y + q * SUNY, 0, M); ctx.fill(n.path); } }
    else { mSet(x + (n.off ? mVal(n.off[0], $) : 0) + h * SUNX, y + (n.off ? mVal(n.off[1], $) : 0) + h * SUNY, 0, M); ctx.fill(n.path); }
    return;
  }
  const al = n.alpha * (n.dalpha === null ? 1 : mVal(n.dalpha, $)); if (!(al > 0)) return;
  const z0 = mVal(n.z[0], $) + zo, kind = n.kind, wx = (px, py) => x + M[0] * px + M[2] * py + M[4], wy = (px, py) => y + M[1] * px + M[3] * py + M[5];
  if (kind === 'glow') { glow(wx(n.cx, n.cy), wy(n.cx, n.cy), z0, mVal(n.r, $), Math.min(1, al), n.glow === 'T' ? ($.team > 0 ? SPR.glowR : SPR.glowW) : SPR[GLOWK[n.glow]]); return; }
  if (kind === 'tube' || kind === 'strut') {
    const p = n.p, a = [wx(p[0], p[1]), wy(p[0], p[1])], b = [wx(p[2], p[3]), wy(p[2], p[3])], z1 = n.z.length > 1 ? mVal(n.z[1], $) + zo : z0, lw = mVal(n.lw, $), col = mVal(n.stroke, $);
    if (kind === 'tube') { tubeW(a, z0, b, z1, lw, col, n.lite); return; }
    tI(); ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = lw; if (n.dash) { ctx.setLineDash(n.dash.map(d => mVal(d, $))); if (n.doff !== null) ctx.lineDashOffset = mVal(n.doff, $); }
    ctx.beginPath(); ctx.moveTo(ix(a[0], a[1]), iy(a[0], a[1]) - z0); ctx.lineTo(ix(b[0], b[1]), iy(b[0], b[1]) - z1); ctx.stroke();
    if (n.dash) { ctx.setLineDash([]); ctx.lineDashOffset = 0; } ctx.globalAlpha = 1; return;
  }
  const fill = mVal(n.fill, $);
  if (kind === 'disc' || kind === 'board') { // drawn upright, facing the camera
    const X = ix(wx(n.cx, n.cy), wy(n.cx, n.cy)), Y = iy(wx(n.cx, n.cy), wy(n.cx, n.cy)) - z0; tI(); ctx.globalAlpha = al; ctx.fillStyle = fill; ctx.beginPath();
    if (kind === 'disc') ctx.ellipse(X, Y, n.r * (n.sx === null ? 1 : mVal(n.sx, $)), n.r, 0, 0, TAU);
    else { const r = n.rot === null ? 0 : mVal(n.rot, $), c = Math.cos(r), s = Math.sin(r), v = n.pts; for (let i = 0; i + 1 < v.length; i += 2) { const px = X + v[i] * c - v[i + 1] * s, py = Y + v[i] * s + v[i + 1] * c; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
    ctx.fill(); ctx.globalAlpha = 1; return;
  }
  ctx.globalAlpha = al;
  if (kind === 'taper') { // narrows as it rises, lower half shaded, lit top face
    const z1 = mVal(n.z[1], $) + zo, b = n.b, tp = n.tp, mix = (i, t) => b[i] + (tp[i] - b[i]) * t;
    const shp = t => { ctx.beginPath(); if (b.length === 3) ctx.arc(b[0], b[1], b[2] + (tp[0] - b[2]) * t, 0, TAU); else ctx.roundRect(mix(0, t), mix(1, t), mix(2, t), mix(3, t), mix(4, t)); };
    for (let h = z0; h < z1; h += 1) { const t = (h - z0) / (z1 - z0); mSet(x, y, h, M); shp(t); ctx.fillStyle = fill; ctx.fill(); if (t < .5) { ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fill(); } }
    mSet(x, y, z1, M); shp(1); ctx.fillStyle = mVal(n.topFill, $); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = .7; ctx.stroke(); ctx.globalAlpha = 1; return;
  }
  const sc = n.scale === null ? 1 : mVal(n.scale, $), path = n.path;
  if (n.z.length > 1) { // extruded: the outline is drawn at successive heights, the lower part darker
    const z1 = mVal(n.z[1], $) + zo, dark = z1 - z0 > 5 ? z0 + (z1 - z0) * .45 : -1e9;
    for (let h = z0; h <= z1; h += 2) { mSet(x, y, h, M); if (sc !== 1) ctx.scale(sc, sc); ctx.fillStyle = fill; ctx.fill(path); if (h < dark) { ctx.fillStyle = 'rgba(0,0,0,.17)'; ctx.fill(path); } }
  } else {
    mSet(x, y, z0, M); if (sc !== 1) ctx.scale(sc, sc);
    if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
    if (n.stroke) { ctx.strokeStyle = mVal(n.stroke, $); ctx.lineWidth = mVal(n.lw, $) / sc; if (n.dash) { ctx.setLineDash(n.dash.map(d => mVal(d, $) / sc)); if (n.doff !== null) ctx.lineDashOffset = mVal(n.doff, $) / sc; } ctx.stroke(path); if (n.dash) { ctx.setLineDash([]); ctx.lineDashOffset = 0; } }
  }
  ctx.globalAlpha = 1;
}
async function loadAssets() {
  const D = ASSETS.dir, mf = JSON.parse(await loadText(D + 'manifest.json')), jobs = [], get = (p, fn) => jobs.push(loadText(D + p).then(fn));
  for (const cat of ['buildings', 'turrets', 'units']) for (const k of mf[cat]) get(cat + '/' + k + '/model.svg', t => { ASSETS.models[cat + '/' + k] = mCompile(t, cat + '/' + k); });
  const sprite = t => { const w = +svgAttr(t, 'width', 64), h = +svgAttr(t, 'height', 64); return svgCanvas(t, w, h, 2).then(c => ({ c, w, h, ax: +svgAttr(t, 'data-ax', w / 2), ay: +svgAttr(t, 'data-ay', h) })); };
  for (const kind of ['rocks', 'trees']) { SPR[kind] = []; mf.props[kind].forEach((k, i) => get('props/' + k + '/sprite.svg', t => sprite(t).then(s => { SPR[kind][i] = s; }))); }
  for (const k in mf.fx) get('fx/' + mf.fx[k] + '/sprite.svg', t => svgCanvas(t, +svgAttr(t, 'width', 64), +svgAttr(t, 'height', 64), 1).then(c => { SPR[k] = c; }));
  // flags: national ones as drawn; the two team flags take their colours from the team (classes tc, td, tl in the file)
  const tint = (t, tc) => t.replace('</svg>', '<style>.tc{fill:' + tc.c + '}.td{fill:' + tc.d + '}.tl{fill:' + tc.l + '}</style></svg>'), flag = (id, t) => svgCanvas(t, 72, 48, 1).then(c => { FLAGS[id] = c; });
  for (const k of mf.flags) get('flags/' + k + '/flag.svg', t => k === 'team' ? Promise.all(TEAMC.map((tc, i) => flag('t' + i, tint(t, tc)))) : flag(k, k === 'crimson' ? tint(t, TEAMC[1]) : t));
  for (const k of mf.icons) get('ui/icons/' + k + '/icon.svg', t => { IC[k] = t.trim().replace('<svg', '<svg class="ic" aria-hidden="true"'); });
  for (const k of mf.cursors) get('ui/cursors/' + k + '/cursor.svg', t => { CUR[k] = 'url("data:image/svg+xml,' + encodeURIComponent(t.trim()) + '") ' + svgAttr(t, 'data-hot', '16 16') + ', crosshair'; });
  await Promise.all(jobs);
}
const mkFlag = id => FLAGS[id] || FLAGS.t0;
// Flags flown beside each Command Core, drawn from assets/flags.
function drawFlag(x, y, id, t) {
  const img = mkFlag(id), X = ix(x, y), Y = iy(x, y), Hp = 46, w = 25, h = 16.5, n = 11; tI();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(X + 4, Y + 1, 5, 2.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#39424c'; ctx.fillRect(X - 3, Y - 3, 6, 4);
  ctx.strokeStyle = '#c9d1d9'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y - Hp); ctx.stroke();
  ctx.fillStyle = '#ffcf5a'; circ(X, Y - Hp - 1.5, 1.8); ctx.fill();
  for (let i = 0; i < n; i++) { // cloth drawn in strips so it ripples away from the pole
    const f = i / n, ph = t * 4.2 - i * .72, dy = Math.sin(ph) * 1.9 * f, sx = X + 1 + i * w / n;
    ctx.drawImage(img, i * 72 / n, 0, 72 / n, 48, sx, Y - Hp + 2 + dy, w / n + .7, h);
    const sh = Math.cos(ph) * f; ctx.fillStyle = sh > 0 ? `rgba(0,0,0,${sh * .16})` : `rgba(255,255,255,${-sh * .1})`; ctx.fillRect(sx, Y - Hp + 2 + dy, w / n + .7, h);
  }
}
// what a structure's model may read: its colours, level and state
function bldVars(b) {
  const wreck = b.k !== 'pad' && b.hp <= 0, live = !wreck && b.team >= 0, tm = live ? G.teams[b.team] : null, pw = tm && tm.pw;
  return { tc: wreck ? WRECK : b.team >= 0 ? TEAMC[b.team] : NEUT, L: b.lvl || 0, live, wreck, fort: !!b.fort, paid: !!b.paid, alive: b.hp > 0, ta: b.ta || 0, team: b.team, turret: !!b.turret, fresh: (b.cd || 0) < .6,
    adv: b.k === 'hq' && live && tm.advT > 0 && !G.noVan ? 1 - clamp(tm.advT / 30, 0, 1) : -1, // progress of a Vanguard being rebuilt, or -1
    ready: !!pw && pw[b.k === 'laser' ? 'laser' : 'sortie'] <= 0, firing: b.k === 'laser' && G.beams.some(q => q.src === b && q.t > 0) };
}
function bldShadow(b) { if (hfOn(b) && b.hf && b.hf.pic.top) return hfShadow(b); drawModel(ASSETS.models['buildings/' + b.k], b.x, b.y, bldVars(b), true); }
/* ---------- Heavy Tank Factory ----------
   Its model (assets/buildings/heavy-factory/heavy-factory.js, global HeavyFactory) is a self-animating SVG. One copy per factory
   runs off-screen and is copied into pictures: the ground plate, the structure (redrawn several times a second for its fans,
   radar and smoke) and one pair of door leaves. The game itself moves the doors and the tank every frame: a finished tank is a
   real unit that starts inside its bay and drives out through the gate, cut off where the walls hide it.
   The model's 30-degree projection is stretched to the map's 2:1 one. Model point (mx, my, mz) is world (b.x + (mx - W/2) * K,
   b.y + (my - D/2) * K) at height mz * K * .75. */
const HF = { g: null, list: [], K: .5, RES: 1, MS: 50, OPEN: .9, SPD: 30, IN: 122, OUT: 246 }; // K: model units to world pixels. RES: picture pixels per model unit. MS: milliseconds between pictures of the structure. OPEN: seconds a door takes. SPD: speed of a tank leaving. IN, OUT: where it starts and stops (model y)
let HFT = null; // a Heavy Factory is larger than the other factories and is walked round as a box
const hfOn = b => b.k === 'factory' && b.ft === 2 && typeof HeavyFactory !== 'undefined';
const hfGates = b => b.gates || (b.gates = [0, 1, 2].map(() => ({ door: 0, u: null }))); // door: 0 shut … 1 open. u: the tank driving out
function hfLane(b, i) { const d = HeavyFactory.dims, y = m => b.y + (m - d.D / 2) * HF.K; return { x: b.x + (d.GX[i] - d.W / 2) * HF.K, y0: y(HF.IN), y1: y(HF.OUT), yd: y(d.D) }; } // the way out of gate i, on the map
// pushes a point out of a box-shaped structure, sliding it towards the nearer corner so units go round
function boxOut(b, x, y, m) {
  const hx = b.T.box[0] + m, hy = b.T.box[1] + m, dx = x - b.x, dy = y - b.y; if (dx >= hx || dx <= -hx || dy >= hy || dy <= -hy) return null;
  const px = hx - Math.abs(dx), py = hy - Math.abs(dy);
  return px < py ? [b.x + (dx < 0 ? -hx : hx), y + (dy < 0 ? -px : px)] : [x + (dx < 0 ? -py : py), b.y + (dy < 0 ? -hy : hy)];
}
function hfUpd(b, dt) { // doors: open just before a tank is finished, shut once its tail is clear
  const gs = hfGates(b), live = b.hp > 0 && b.team >= 0; let run = 0; for (const ln of b.lines) if (ln.paid) run++;
  const rate = live ? buildRate(b) * LINE_SHARE[run] : 1;
  b.lines.forEach((ln, i) => {
    const g = gs[i]; if (g.u && (g.u.dead || !g.u.exit)) g.u = null;
    const want = g.u ? !g.u.exit.clear : live && ln.paid && (UT[ln.k].time - ln.pt) / rate <= HF.OPEN + .1;
    g.door = clamp(g.door + (want ? dt : -dt) / HF.OPEN, 0, 1);
  });
}
function hfDrive(u, dt) { // a new tank drives straight out of its bay, then goes to the rally point
  const e = u.exit, g = e.b.gates && e.b.gates[e.i];
  if (e.go || !g || g.door >= 1) { e.go = 1; e.v = Math.min(HF.SPD, e.v + HF.SPD * 1.6 * dt); const s = Math.min(e.v * dt, e.y1 - u.y); u.y += s; u.odo = (u.odo || 0) + s; }
  u.x = e.x; u.a = u.ta = Math.PI / 2; e.clear = u.y - u.T.r > e.yd + 2;
  if (u.y >= e.y1 - .01) { u.exit = null; if (!u.order) orderMove([u], e.rx, e.ry); }
}
function hfPic(v, key, keep, prep, done) { // a picture of the model's parts that keep() accepts
  const el = v.f.element.cloneNode(true), gen = v.gen, w = Math.ceil(+el.getAttribute('width')), h = Math.ceil(+el.getAttribute('height'));
  for (const p of el.querySelectorAll('[data-part]')) if (!keep(p.getAttribute('data-part'))) p.remove();
  if (key !== 'top') el.querySelector('.smoke').remove(); if (prep) prep(el);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml' })), im = new Image();
  im.onload = () => {
    URL.revokeObjectURL(url); if (done) done(); if (gen !== v.gen) return;
    let c = v.pic[key]; if (!c || c.width !== w || c.height !== h) { c = document.createElement('canvas'); c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.clearRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h); const a = v.f.anchor(); v.ax = a.x; v.ay = a.y; v.pic[key] = c;
  };
  im.onerror = () => { URL.revokeObjectURL(url); if (done) done(); }; im.src = url;
}
function hfLamps(b, v, el) { // a working gate: amber warning lamps and a lit strip, as in the model's own cycle
  if (!b.gates || b.hp <= 0) return; const blink = Math.sin(performance.now() / 100) > 0;
  b.gates.forEach((g, i) => {
    if (i >= v.lines || !(g.door > 0 || g.u)) return;
    for (const l of el.querySelectorAll('[data-lamp="' + i + '"]')) l.setAttribute('fill', blink ? '#ffb020' : '#5a3a00');
    for (const l of el.querySelectorAll('[data-bar="' + i + '"]')) l.setAttribute('opacity', blink ? '1' : '.3');
    for (const l of el.querySelectorAll('[data-strip="' + i + '"]')) l.setAttribute('opacity', '1');
  });
}
function hfSync(b) { // the factory's model and pictures, kept up to date
  if (HF.g !== G) { for (const q of HF.list) q.f.destroy(); HF.list = []; HF.g = G; } // a new battle: stop the old models
  const team = (b.team >= 0 ? TEAMC[b.team] : NEUT).c, lines = Math.max(1, b.lines.filter(l => l.open).length), wreck = b.hp <= 0; let v = b.hf;
  if (!v) { v = b.hf = { team, lines, pic: {}, gen: 0, busy: 0, at: 0, need: true }; v.f = HeavyFactory.create(document.createElement('div'), { lines, facing: 0, team, scale: HF.RES, fadeOutTank: true }); HF.list.push(v); }
  else if (!wreck && (team !== v.team || lines !== v.lines)) { if (team !== v.team) v.f.setTeam(v.team = team); if (lines !== v.lines) v.f.setLines(v.lines = lines); v.gen++; v.need = true; v.busy = 0; } // locked lines keep their gates sealed
  const now = performance.now();
  if (v.need) { v.need = false; v.at = 0; hfPic(v, 'gnd', id => id === 'pad'); hfPic(v, 'dl', id => id === 'doorL0'); hfPic(v, 'dr', id => id === 'doorR0'); }
  if (!v.busy && (!v.at || (!wreck && !G.paused && now - v.at > HF.MS))) { v.at = now; v.busy = 1; hfPic(v, 'top', id => id !== 'pad' && !/^(door|tank)/.test(id), el => hfLamps(b, v, el), () => { v.busy = 0; }); } // a wreck or a paused game keeps its last picture
  return v;
}
function hfBlit(b, v, c, dx) { // dx: moved along the model's x axis, in model units
  const sx = HF.K * .75 / .8660254 / HF.RES, sy = HF.K * .375 / .5 / HF.RES, o = (dx || 0) * HF.K;
  ctx.drawImage(c, ix(b.x, b.y) - v.ax * sx + o * .75, iy(b.x, b.y) - v.ay * sy + o * .375, c.width * sx, c.height * sy);
}
function hfPath(b, pts) { // an outline given in model coordinates
  const d = HeavyFactory.dims; ctx.beginPath();
  pts.forEach((q, i) => { const x = b.x + (q[0] - d.W / 2) * HF.K, y = b.y + (q[1] - d.D / 2) * HF.K, X = ix(x, y), Y = iy(x, y) - q[2] * HF.K * .75; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath();
}
function hfGround(b) { const v = hfSync(b); if (!v.pic.gnd) return; tI(); if (b.hp <= 0) ctx.filter = 'grayscale(1) brightness(.9) contrast(.85)'; hfBlit(b, v, v.pic.gnd); ctx.filter = 'none'; } // the plate it stands on, under everything
function hfShadow(b) { shade(b.x, b.y, 0, 34, () => { ctx.beginPath(); ctx.rect(-75, -45, 150, 90); }, .07); }
function drawHeavy(b) { // false until the pictures are ready
  const v = hfSync(b), P = v.pic; if (!P.top || !P.dl || !P.dr || !P.gnd) return false;
  const d = HeavyFactory.dims, GW = d.GW, GH = d.GH, D = d.D, gs = hfGates(b), wreck = b.hp <= 0, grey = 'grayscale(1) brightness(.9) contrast(.85)';
  tI(); if (wreck) ctx.filter = grey; hfBlit(b, v, P.top); ctx.filter = 'none';
  for (let i = 0; i < v.lines; i++) {
    const g = gs[i], gx = d.GX[i], u = g.u;
    if (g.door < 1) { // the two leaves slide apart into the walls; only what shows through the gateway is drawn
      ctx.save(); tI(); hfPath(b, [[gx - GW, D - 1, 0], [gx - GW, D - 1, GH - 7], [gx + GW, D + 6, GH], [gx + GW, D + 6, 7]]); ctx.clip(); if (wreck) ctx.filter = grey;
      hfBlit(b, v, P.dl, gx - d.GX[0] - GW * g.door); hfBlit(b, v, P.dr, gx - d.GX[0] + GW * g.door); ctx.restore();
    }
    if (u && u.exit && !u.dead && seen(u)) { // the tank: inside the bay it shows only through the gateway, under the lintel
      const B = 600, p = D + 6; ctx.save(); tI(); hfPath(b, [[gx + GW, p, GH], [gx - B, p, GH], [gx - B, p, -B], [gx + B, p, -B], [gx + B, p, 0], [gx + GW, p, 0]]); ctx.clip();
      unitShadow(u); drawUnit(u); ctx.restore();
    }
  }
  tI(); return true;
}
function drawBld(b) {
  if (hfOn(b) && drawHeavy(b)) return;
  const m = ASSETS.models['buildings/' + b.k], v = bldVars(b), x = b.x, y = b.y, t = G.t, A = m.anchors;
  drawModel(m, x, y, v);
  if (b.k === 'pad') { if (b.turret) drawModel(ASSETS.models['turrets/' + b.turret], x, y, v); return; }
  // particles and the flag are effects, not part of the model; the model only marks where they start (its anchors)
  if (b.k === 'hq') {
    if (v.adv >= 0 && rnd() < .3) part('spark', x + (rnd() - .5) * 30, y + (rnd() - .5) * 30, (rnd() - .5) * 60, (rnd() - .5) * 60, .3, 2, null, 30 + rnd() * 40, BH.hq + 16 + v.L * 14, 200);
    if (b.hp > 0 && b.team >= 0) drawFlag(x + A.flag[0], y + A.flag[1], b.team === 0 ? (G.zone ? G.zone.id : (G.sk && G.sk.flag) || 'azure') : b.team === 1 ? 'crimson' : 't' + b.team, t);
  } else if (b.k === 'factory') {
    if (b.paid && !G.paused && rnd() < .15 && visAt(x, y)) part('smoke', x + A.smoke[0], y + A.smoke[1], (rnd() - .5) * 6, (rnd() - .5) * 6, 1.4, 4, null, 24, 44);
  } else if (b.k === 'robot') {
    if (v.live && b.paid) for (const sd of [-1, 1]) if (rnd() < .2) { const p = A[sd < 0 ? 'arm1' : 'arm2'], an = Math.sin(t * 1.6 + sd) * .9 + (sd > 0 ? Math.PI : 0); part('spark', x + p[0] + Math.cos(an) * 14, y + p[1] + Math.sin(an) * 14, (rnd() - .5) * 60, (rnd() - .5) * 60, .25, 2, null, 30, 22, 200); }
  } else if (b.k === 'foundry') {
    if (v.live && !G.paused && visAt(x, y)) for (const k of ['smoke1', 'smoke2']) if (rnd() < .06) part('smoke', x + A[k][0], y + A[k][1], (rnd() - .5) * 6, (rnd() - .5) * 6, 1.6, 5, null, 26, 48);
  }
}
function planePos(u) { if (u.order) return [u.x, u.y, u.a]; const big = u.k === 'bomber', an = G.t * (big ? 1.05 : 1.6) + u.id * 1.7, R = big ? 36 : 26; return [u.x + Math.cos(an) * R, u.y + Math.sin(an) * R, an + Math.PI / 2]; }
// Screen-space tube between two points in the world (each with its own height): barrels, fuel drums, emitter rails.
function tubeW(p, h0, q, h1, w, col, lite) {
  tI(); const X0 = ix(p[0], p[1]), Y0 = iy(p[0], p[1]) - h0, X1 = ix(q[0], q[1]), Y1 = iy(q[0], q[1]) - h1;
  ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = w + .9; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  if (lite) { ctx.strokeStyle = lite; ctx.lineWidth = w * .38; ctx.beginPath(); ctx.moveTo(X0, Y0 - w * .22); ctx.lineTo(X1, Y1 - w * .22); ctx.stroke(); }
}
function mixHex(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)), A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
// where a unit's model is drawn and which way it points
function unitPose(u) { return u.T.jetp ? planePos(u) : u.k === 'adv' ? [u.x, u.y, u.a + (u.order ? 0 : Math.sin(G.t * .8 + u.id) * .1)] : [u.x, u.y, u.a]; }
// what a unit's model may read
function unitVars(u, a) {
  const tc = TEAMC[u.team]; if (!tc.m) tc.m = mixHex(tc.c, tc.l, .38);
  return { tc, a, ta: u.ta || 0, id: u.id, odo: u.odo || 0, flash: u.flash || 0, team: u.team, fs: .45 + .55 * Math.abs(Math.cos(a) - Math.sin(a)) / 1.414,
    alt: u.alt || AIRH, A: (u.alt || AIRH) + Math.sin(G.t * 2.4 + u.id) * (u.order ? .6 : 2), moving: !!u.order, busy: !!(!u.stalled && (u.capB || u.fixB)), cap: !!u.capB, site: !!u.site, docked: !!u.docked,
    arm: u.fix ? Math.atan2(u.fix.y - u.y, u.fix.x - u.x) : a + Math.PI };
}
function unitShadow(u) { const p = unitPose(u); drawModel(ASSETS.models['units/' + u.k], p[0], p[1], unitVars(u, p[2]), true); }
function drawUnit(u) {
  const p = unitPose(u), v = unitVars(u, p[2]), x = u.x, y = u.y, t = G.t;
  drawModel(ASSETS.models['units/' + u.k], p[0], p[1], v);
  // beams between a unit and what it is working on are effects, drawn here
  if (u.k === 'eng' && u.fix) { tI(); ctx.strokeStyle = 'rgba(120,255,170,.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 30; ctx.beginPath(); ctx.moveTo(ix(x, y), iy(x, y) - 16); ctx.lineTo(ix(u.fix.x, u.fix.y), iy(u.fix.x, u.fix.y) - (u.fix.isB ? BH[u.fix.k] * .5 : 10)); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; glow(u.fix.x, u.fix.y, u.fix.isB ? BH[u.fix.k] * .5 : 10, 5 + rnd() * 4, .8); }
  if (u.k !== 'adv') return;
  // the Vanguard at work: a laser column down to the roof with particles drifting slowly down it. Blue = capture, purple = repair.
  const A = v.A, moving = v.moving;
  const st = moving || u.stalled ? null : (u.capB || u.fixB);
  if (st) {
    const cc = st === u.capB ? '80,160,255' : '190,120,255', sh = st.k === 'pad' ? 12 : BH[st.k] * .8;
    const x0 = ix(x, y), y0 = iy(x, y) - A + 6, x1 = ix(st.x, st.y), y1 = iy(st.x, st.y) - sh, len = Math.max(8, y1 - y0);
    tI(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [w, al] of [[13, .1], [7, .2], [2.4, .9]]) { ctx.strokeStyle = 'rgba(' + (w < 3 ? '255,255,255' : cc) + ',' + al * (.85 + .15 * Math.sin(t * 9)) + ')'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    for (let i = 0; i < 14; i++) { // particles: each falls slowly, sways a little and fades near the roof
      const f = (t * .28 + i * .0714 + ((u.id * 7 + i * 13) % 10) * .01) % 1, sway = Math.sin(t * 1.6 + i * 2.1) * (6 + (i % 4) * 3) * (1 - f * .5), px = x0 + (x1 - x0) * f + sway, py = y0 + len * f, r = (1.2 + (i % 3) * .9) * (1 - f * .35);
      ctx.fillStyle = 'rgba(' + cc + ',' + (.25 * (1 - f * .6)) + ')'; ctx.beginPath(); ctx.arc(px, py, r * 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (.9 * (1 - f * .5)) + ')'; ctx.beginPath(); ctx.arc(px, py, r * .8, 0, TAU); ctx.fill();
    }
    const pr = 9 + Math.sin(t * 6) * 2; ctx.fillStyle = 'rgba(' + cc + ',.35)'; ctx.beginPath(); ctx.ellipse(x1, y1, pr * 1.9, pr, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(x1, y1, pr * .7, pr * .38, 0, 0, TAU); ctx.fill(); // pool of light on the roof
    ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
    if (st === u.capB && st.cap > 0) { tG(st.x, st.y, 1); ctx.strokeStyle = 'rgba(90,170,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, st.T.r + 10, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(st.cap, 0, 1)); ctx.stroke(); }
  }
}
function entH(e) { return e.isB ? BH[e.k] + (e.turret ? 16 : 0) + (e.k === 'hq' ? (e.lvl || 0) * 14 : 0) + e.T.r * .5 : e.T.temp ? AIRH + 40 : e.T.air ? (e.alt || AIRH) + 16 : 22; }
function hpBar(e, sel) {
  const mh = maxHp(e), f = clamp(e.hp / mh, 0, 1); if (!sel && (f >= 1 || e.hp <= 0)) return;
  const w = Math.max(18, e.T.r * 1.5), X = ix(e.x, e.y), Y = iy(e.x, e.y) - entH(e) - 6;
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(X - w / 2 - 1, Y - 1, w + 2, 5);
  ctx.fillStyle = f > .55 ? '#5fd38a' : f > .28 ? '#ffb347' : '#ff5d4a'; ctx.fillRect(X - w / 2, Y, w * f, 3);
}
// Menu backdrop. Units roll past in close-up, far larger than in play, so only parts of them are in view at once:
// an Azure armoured column one way, a Crimson column and robots the other, aircraft drifting over. A dark veil and
// a slight blur (set in the page's styles) keep it soft so the menu stays easy to read.
const MENUBG = { stub: null, lanes: [
  { team: 0, y: -32, sp: 15, dir: 1, ks: ['bt2', 'bt0', 'ar1', 'en2', 'bt0', 'fl1'] },
  { team: 0, y: 38, sp: 19, dir: 1, ks: ['bt0', 'ad1', 'ad0', 'eng', 'bot', 'botl'] },
  { team: 1, y: 108, sp: 13, dir: -1, ks: ['ar1', 'bt2', 'bt0', 'botaa', 'bt0', 'ad1'] },
  { team: 0, y: -100, sp: 30, dir: 1, ks: ['gun', 'adv', 'bomber'], air: true },
  { team: 1, y: 170, sp: 46, dir: -1, ks: ['jet', 'gun'], air: true }
] };
function renderMenu(now) {
  mkSprites();
  const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d141c'); gr.addColorStop(.55, '#111a22'); gr.addColorStop(1, '#070a0e'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  const z = clamp(Math.min(W, H * 1.6) / 150, 5, 9), keepOX = OX; OX = 0; S = DPR * z; CX = W * .5 * DPR; CY = H * .56 * DPR;
  // faint ground grid sliding with the columns, so the scene has a floor
  tG(0, 0, 0); ctx.strokeStyle = 'rgba(120,170,210,.07)'; ctx.lineWidth = 1.2; const off = (now * 15) % 64; ctx.beginPath();
  for (let i = -14; i <= 14; i++) { ctx.moveTo(i * 64 - off, -900); ctx.lineTo(i * 64 - off, 900); ctx.moveTo(-900, i * 64); ctx.lineTo(900, i * 64); } ctx.stroke();
  const st = MENUBG.stub || (MENUBG.stub = { teams: [{}, {}, {}, {}], al: [0, 1, 2, 3], noVan: true, zone: null, sk: null, sel: [], parts: [] }); st.t = now;
  const list = []; let id = 1;
  for (const L of MENUBG.lanes) { const gap = L.air ? 300 : 150, span = gap * L.ks.length; L.ks.forEach((k, i) => {
    const x = (((i * gap + now * L.sp) % span) + span) % span - span / 2, a = L.dir > 0 ? 0 : Math.PI, n = id++;
    list.push({ id: n, k, T: UT[k], team: L.team, x: x * L.dir, y: L.y + Math.sin(now * .4 + n) * (L.air ? 14 : 3), a, ta: a + Math.sin(now * .35 + n * 1.7) * (L.air ? 0 : .6), odo: x, flash: 0, rank: 0, hp: 1, order: {}, alt: AIRH, kills: 0 }); }); }
  list.sort((p, q) => (p.T.air ? 1e6 : 0) + p.x + p.y - ((q.T.air ? 1e6 : 0) + q.x + q.y));
  const real = G; G = st; // the drawing code reads the time and a few flags from the game state; give it a stand-in while there is no game
  try { for (const u of list) unitShadow(u); for (const u of list) drawUnit(u); } finally { G = real; OX = keepOX; }
  // veil: darker in the middle where the menu sits and at the edges, so the units read as a soft backdrop
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(7,10,14,.36)'; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * .46, Math.min(W, H) * .12, W / 2, H * .46, Math.max(W, H) * .75); v.addColorStop(0, 'rgba(6,9,12,.6)'); v.addColorStop(.5, 'rgba(6,9,12,.08)'); v.addColorStop(1, 'rgba(4,6,8,.8)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#05080b'; ctx.fillRect(0, 0, W, H);
  if (cv.classList.contains('menubg') !== !G) cv.classList.toggle('menubg', !G);
  if (!G) { if (!$('menu').classList.contains('hidden')) renderMenu(performance.now() / 1000); return; }
  const c = G.cam, z = c.z, m = G.map, cix = ix(c.x, c.y), ciy = iy(c.x, c.y), now = performance.now() / 1000;
  S = DPR * z; CX = (W / 2 - cix * z) * DPR; CY = (H / 2 - ciy * z) * DPR;
  tI(); ctx.imageSmoothingEnabled = true; ctx.drawImage(m.world, -m.offX, -m.offY);
  const vx0 = cix - W / 2 / z - 90, vx1 = cix + W / 2 / z + 90, vy0 = ciy - H / 2 / z - 60, vy1 = ciy + H / 2 / z + 110;
  const on = e => { const X = ix(e.x, e.y), Y = iy(e.x, e.y); return X > vx0 && X < vx1 && Y > vy0 && Y < vy1; };
  drawWater(m, now, vx0, vx1, vy0, vy1); tI();
  const hfs = []; for (const b of G.blds) if (hfOn(b)) { const X = ix(b.x, b.y), Y = iy(b.x, b.y); if (X > vx0 - 110 && X < vx1 + 110 && Y > vy0 - 60 && Y < vy1 + 110) { b.hfF = now; hfs.push(b); hfGround(b); } } tI(); // Heavy Factories in view: their ground plates go under everything
  // water shimmer
  ctx.fillStyle = '#dff4ff';
  for (const q of m.glints) { if (q.X < vx0 || q.X > vx1 || q.Y < vy0 || q.Y > vy1) continue; const al = Math.sin(now * 1.4 + q.ph); if (al < .2) continue; ctx.globalAlpha = (al - .2) * .3; ctx.fillRect(q.X + Math.sin(now * .6 + q.ph) * 4, q.Y, q.w, 1.2); }
  ctx.globalAlpha = 1;
  // ground overlays
  for (const e of G.sel) {
    if (!e.isB && (e.patrol || e.guard)) { tG(0, 0, 0); ctx.strokeStyle = e.patrol ? 'rgba(255,207,90,.7)' : 'rgba(120,200,255,.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.beginPath(); if (e.patrol) { ctx.moveTo(e.patrol.a.x, e.patrol.a.y); ctx.lineTo(e.patrol.b.x, e.patrol.b.y); } else { ctx.moveTo(e.x, e.y); ctx.lineTo(e.guard.x, e.guard.y); } ctx.stroke(); ctx.setLineDash([]); }
    const r = e.isB ? e.T.r + 7 : e.T.r + 5; tG(e.x, e.y, 0);
    ctx.strokeStyle = e.team === 0 ? 'rgba(120,255,170,.9)' : 'rgba(255,220,120,.9)'; ctx.lineWidth = 1.8; circ(0, 0, r); ctx.stroke();
    if (e.isB && e.team === 0) {
      const w = e.k === 'hq' ? HQW : e.turret ? TT[e.turret] : null;
      if (w) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([6, 6]); circ(0, 0, w.range * (e.k === 'pad' ? 1 + .1 * (e.lvl || 0) : 1)); ctx.stroke(); if (w.minRange) { ctx.strokeStyle = 'rgba(255,120,100,.25)'; circ(0, 0, w.minRange); ctx.stroke(); } ctx.setLineDash([]); }
      if (e.rally) { tG(0, 0, 0); ctx.strokeStyle = 'rgba(120,255,170,.6)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.rally.x, e.rally.y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(120,255,170,.9)'; circ(e.rally.x, e.rally.y, 5); ctx.fill(); }
    }
  }
  { for (const op of objPoints()) { tG(op.x, op.y, 0); ctx.strokeStyle = `rgba(${op.col},.9)`; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -G.t * 24; circ(0, 0, op.r + Math.sin(G.t * 3) * 3); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; } }
  for (const b of G.blds) if (b.up && on(b) && (b.team === 0 || visAt(b.x, b.y))) { tG(b.x, b.y, 0); ctx.strokeStyle = 'rgba(255,207,90,.8)'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -G.t * 30; circ(0, 0, b.T.r + 15); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  for (const b of G.blds) if (b.cap > 0 && on(b) && (b.team === 0 || expAt(b.x, b.y))) { const tc = TEAMC[b.capTeam] || NEUT, r = b.T.r + 10; tG(b.x, b.y, 0); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 7; circ(0, 0, r); ctx.stroke(); ctx.strokeStyle = tc.c; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + TAU * b.cap); ctx.stroke(); }
  for (const s of G.strikes) if (s.t > 0 && (s.team === 0 || visAt(s.x, s.y))) { tG(s.x, s.y, 0); ctx.strokeStyle = `rgba(255,93,74,${.5 + .5 * Math.sin(G.t * 14)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 80, 0, TAU); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.moveTo(0, -14); ctx.lineTo(0, 14); ctx.stroke(); }
  if (G.mode) drawModeCursor();
  // scene: shadows first, then bodies back to front
  const list = [], air = [];
  for (const p of m.props) if (p.X > vx0 - 40 && p.X < vx1 && p.Y > vy0 - 60 && p.Y < vy1) list.push(p);
  for (const b of G.blds) if (on(b) || b.hfF === now) { b.d = b.x + b.y; list.push(b); } // structures are always on the map; only units and fighting hide in the fog
  for (const u of G.units) if (on(u) && seen(u)) { if (u.T.air) air.push(u); else if (!(u.exit && u.exit.b.hfF === now)) { u.d = u.x + u.y; // a tank still in its gate is drawn by the factory
      for (const b of hfs) { const dx = u.x - b.x, dy = u.y - b.y; if (dx > 220 || dx < -220 || dy > 220 || dy < -220) continue; if (dy >= 45 || dx >= 75) u.d = Math.max(u.d, b.d + 1); else if (dy <= -45 || dx <= -75) u.d = Math.min(u.d, b.d - 1); } // a long building: in front of its front or right wall means in front of it
      list.push(u); } }
  list.sort((a, b) => a.d - b.d);
  for (const o of list) { if (o.sprite) continue; if (o.isB) bldShadow(o); else unitShadow(o); }
  for (const u of air) unitShadow(u);
  for (const p of G.parts) if (p.kind === 'ring') { const f = p.life / p.max; tG(p.x, p.y, p.z);
    if (p.mark) {
      const e = 1 - f, R = p.size + 22 * f * f, al = Math.min(1, f * 2.2), c = p.color; ctx.lineCap = 'round';
      ctx.fillStyle = 'rgba(' + c + ',' + .16 * al + ')'; circ(0, 0, R); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,' + .45 * al + ')'; ctx.lineWidth = 5; circ(0, 0, R); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + c + ',' + al + ')'; ctx.lineWidth = 2.6; circ(0, 0, R); ctx.stroke();
      ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); ctx.lineDashOffset = e * 60; circ(0, 0, R * .62); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4, d = R + 5 + 14 * f, x = Math.cos(a) * d, y = Math.sin(a) * d, ca = Math.cos(a), sa = Math.sin(a); // arrows flying in
        ctx.fillStyle = 'rgba(' + c + ',' + al + ')'; ctx.strokeStyle = 'rgba(0,0,0,' + .5 * al + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - ca * 2, y - sa * 2); ctx.lineTo(x + ca * 9 - sa * 5.5, y + sa * 9 + ca * 5.5); ctx.lineTo(x + ca * 5.5, y + sa * 5.5); ctx.lineTo(x + ca * 9 + sa * 5.5, y + sa * 9 - ca * 5.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,' + al * (.6 + .4 * Math.sin(e * 22)) + ')'; circ(0, 0, 3); ctx.fill(); ctx.lineCap = 'butt'; continue;
    } ctx.strokeStyle = `rgba(${p.color},${f})`; ctx.lineWidth = 3; circ(0, 0, p.size * (1 - f * .85)); ctx.stroke(); }
  for (const o of list) { if (o.sprite) { tI(); ctx.drawImage(o.sprite, o.X, o.Y, o.w, o.h); } else if (o.isB) { drawBld(o); if (o.up) scaffold(o); } else drawUnit(o); }
  tI();
  for (const s of G.shots) {
    if (!on(s) || !visAt(s.x, s.y)) continue;
    const tot = Math.hypot(s.tx - s.sx, s.ty - s.sy) || 1, p = clamp(Math.hypot(s.x - s.sx, s.y - s.sy) / tot, 0, 1);
    let h = s.h0 + (s.h1 - s.h0) * p; if (s.kind === 'arty') h += Math.sin(p * Math.PI) * 70;
    const L = s.kind === 'bullet' || s.kind === 'flak' ? 13 : s.kind === 'shell' ? 15 : 9, bx = s.x - Math.cos(s.a) * L, by = s.y - Math.sin(s.a) * L;
    const X = ix(s.x, s.y), Y = iy(s.x, s.y) - h, X0 = ix(bx, by), Y0 = iy(bx, by) - h;
    ctx.lineCap = 'round';
    if (s.kind === 'bullet' || s.kind === 'flak') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = s.kind === 'flak' ? 'rgba(255,170,110,.9)' : 'rgba(255,225,140,.9)'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X, Y); ctx.stroke(); spr(SPR.glowW, X, Y, 4, .7); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    else if (s.kind === 'shell') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,190,100,.6)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X, Y); ctx.stroke(); spr(SPR.glowW, X, Y, 6, .9); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    else if (s.kind === 'arty') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(X, iy(s.x, s.y), 4, 2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a2622'; circ(X, Y, 3.2); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; spr(SPR.glowO, X0, Y0, 5, .8); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    else if (s.kind === 'laser') { const XS = ix(s.sx, s.sy), YS = iy(s.sx, s.sy) - s.h0, XT = ix(s.tx, s.ty), YT = iy(s.tx, s.ty) - s.h1, c = s.team ? '255,110,90' : '120,200,255'; ctx.globalCompositeOperation = 'lighter'; for (const [lw, al] of [[7, .25], [3, .6], [1.2, 1]]) { ctx.strokeStyle = 'rgba(' + (lw < 2 ? '255,255,255' : c) + ',' + al + ')'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(XS, YS); ctx.lineTo(XT, YT); ctx.stroke(); } spr(SPR.glowW, XT, YT, 9, 1); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    else if (s.kind === 'flame') { ctx.globalCompositeOperation = 'lighter'; spr(SPR.glowO, X, Y, 6 + p * 9, .9); spr(SPR.glowW, X, Y, 3 + p * 3, .5); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    else { ctx.strokeStyle = '#e8edf2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X, Y); ctx.stroke(); ctx.globalCompositeOperation = 'lighter'; spr(SPR.glowO, X0, Y0, 7, 1); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.lineCap = 'butt';
  }
  for (const p of G.parts) {
    const k = p.kind; if (k === 'ring' || k === 'jet') continue;
    const f = p.life / p.max, X = ix(p.x, p.y), Y = iy(p.x, p.y) - p.z;
    if (X < vx0 || X > vx1 || Y < vy0 - 200 || Y > vy1) continue;
    if (k === 'smoke') spr(SPR.smoke, X, Y, p.size * (2.3 - f * 1.3), .6 * f);
    else if (k === 'dust') spr(SPR.dust, X, Y, p.size * (2 - f), .55 * f);
    else if (k === 'debris') { ctx.globalAlpha = .3; ctx.fillStyle = '#000'; ctx.fillRect(X - 1, iy(p.x, p.y) - 1, p.size, 2); ctx.globalAlpha = Math.min(1, f * 3); ctx.save(); ctx.translate(X, Y); ctx.rotate(p.life * 9); ctx.fillStyle = '#1b1b1d'; ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * .66); ctx.restore(); }
    else {
      ctx.globalCompositeOperation = 'lighter';
      if (k === 'fire') spr(SPR.glowO, X, Y, p.size * (.6 + f * .9), Math.min(1, f * 1.3));
      else if (k === 'flash') spr(SPR.glowW, X, Y, p.size * (1.3 - f * .4), f);
      else if (k === 'ember') { ctx.globalAlpha = f; ctx.fillStyle = '#ffb060'; ctx.fillRect(X - 1, Y - 1, 2, 2); }
      else if (k === 'spark') { const qx = p.x - p.vx * .04, qy = p.y - p.vy * .04; ctx.globalAlpha = f; ctx.strokeStyle = '#ffe196'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(ix(qx, qy), iy(qx, qy) - Math.max(0, p.z - p.vz * .04)); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
  drawBeams(); drawMist(m, now, vx0, vx1, vy0, vy1);
  // drifting clouds: shadow on the ground, faint cloud above
  const span = m.IW + 900;
  tI(); for (const q of m.clouds) { const X = (q.X0 + now * q.sp) % span - 450, w = 380 * q.sc; if (X + w < vx0 || X > vx1 || q.Y + w / 2 < vy0 || q.Y > vy1 + 300) continue; if (CFG.clouds === false || (WX.kind === 'clear' && (q.X0 | 0) % 4)) continue; ctx.globalAlpha = .2; ctx.drawImage(SPR.cloudsS[(q.X0 | 0) % 3], X, q.Y, w, w / 2); }
  ctx.globalAlpha = 1;
  for (const u of air) drawUnit(u);
  tI();
  for (const p of G.parts) if (p.kind === 'jet') {
    const X = ix(p.x, p.y), Y = iy(p.x, p.y), ang = Math.atan2((p.vx + p.vy) * K * .5, (p.vx - p.vy) * K);
    for (const [dy, col] of [[0, 'rgba(0,0,0,.3)'], [-130, '#c9d1d9']]) { ctx.save(); ctx.translate(X, Y + dy); ctx.rotate(ang); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(-18, 18); ctx.lineTo(-10, 0); ctx.lineTo(-18, -18); ctx.closePath(); ctx.fill(); if (dy) { ctx.fillStyle = '#7d8791'; ctx.fillRect(-12, -2, 30, 4); } ctx.restore(); }
  }
  for (const q of m.clouds) { const X = (q.X0 + now * q.sp) % span - 450 - 60, w = 380 * q.sc, Y = q.Y - 230; if (X + w < vx0 || X > vx1 || Y + w / 2 < vy0 - 100 || Y > vy1) continue; if (CFG.clouds === false || (WX.kind === 'clear' && (q.X0 | 0) % 4)) continue; ctx.globalAlpha = .34; ctx.drawImage(SPR.clouds[(q.X0 | 0) % 3], X, Y, w, w / 2); }
  ctx.globalAlpha = 1;
  drawBirds(m, now, vx0, vx1, vy0, vy1);
  drawEdgeFade(m);
  tG(0, 0, 0); ctx.drawImage(m.fogB, -m.MG * TILE, -m.MG * TILE, m.EW * TILE, m.EH * TILE);
  tI();
  for (const b of G.blds) if (on(b) && (b.team === 0 || visAt(b.x, b.y))) {
    hpBar(b, G.sel.includes(b));
    if (b.up) { const r = b.T.r, X = ix(b.x, b.y), Y = iy(b.x, b.y) - entH(b) - 34; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(X - r - 1, Y - 1, r * 2 + 2, 6); ctx.fillStyle = '#ffcf5a'; ctx.fillRect(X - r, Y, r * 2 * Math.min(1, b.up.t / b.up.dur), 4); }
    if (b.fort) { const X = ix(b.x, b.y), Y = iy(b.x, b.y) - entH(b) - 25; ctx.fillStyle = '#b9c6d3'; ctx.strokeStyle = '#1a2026'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X - 4, Y - 4); ctx.lineTo(X + 4, Y - 4); ctx.lineTo(X + 4, Y + 1); ctx.lineTo(X, Y + 5); ctx.lineTo(X - 4, Y + 1); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    for (let i = 0; i < (b.lvl || 0); i++) { const X = ix(b.x, b.y) - (b.lvl - 1) * 5 + i * 10, Y = iy(b.x, b.y) - entH(b) - 14; ctx.fillStyle = '#ffcf5a'; ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Y - 4); ctx.lineTo(X + 4, Y); ctx.lineTo(X, Y + 4); ctx.lineTo(X - 4, Y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if (b.lines) { if (b.team === 0 && b.hp > 0) { const r = b.T.r, X = ix(b.x, b.y); let Y = iy(b.x, b.y) + r * .75 + 8; for (const ln of b.lines) { if (!ln.open) continue; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(X - r, Y, r * 2, 4); if (ln.paid) { ctx.fillStyle = ['#ffb347', '#6cc4ff', '#ff7a8a'][lineCls(b, ln)]; ctx.fillRect(X - r, Y, r * 2 * clamp(ln.pt / UT[ln.k].time, 0, 1), 4); } Y += 6; } } }
    else if (b.paid && b.team === 0) { const p = b.pt / UT[b.prod].time, r = b.T.r, X = ix(b.x, b.y), Y = iy(b.x, b.y) + r * .75 + 8; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(X - r, Y, r * 2, 4); ctx.fillStyle = '#ffb347'; ctx.fillRect(X - r, Y, r * 2 * p, 4); }
  }
  for (const u of G.units) if (on(u) && seen(u)) {
    hpBar(u, G.sel.includes(u));
    for (let i = 0; i < u.rank; i++) {
      const X = ix(u.x, u.y) - (u.rank - 1) * 4.5 + i * 9, Y = iy(u.x, u.y) - entH(u) - 14;
      ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? 2 : 4.6; k ? ctx.lineTo(X + Math.cos(a) * q, Y + Math.sin(a) * q) : ctx.moveTo(X + Math.cos(a) * q, Y + Math.sin(a) * q); }
      ctx.closePath(); ctx.fillStyle = '#ffcf5a'; ctx.fill(); ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = .8; ctx.stroke();
    }
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawScreenFx(now);
  if (drag && (Math.abs(mouse.x - drag.x) > 4 || Math.abs(mouse.y - drag.y) > 4)) { ctx.fillStyle = 'rgba(120,255,170,.1)'; ctx.strokeStyle = 'rgba(120,255,170,.85)'; ctx.lineWidth = 1; const x = Math.min(drag.x, mouse.x), y = Math.min(drag.y, mouse.y), w = Math.abs(mouse.x - drag.x), h = Math.abs(mouse.y - drag.y); ctx.fillRect(x, y, w, h); ctx.strokeRect(x + .5, y + .5, w, h); }
}
// Navigation map: a flat top-down picture of the whole game area that fills its box.
function drawMini() {
  const mc = $('mini'), g = mc.getContext('2d'), m = G.map, kx = mc.width / m.WW, ky = mc.height / m.WH, q = mc.width / 260;
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(m.mini, 0, 0, mc.width, mc.height);
  g.globalAlpha = .85; g.drawImage(m.fogB, m.MG, m.MG, m.w, m.h, 0, 0, mc.width, mc.height); g.globalAlpha = 1; // slightly see-through fog
  for (const b of G.blds) {
    const z = (b.k === 'hq' ? 9 : b.k === 'pad' ? 3.5 : 5.5) * q, x = b.x * kx, y = b.y * ky;
    g.fillStyle = b.team >= 0 ? TEAMC[b.team].c : b.k === 'mine' ? '#e0b040' : b.k === 'tech' ? '#6eebff' : b.k === 'foundry' ? '#ff9a4a' : '#c8cdd2';
    g.strokeStyle = b.k === 'hq' ? '#fff' : 'rgba(0,0,0,.8)'; g.lineWidth = (b.k === 'hq' ? 1.3 : .7) * q;
    g.beginPath(); if (b.k === 'hq') { g.moveTo(x, y - z * .7); g.lineTo(x + z * .7, y); g.lineTo(x, y + z * .7); g.lineTo(x - z * .7, y); g.closePath(); } else g.rect(x - z / 2, y - z / 2, z, z);
    g.fill(); g.stroke();
  }
  for (const u of G.units) if (seen(u)) { const z = (u.team === 0 ? 2.8 : 2.4) * q; g.fillStyle = u.team === 0 ? TEAMC[0].l : TEAMC[u.team].c; g.fillRect(u.x * kx - z / 2, u.y * ky - z / 2, z, z); }
  { for (const op of objPoints()) { g.strokeStyle = `rgb(${op.col})`; g.lineWidth = 1.8 * q; g.beginPath(); g.arc(op.x * kx, op.y * ky, (6 + Math.sin(G.t * 4) * 1.5) * q, 0, TAU); g.stroke(); } }
  if (G.alertPos && G.t - G.lastAlert < 4) { g.strokeStyle = '#ff5d4a'; g.lineWidth = 2 * q; g.beginPath(); g.arc(G.alertPos.x * kx, G.alertPos.y * ky, (5 + (G.t * 12 % 8)) * q, 0, TAU); g.stroke(); }
  // view frame: a regular rectangle centred on what you are looking at, with the same area as the screen view, held inside the box
  const c = G.cam, e = 1.5 * q, fw = W / (c.z * K) * kx, fh = H / (c.z * K) * ky;
  const x0 = clamp(c.x * kx - fw / 2, e, mc.width - e * 4), y0 = clamp(c.y * ky - fh / 2, e, mc.height - e * 4), x1 = clamp(c.x * kx + fw / 2, x0 + e * 3, mc.width - e), y1 = clamp(c.y * ky + fh / 2, y0 + e * 3, mc.height - e);
  g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3 * q; g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = '#fff'; g.lineWidth = 1.5 * q; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

/* ---------- HUD ---------- */
// Tutorial: one short instruction at a time, each ticked off when the player actually does it.
const TUT = [
  ['Click your Tank Factory, the factory beside your Command Core.', g => g.sel[0] && g.sel[0].isB && g.sel[0].team === 0 && !!g.sel[0].T.makes],
  ['Each row is a production line that builds one kind of tank over and over. Units are free. Wait for a new unit to roll out.', (g, b) => g.teams[0].count > b.count],
  ['A factory can run several lines at once. Press the unlock button to open its second line with credits.', g => g.blds.some(q => q.team === 0 && q.lines && q.lines.filter(l => l.open).length > 1), g => g.blds.some(q => q.team === 0 && q.lines && q.lines.length > 1) && g.teams[0].credits >= 300],
  ['Drag a box around your tanks to select them.', g => ownSel().filter(u => !u.T.hero).length >= 2],
  ['Right-click the ground to move them. Right-click an enemy to attack it.', g => ownSel().some(u => u.order)],
  ['Capture: park ground units beside a grey, neutral structure until it turns your colour.', (g, b) => g.blds.filter(q => q.team === 0).length > b.blds, g => g.blds.some(q => q.team < 0)],
  ['Credits pay for upgrades. Click one of your structures and press its upgrade button.', (g, b) => g.blds.some(q => q.team === 0 && (q.up || (q.lvl || 0) > 0 || q.fort)) || g.teams[0].res || g.teams[0].dmgU + g.teams[0].arm > b.res],
  ['Press G to select the Vanguard, your command craft. Right-click a neutral structure to capture it or a damaged one of yours to repair it.', g => g.sel.some(u => u.k === 'adv'), g => !g.noVan],
  ['Your objective is always shown at the top left. Good luck, commander!', (g, b, st) => g.t - st.t > 9]
];
function tutBase() { const tm = G.teams[0]; return { count: tm.count, blds: G.blds.filter(q => q.team === 0).length, res: tm.dmgU + tm.arm }; }
function tutEnd() { CFG.tut = false; try { localStorage.setItem('sm_cfg', JSON.stringify(CFG)); } catch (e) {} if (G) G.tut = null; $('coach').classList.add('hidden'); }
function tutStep(n) { const st = G.tut; st.i = n; while (st.i < TUT.length && TUT[st.i][2] && !TUT[st.i][2](G)) st.i++; if (st.i >= TUT.length) return tutEnd(); st.base = tutBase(); st.t = G.t; st.shown = -1; sfx('ui'); }
function tutTick() {
  const c = $('coach');
  if (!CFG.tut || G.over) { c.classList.add('hidden'); return; }
  if (!G.tut) { if (G.t < 2) return; G.tut = { i: 0 }; tutStep(0); if (!G.tut) return; }
  const st = G.tut; if (TUT[st.i][1](G, st.base, st)) { tutStep(st.i + 1); if (!G.tut) return; }
  if (st.shown !== st.i + LANG) { st.shown = st.i + LANG; c.innerHTML = '<b>' + tr('Tutorial {0}/{1}', st.i + 1, TUT.length) + '</b><p>' + tr(TUT[st.i][0]) + '</p><div class="row"><button data-act="tut:next">' + tr('Next') + '</button><button data-act="tut:skip">' + tr('Skip tutorial') + '</button></div>'; }
  c.classList.remove('hidden');
}
// The four powers live in a strip at the left edge: big icons that widen to show their name and status when the pointer is over them.
// The buttons are made once and only their text and state are refreshed, so the hover animation is not interrupted.
function updPside(tm) {
  const box = $('pside');
  if (!box.firstChild) for (const k in PW) { const b = document.createElement('button'); b.dataset.act = 'pw:' + k; b.innerHTML = IC[k].replace('class="ic"', 'class="pic"') + '<span class="lbl"><span class="nm"></span><small></small></span><span class="bdg"></span>'; box.appendChild(b); }
  for (const b of box.children) {
    const k = b.dataset.act.slice(3), P = PW[k], cd = tm.pw[k], locked = P.need && !tm[P.need], ok = !locked && cd <= 0 && tm.credits >= P.cost, cls = G.mode === k ? 'on' : ok ? '' : 'off';
    const set = (el, t) => { t = String(t); if (el.textContent !== t) el.textContent = t; };
    if (b.className !== cls) b.className = cls;
    set(b.querySelector('.nm'), P.name); set(b.querySelector('small'), locked ? tr('needs {0}', BT[P.need].name) : cd > 0 ? tr('{0}s', Math.ceil(cd)) : P.cost + ' · ' + P.key); set(b.querySelector('.bdg'), locked ? '' : cd > 0 ? Math.ceil(cd) : P.key);
  }
}
function updHud() {
  const tm = G.teams[0], s = Math.floor(G.t);
  $('cred').textContent = Math.floor(tm.credits); $('rp').textContent = Math.floor(tm.rp || 0); $('rpr').textContent = '+' + (tm.rpRate || 0).toFixed(1) + '/s';
  $('inc').textContent = tr('+{0}/s', Math.round(tm.income));
  $('pop').textContent = tr('Units {0}/{1}', tm.count, capOf(0));
  $('obj').textContent = objText(); tutTick();
  $('clock').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  let ph = '<div class="prow">';
  updPside(tm);
  { const full = buildCap(0, 'pad'); for (const k in TT) { const T = TT[k]; ph += `<button data-act="bt:${k}" class="tb ${G.mode === 'b:pad' && G.tk === k ? 'on' : tm.credits >= turPrice(k) && !full ? '' : 'off'}">${IC['t' + k]}<small>${turPrice(k)}</small><span class="tt"><b>${T.name}${k === 'gun' ? ' · B' : ''}</b>${T.desc}<i>${tr('Range {0}', T.range)}</i></span></button>`; } }
  ph += '</div><div class="prow">';
  for (const k in BUILD) if (k !== 'pad') ph += `<button data-act="bld:${k}" class="${G.mode === 'b:' + k ? 'on' : tm.credits >= BUILD[k] && !buildCap(0, k) ? '' : 'off'}">${tr('Build {0}', BT[k].name)} <small>${coreLvl(0) < (NEEDL[k] || 0) ? tr('needs Core Lv {0}', (NEEDL[k] || 0) + 1) : BUILD[k]}</small></button>`;
  morph($('powers'), ph + '</div>');
  const keys = G.sel[0] && G.sel[0].isB && G.sel[0].team === 0;
  morph($('panel'), panelHTML(), keys ? t => t.querySelectorAll('[data-act]:not(.ib)').forEach((b, i) => { if (i < 9) b.insertAdjacentHTML('afterbegin', '<kbd>' + (i + 1) + '</kbd>'); }) : null); engineUpdate();
  const nIdle = G.units.filter(u => u.team === 0 && !u.dead && !u.order && !u.T.temp && !u.T.convoy && !u.T.hero && !u.hold && !u.guard && !u.patrol && !u.fix).length; $('bidle').textContent = tr('Idle {0}', nIdle); $('bidle').classList.toggle('off', !nIdle);
  { const va = G.units.some(u => u.k === 'adv' && u.team === 0 && !u.dead), bv = $('badv'); bv.classList.toggle('hidden', !!G.noVan); bv.classList.toggle('off', !va); bv.textContent = va ? tr('Vanguard') : tr('Vanguard {0}s', Math.max(1, Math.ceil(tm.advT || 0))); }
  drawMini();
}
// small pictures on the panel's action buttons: upgrade (arrows up), research (flask), fortify (shield), dismantle (crossed-out block)
function syncDom(a, b) {
  const ac = a.childNodes, bc = b.childNodes;
  if (ac.length !== bc.length) { a.innerHTML = b.innerHTML; return; }
  for (let i = 0; i < ac.length; i++) {
    const x = ac[i], y = bc[i];
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y.cloneNode(true), x); continue; }
    if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.nodeType !== 1) continue;
    for (const at of Array.from(x.attributes)) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of Array.from(y.attributes)) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    syncDom(x, y);
  }
}
const MORPH = document.createElement('div');
function morph(el, html, post) { MORPH.innerHTML = html; if (post) post(MORPH); syncDom(el, MORPH); MORPH.textContent = ''; }
function panelHTML() {
  const sel = G.sel, tm = G.teams[0];
  if (!sel.length) return `<h3>${tr('No selection')}</h3><div class="sub">${tr('Drag to select units. Click a structure for its options.')}</div><div class="tip">${tr('Weapons Lv {0} · Armour Lv {1}. Upgrades are bought at the Command Core.', tm.dmgU, tm.arm)}</div>`;
  const e = sel[0];
  if (!e.isB) {
    const n = {}; let hp = 0, mh = 0; for (const u of sel) { n[u.k] = (n[u.k] || 0) + 1; hp += u.hp; mh += maxHp(u); }
    const one = sel.length === 1;
    return `<h3>${one ? e.T.name : tr('{0} units', sel.length)}</h3><div class="sub">${one ? e.T.desc : Object.keys(n).map(k => n[k] + '× ' + UT[k].name).join(' · ')}</div><div class="bar"><i style="width:${hp / mh * 100}%"></i></div>${e.team === 0 && !e.T.convoy ? `<div class="acts ords"><button data-act="ord:stop">${IC.stop}${tr('Stop')}<small>X</small></button><button data-act="ord:hold" class="${sel.every(u => u.hold) ? 'on' : ''}">${IC.hold}${tr('Hold')}<small>Z</small></button><button data-act="ord:patrol" class="${G.mode === 'patrol' || sel.every(u => u.patrol) ? 'on' : ''}">${IC.patrol}${tr('Patrol')}<small>V</small></button><button data-act="ord:guard" class="${G.mode === 'guard' || sel.every(u => u.guard) ? 'on' : ''}">${IC.guard}${tr('Guard')}<small>C</small></button></div>` : ''}<div class="tip">${G.mode === 'patrol' ? tr('Click where the patrol should turn round.') + ' ' : G.mode === 'guard' ? tr('Click one of your units or structures to guard.') + ' ' : ''}${one && e.k === 'adv' && e.team === 0 ? tr('Right click a structure: yours to repair it, a neutral or knocked-out one to capture it, an enemy one to attack it. Right click your Command Core to dock.') + ' ' : ''}${one ? vetLine(e) + ' ' : tr('{0} veterans.', sel.filter(u => u.rank).length) + ' '}${tr('Right click moves or attacks; Ctrl+right click attack-moves.')}</div>`;
  }
  const own = e.team === 0, tc = e.team >= 0 ? TEAMC[e.team] : NEUT, mh = maxHp(e), wreck = e.k !== 'pad' && e.hp <= 0;
  let h = `<h3>${e.k === 'pad' && e.turret ? TT[e.turret].name : e.k === 'factory' && e.lines ? tr(FTN[e.lvl || 0]) : e.T.name}</h3><div class="sub" style="color:${tc.c}">${tr(tc.n)}${wreck ? ' · ' + tr('knocked out') : ''}</div>`;
  if (e.k !== 'pad' || e.turret) h += `<div class="bar"><i style="width:${clamp(e.hp / mh, 0, 1) * 100}%"></i></div>`;
  if (!own) return h + `<div class="tip">${tr(e.k === 'hq' ? 'Destroy it to win.' : e.team < 0 ? 'Move ground units next to it to capture.' : 'Knock it out, then capture it with ground units.')}</div>`;
  const l = e.lvl || 0, off = c => tm.credits >= c ? '' : 'off', adv = advNear(e), fc = fortCost(e);
  const fortBtn = e.up ? '' : e.fort ? '<button class="off">' + tr('Fortified') + '</button>' : `<button data-act="fort:1" class="${off(fc)}" title="${tr('Raises hit points by 60%.')}">${IC.fort}${tr('Fortify')}<small>${tr('+60% HP')} · ${fc}</small></button>`;
  const pwBtn = k => { const P = PW[k], cd = tm.pw[k]; return `<button data-act="pw:${k}" class="${G.mode === k ? 'on' : cd <= 0 && tm.credits >= P.cost ? '' : 'off'}">${IC[k]}${P.name}<small>${cd > 0 ? tr('{0}s', Math.ceil(cd)) : P.cost + ' · ' + P.key}</small></button>`; };
  const upFill = () => `background-image:linear-gradient(90deg,rgba(108,196,255,.38) ${e.up.t / e.up.dur * 100}%,transparent ${e.up.t / e.up.dur * 100}%)`, lvlBtn = nm => e.up ? `<button class="on" style="${upFill()}">${tr(e.up.kind === 'fort' ? 'Fortifying' : 'Upgrading')}<small>${Math.round(e.up.t / e.up.dur * 100)}%</small></button>` : l >= lvlMax(e) ? `<button class="off">${tr('{0} MAX', nm)}</button>` : `<button data-act="lvl:1" class="${off(lvlCost(e))}">${IC.up}${tr('{0} Lv {1}', nm, l + 2)}<small>${lvlCost(e)} · ${tr('{0}s', Math.ceil(upTime(l) / (adv ? 2 : 1)))}</small></button>`;
  if (e.k === 'factory' && e.lines) {
    const rate = buildRate(e), busy = !!e.up; h += '<div class="acts" style="grid-template-columns:1fr 58px">';
    e.lines.forEach((ln, i) => {
      const R = ROLES[ln.role];
      if (!ln.open) { const c = LINE_UNLOCK[i], can = i === 0 || e.lines[i - 1].open, now = busy && e.up.kind === 'line' && e.up.i === i; h += `<button data-act="lineopen:${i}" style="grid-column:1/-1${now ? ';background-image:linear-gradient(90deg,rgba(108,196,255,.3) ' + e.up.t / e.up.dur * 100 + '%,transparent ' + e.up.t / e.up.dur * 100 + '%)' : ''}" class="${now ? 'on' : !busy && can && tm.credits >= c ? '' : 'off'}">${IC.up}${tr(now ? 'Unlocking the {0} line' : 'Unlock the {0} line', R.name)}<small>${now ? Math.round(e.up.t / e.up.dur * 100) + '%' : c}</small></button>`; return; }
      const T = UT[ln.role + lineCls(e, ln)], p = ln.paid ? clamp(ln.pt / UT[ln.k].time, 0, 1) * 100 : 0;
      h += `<button data-act="linetog:${i}" class="${ln.on ? 'on' : ''}" title="${T.desc}" style="background-image:linear-gradient(90deg,rgba(255,179,71,.32) ${p}%,transparent ${p}%)">${ln.paid && ln.k === 'eng' ? UT.eng.name : T.name}<small>${ln.on ? tr('{0}s', Math.round(T.time / rate)) : tr('paused')}</small></button>`;
      if (ln.lvl >= 2 || ln.lvl >= e.ft) h += '<span></span>';
      else { const c = LINE_RP[ln.lvl + 1], need = ln.lvl >= l, now = busy && e.up.kind === 'lineup' && e.up.i === i, nm = tr(CLSN[ln.lvl + 1]) + ' ' + R.name;
        h += `<button data-act="lineup:${i}" class="ib ${now ? 'on' : !busy && !need && (tm.rp || 0) >= c ? '' : 'off'}" title="${need ? tr('Upgrade the factory first.') : tr('Raise to {0}', nm) + ' · ' + tr('{0} research', c)}"${now ? ` style="background-image:linear-gradient(0deg,rgba(108,196,255,.42) ${e.up.t / e.up.dur * 100}%,transparent ${e.up.t / e.up.dur * 100}%)"` : ''}>${IC.up}<small>${now ? Math.round(e.up.t / e.up.dur * 100) + '%' : c}</small></button>`; }
    });
    h += `</div><div class="acts" style="margin-top:6px">${!busy || e.up.kind === 'lvl' ? lvlBtn(tr('Factory')) : l >= lvlMax(e) ? `<button class="off">${tr('{0} MAX', tr('Factory'))}</button>` : `<button class="off">${IC.up}${tr('{0} Lv {1}', tr('Factory'), l + 2)}<small>${lvlCost(e)} · ${tr('{0}s', Math.ceil(upTime(l)))}</small></button>`}<button data-act="eng:1" class="${e.engQ ? 'on' : ''}" title="${UT.eng.desc}">${UT.eng.name}<small>${tr(e.engQ ? 'next off the line' : 'build one')}</small></button>${fortBtn || (e.fort ? '<button class="off">' + tr('Fortified') + '</button>' : e.up && e.up.kind === 'fort' ? `<button class="on" style="${upFill()}">${IC.fort}${tr('Fortifying')}<small>${Math.round(e.up.t / e.up.dur * 100)}%</small></button>` : `<button class="off">${IC.fort}${tr('Fortify')}<small>${tr('+60% HP')} · ${fc}</small></button>`)}</div>`;
    h += `<div class="tip">${G.noProd ? '<b>' + tr('Production is offline in this mission.') + '</b> ' : ''}${tr('Each line builds its own tank over and over; click a line to pause it. Upgrade the factory with credits to allow a heavier class, then raise each line to it with research points (the arrow beside the line). This factory can reach {0} class.', tr(CLSN[e.ft]))} ${tm.count + tm.pend >= capOf(0) ? tr('Unit limit reached.') : tr('Units are free.')}</div>`;
  } else if (e.T.makes) {
    h += `<div class="bar prog"><i style="width:${e.paid ? e.pt / UT[e.prod].time * 100 : 0}%"></i></div><div class="acts">`;
    for (const k of e.T.makes) h += unlocked(e, k) ? `<button data-act="prod:${k}" class="${e.prod === k ? 'on' : ''}" title="${UT[k].desc}">${UT[k].name}<small>${limitHit(0, k) ? tr('max {0}', UT[k].max) : tr('{0}s', Math.round(UT[k].time / buildRate(e)))}</small></button>` : `<button class="off" title="${UT[k].desc}">${UT[k].name}<small>${tr('Line Lv {0}', UT[k].tier + 1)}</small></button>`;
    h += `<button data-act="prod:" class="${e.prod ? '' : 'on'}">${tr('Hold§production')}</button></div><div class="acts" style="margin-top:6px">${lvlBtn(tr('Line'))}${fortBtn}</div>`;
    h += `<div class="tip">${G.noProd ? '<b>' + tr('Production is offline in this mission.') + '</b> ' : ''}${tr('Line level {0} of 3 · build speed ×{1}.', l + 1, buildRate(e).toFixed(2))} ${lineNext(e)} ${e.prod && !e.paid ? (limitHit(0, e.prod) ? tr('Only {0} of this unit at a time.', UT[e.prod].max) : tr('Unit limit reached.')) : tr('Units are free.')}</div>`;
  } else if (e.k === 'hq') {
    h += `<div class="acts">`;
    for (const [k, nm] of [['dmgU', tr('Weapons')], ['arm', tr('Armour')]]) { const q = tm[k], c = upCost(q, tm); h += tm.res ? `<button class="off">${tm.res.k === k ? nm + ' … ' + tr('{0}s', Math.ceil(tm.res.dur - tm.res.t)) : tr('{0} (lab busy)', nm)}</button>` : q >= resMax(tm) ? `<button class="off">${tr('{0} MAX', nm)}</button>` : `<button data-act="up:${k}" class="${off(c)}">${IC.res}${tr('{0} Lv {1}', nm, q + 1)}<small>${c}</small></button>`; }
    h += `${lvlBtn(tr('Core'))}</div><div class="tip">${tr('Core level {0} of 3 · unit limit {1}.', l + 1, capOf(0))} ${tr('Each Core level adds 10 units, 25% Core hit points and income; level 2 unlocks the Airfield, level 3 the Laser Array. Research adds 15% per level.')} ${tr(tm.tech > 0 ? 'Tech Lab held: levels 4–5 open, research 25% cheaper.' : 'Hold a Tech Lab to open levels 4–5.')} ${tr('Income +{0}/s.', incomeOf(e))}</div>`;
  } else if (e.k === 'pad') {
    if (e.turret) h += `<div class="acts">${lvlBtn(tr('Turret'))}<button data-act="sell:1">${IC.del}${tr('Dismantle')}<small>+${Math.round(TT[e.turret].cost * .5)}</small></button></div><div class="tip">${TT[e.turret].desc} ${tr('Level {0} of 3 · range {1}.', l + 1, Math.round(TT[e.turret].range * (1 + .1 * l)))} ${tr('Each upgrade adds 25% damage, 10% range and 30% hit points.')}</div>`;
    else { h += `<div class="acts">`; for (const k in TT) h += `<button title="${TT[k].desc}" data-act="tur:${k}" class="${off(TT[k].cost)}">${IC['t' + k]}${TT[k].name}<small>${TT[k].cost}</small></button>`; h += `</div><div class="tip">${tr('Gun and missile hit everything. Cannon, rockets and artillery hit ground only. Flak hits aircraft only.')}</div>`; }
  } else {
    h += `<div class="acts">${e.k === 'airfield' ? pwBtn('sortie') : e.k === 'laser' ? pwBtn('laser') : ''}${e.T.income ? lvlBtn(tr('Output')) : ''}${fortBtn}</div><div class="tip">`;
    if (e.T.income) h += tr('Level {0} of 5 · income +{1}/s. Each upgrade adds +{2}/s.', l + 1, incomeOf(e), e.T.income * .5);
    else if (e.k === 'tech') h += tr('While you hold it: Weapons and Armour research can reach level 5 and costs 25% less.');
    else if (e.k === 'airfield') h += tr('Enables Fighter Sortie (R): three fighters attack an area for about 25 seconds, then fly home.');
    else if (e.k === 'laser') h += tr('Enables Laser Strike (T): a sustained beam anywhere you have explored. Strongest against structures.');
    else if (e.k === 'outpost') h += tr('The allied outpost. Keep it standing until the timer runs out; engineers can repair it.');
    else h += tr('While you hold it: all your factories build 30% faster. Up to two Foundries count.');
    h += ' ' + tr('Upgrades are lost if it is knocked out.') + '</div>';
  }
  return adv ? h.replace('<div class="tip">', '<div class="tip"><b>' + tr('Vanguard overhead: upgrades here cost 25% less and take half the time.') + '</b> ') : h;
}
// Ask before leaving. During a battle the game is paused while the box is open and offers to save first.
function askExit(inGame) {
  if (!$('confirm').classList.contains('hidden')) return;
  const box = $('confirm'), was = G ? G.paused : false, canSave = inGame && G && !G.over && ((G.zone && G.zone.mid) || G.sk);
  if (inGame && G && !G.over) G.paused = true;
  box.innerHTML = '<div class="cbox"><h3>' + tr(inGame ? 'Leave the battle?' : 'Exit the game?') + '</h3><p>' + tr(canSave ? 'Are you sure you want to exit the game? You can save it before you leave.' : 'Are you sure you want to exit the game?') + '</p><div class="row">' + (canSave ? '<button data-c="save" class="primary">' + tr('Save and exit') + '</button><button data-c="go">' + tr('Exit without saving') + '</button>' : '<button data-c="go" class="primary">' + tr('Exit') + '</button>') + '<button data-c="no">' + tr('Cancel') + '</button></div></div>';
  box.classList.remove('hidden');
  box.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; sfx('ui'); box.classList.add('hidden'); box.onclick = null; const c = b.dataset.c;
    if (c === 'no') { if (inGame && G) G.paused = was; return; }
    if (inGame) { if (G) G.paused = was; if (c === 'save') saveGame(true); toMenu(); } // without saving, the last autosave (if any) is left as it was
    else { showScreen('exit'); try { window.close(); } catch (er) {} } };
}
function act(a) {
  if (!G) return; auInit();
  const [k, v] = a.split(':'), e = G.sel[0], tm = G.teams[0];
  if (G.spec && (k === 'pw' || k === 'bld')) { sfx('deny'); return; } // a watcher has no army to command
  if (k === 'speed') { G.speed = G.speed === 1 ? 2 : 1; $('bspeed').textContent = tr('Speed {0}×', G.speed); }
  else if (k === 'pause') togglePause();
  else if (k === 'mute') setMute(!AU.on);
  else if (k === 'quit') { if (G.over) toMenu(); else askExit(true); }
  else if (k === 'save') saveGame(false);
  else if (k === 'ord') {
    const us = ownSel();
    if (v === 'stop') { for (const u of us) { u.order = null; clearStanding(u); } }
    else if (v === 'hold') { const on = !us.every(u => u.hold); for (const u of us) { clearStanding(u); u.hold = on; u.order = null; } }
    else if (us.length) G.mode = G.mode === v ? null : v;
    sfx('ui');
  }
  else if (k === 'adv') { const u = G.units.find(q => q.k === 'adv' && q.team === 0 && !q.dead); if (u) { if (G.sel.length === 1 && G.sel[0] === u) { G.cam.x = u.x; G.cam.y = u.y; } G.sel = [u]; sfx('ui'); } else sfx('deny'); }
  else if (k === 'tut') { if (v === 'skip') tutEnd(); else if (G.tut) tutStep(G.tut.i + 1); }
  else if (k === 'idle') {
    const idle = G.units.filter(u => u.team === 0 && !u.dead && !u.order && !u.T.temp && !u.T.convoy && !u.T.hero && !u.hold && !u.guard && !u.patrol && !u.fix);
    if (idle.length) { G.idleI = ((G.idleI || 0) + 1) % idle.length; const u = idle[G.idleI]; G.sel = [u]; G.cam.x = u.x; G.cam.y = u.y; sfx('ui'); } else sfx('deny');
  }
  else if (k === 'bt') { const cap = buildCap(0, 'pad'); if (cap || tm.credits < turPrice(v)) { sfx('deny'); toast(cap || 'Not enough credits.', 'bad'); } else { const same = G.mode === 'b:pad' && G.tk === v; G.mode = same ? null : 'b:pad'; G.tk = v; sfx('ui'); } }
  else if (k === 'bld') { const cap = buildCap(0, v); if (cap || tm.credits < BUILD[v]) { sfx('deny'); toast(cap || 'Not enough credits.', 'bad'); } else { G.mode = G.mode === 'b:' + v ? null : 'b:' + v; sfx('ui'); } }
  else if (k === 'pw') { if ((PW[v].need && !tm[PW[v].need]) || tm.pw[v] > 0 || tm.credits < PW[v].cost) { sfx('deny'); toast(PW[v].need && !tm[PW[v].need] ? (v === 'sortie' ? 'Build an Airfield first.' : 'Build a Laser Array first.') : tm.pw[v] > 0 ? tr('{0} is recharging.', PW[v].name) : 'Not enough credits.', 'bad'); } else { G.mode = G.mode === v ? null : v; sfx('ui'); } }
  else if (e && e.isB && e.team === 0) {
    if (k === 'prod') { setProd(e, v || null); sfx('ui'); }
    else if (k === 'up') sfx(buyUp(0, v) ? 'cap' : 'deny');
    else if (k === 'lvl') sfx(upgradeBld(e) ? 'build' : 'deny');
    else if (k === 'fort') sfx(fortify(e) ? 'build' : 'deny');
    else if (k === 'sell') sfx(sellTurret(e) ? 'ui' : 'deny');
    else if (k === 'tur') { if (buildTurret(e, v)) { sfx('build'); voice('turret'); } else sfx('deny'); }
    else if (k === 'lineopen') { if (lineOpen(e, +v)) sfx('ui'); else { sfx('deny'); toast(e.up ? 'The factory is busy with another upgrade.' : +v > 0 && e.lines && !e.lines[+v - 1].open ? 'Unlock the line before it first.' : 'Not enough credits.', 'bad'); } }
    else if (k === 'lineup') { const ln = e.lines && e.lines[+v]; if (lineUp(e, +v)) sfx('ui'); else { sfx('deny'); toast(e.up ? 'The factory is busy with another upgrade.' : ln && ln.lvl >= (e.lvl || 0) ? 'Upgrade the factory first.' : 'Not enough research points.', 'bad'); } }
    else if (k === 'linetog') { const ln = e.lines && e.lines[+v]; if (ln && ln.open) { ln.on = !ln.on; sfx('ui'); } }
    else if (k === 'eng') { if (e.lines) { e.engQ = e.engQ ? 0 : 1; sfx('ui'); } }
  }
  if (G) updHud();
}
function togglePause() { if (!G || G.over) return; G.paused = !G.paused; $('pauseov').classList.toggle('hidden', !G.paused); }

/* ---------- input ---------- */
function s2w(sx, sy) { const c = G.cam; return unIso((sx - W / 2) / c.z + ix(c.x, c.y), (sy - H / 2) / c.z + iy(c.x, c.y)); }
function pick(sx, sy, own) {
  let best = null, bd = 1e9; const z = G.cam.z;
  for (const u of G.units) { if (u.dead || (own ? u.team !== 0 : !hostile(u.team, 0)) || !seen(u)) continue; const p = w2s(u.x, u.y, u.T.air ? (u.alt || AIRH) + 5 : 7), d = Math.hypot(p.x - sx, p.y - sy); if (d < (u.T.r + 8) * z && d < bd) { bd = d; best = u; } }
  return best;
}
function pickBld(sx, sy) {
  const z = G.cam.z; let best = null, bd = -1e9;
  for (const b of G.blds) {
    const hh = BH[b.k] + (b.turret ? 14 : 0), p = w2s(b.x, b.y, hh * .5), dx = Math.abs(p.x - sx) / z, dy = Math.abs(p.y - sy) / z;
    if (dx < b.T.r * 1.05 && dy < b.T.r * .55 + hh * .5 && b.x + b.y > bd) { bd = b.x + b.y; best = b; }
  }
  return best;
}
function command(wx, wy, sx, sy, am) {
  const m = G.map; wx = clamp(wx, 8, m.WW - 8); wy = clamp(wy, 8, m.WH - 8);
  const us = ownSel(); us.forEach(clearStanding);
  if (!us.length) { const b = G.sel[0]; if (b && b.isB && b.team === 0 && b.T.makes) { b.rally = { x: wx, y: wy }; sfx('ui'); orderMark(wx, wy, 16, '120,255,170'); } return; }
  us.forEach(u => { u.job = null; });
  const mineB = sx !== undefined && !pick(sx, sy, false) ? pickBld(sx, sy) : null, advs = us.filter(u => u.k === 'adv');
  if (mineB && mineB.team === 0 && (mineB.hp > 0 || mineB.k === 'pad') && advs.length) {
    advs.forEach(u => orderMove([u], mineB.x, mineB.y));
    const rest = us.filter(u => u.k !== 'adv'); if (rest.length) orderMove(rest, wx, wy, am);
    orderMark(mineB.x, mineB.y, mineB.T.r + 16, '255,207,90'); sfx('ack_adv'); return;
  }
  let t = null;
  if (sx !== undefined) { t = pick(sx, sy, false); if (!t) { const b = pickBld(sx, sy); if (b && hostile(b.team, 0) && b.hp > 0) t = b; } }
  if (t) { orderAtk(us, t); orderMark(t.x, t.y, t.T.r + 14, '255,93,74'); }
  else {
    const cb = sx !== undefined ? pickBld(sx, sy) : null, vs = cb && capturable(cb, 0) ? us.filter(u => u.k === 'adv') : [];
    if (vs.length) { orderMove(vs, cb.x, cb.y); const rest = us.filter(u => u.k !== 'adv'); if (rest.length) orderMove(rest, wx, wy, am); orderMark(cb.x, cb.y, cb.T.r + 16, '120,255,170'); }
    else { orderMove(us, wx, wy, am); orderMark(wx, wy, am ? 28 : 22, am ? '255,170,80' : '120,255,170'); }
  }
  sfx('ack_' + us[0].k);
}
cv.addEventListener('contextmenu', e => e.preventDefault());
// Behave like a program, not a web page: no browser right-click menu anywhere, nothing can be dragged out, and, when run
// from the exe (a local file), the browser's own shortcuts for reload, zoom, print, view-source and developer tools do nothing.
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());
addEventListener('beforeunload', e => { if (location.protocol === 'file:' && G && !G.over) { saveGame(true); e.preventDefault(); e.returnValue = ''; } });
if (location.protocol === 'file:') {
  addEventListener('keydown', e => { const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey; if (e.key === 'F5' || e.key === 'F12' || e.key === 'F3' || e.key === 'F7' || (c && ['r', 'p', 'u', 'f', 'g', 'j', '+', '-', '=', '0'].includes(k)) || (c && e.shiftKey && ['i', 'j', 'c', 'r'].includes(k))) e.preventDefault(); }, true);
  addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false, capture: true });
}
$('mini').addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (!G || G.over) return; auInit();
  const w = s2w(e.clientX, e.clientY);
  if (e.button === 0) { if (G.mode) { if (G.mode.startsWith('b:')) { const nb = place(0, G.mode.slice(2), w.x, w.y, G.mode === 'b:pad' ? G.tk : undefined); sfx(nb ? 'build' : 'deny'); if (nb) voice(nb.k === 'pad' ? 'turret' : 'built'); if (nb) { G.sel = [nb]; if (!(e.shiftKey && nb.k === 'pad')) G.mode = null; } } else if (G.mode === 'patrol' || G.mode === 'guard') { orderSpecial(G.mode, w.x, w.y, e.clientX, e.clientY); G.mode = null; } else { usePower(0, G.mode, w.x, w.y); G.mode = null; } updHud(); return; } drag = { x: e.clientX, y: e.clientY, shift: e.shiftKey }; }
  else if (e.button === 2) { if (G.mode) { G.mode = null; return; } command(w.x, w.y, e.clientX, e.clientY, e.ctrlKey || e.altKey); }
  else if (e.button === 1) { pan = { x: e.clientX, y: e.clientY, cx: G.cam.x, cy: G.cam.y }; e.preventDefault(); }
});
addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
  if (pan && G) { const dx = (e.clientX - pan.x) / G.cam.z, dy = (e.clientY - pan.y) / G.cam.z; G.cam.x = clamp(pan.cx - (dx / (2 * K) + dy / K), 0, G.map.WW); G.cam.y = clamp(pan.cy - (dy / K - dx / (2 * K)), 0, G.map.WH); }
  if (miniDrag && G) { const p = miniPos(e); G.cam.x = p.x; G.cam.y = p.y; }
});
document.addEventListener('mouseleave', () => mouse.inside = false);
addEventListener('mouseup', e => {
  if (e.button === 1) pan = null; miniDrag = false;
  if (e.button !== 0 || !drag || !G) { if (e.button === 0) drag = null; return; }
  const d = drag; drag = null;
  const mine = G.units.filter(u => u.team === 0 && !u.dead && !u.T.temp && !u.T.convoy);
  if (Math.abs(e.clientX - d.x) < 5 && Math.abs(e.clientY - d.y) < 5) {
    const u = pick(e.clientX, e.clientY, true), now = performance.now();
    if (u) {
      if (now - lastClick.t < 320 && lastClick.k === u.k) G.sel = mine.filter(o => { if (o.k !== u.k) return false; const p = w2s(o.x, o.y); return p.x > 0 && p.x < W && p.y > 0 && p.y < H; });
      else if (d.shift) { const sel = G.sel.filter(o => !o.isB); const i = sel.indexOf(u); if (i >= 0) sel.splice(i, 1); else sel.push(u); G.sel = sel; }
      else G.sel = [u];
      lastClick = { t: now, k: u.k };
    } else { const bl = pick(e.clientX, e.clientY, false) || pickBld(e.clientX, e.clientY); G.sel = bl ? [bl] : []; lastClick = { t: 0, k: null }; }
    if (G.sel.length) sfx('ui');
  } else {
    const x0 = Math.min(d.x, e.clientX), x1 = Math.max(d.x, e.clientX), y0 = Math.min(d.y, e.clientY), y1 = Math.max(d.y, e.clientY);
    const got = mine.filter(u => { const p = w2s(u.x, u.y, u.T.air ? (u.alt || AIRH) : 6); return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1; });
    if (got.length) { G.sel = d.shift ? [...new Set([...G.sel.filter(o => !o.isB), ...got])] : got; sfx('ui'); } else if (!d.shift) G.sel = [];
  }
  updHud();
});
cv.addEventListener('wheel', e => { if (!G) return; e.preventDefault(); const c = G.cam, before = s2w(e.clientX, e.clientY); c.z = clamp(c.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), .45, 2.8); const after = s2w(e.clientX, e.clientY); c.x = clamp(c.x + before.x - after.x, 0, G.map.WW); c.y = clamp(c.y + before.y - after.y, 0, G.map.WH); }, { passive: false });
let miniDrag = false;
function miniPos(e) {
  const r = $('mini').getBoundingClientRect(), m = G.map;
  return { x: clamp((e.clientX - r.left) / r.width, 0, 1) * m.WW, y: clamp((e.clientY - r.top) / r.height, 0, 1) * m.WH };
}
$('mini').addEventListener('mousedown', e => {
  if (!G) return; e.preventDefault(); const p = miniPos(e);
  if (e.button === 0) { miniDrag = true; G.cam.x = p.x; G.cam.y = p.y; }
  else if (e.button === 2) command(p.x, p.y);
});
$('hud').addEventListener('pointerdown', e => { const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); act(b.dataset.act); } });
addEventListener('keydown', e => {
  keys[e.code] = true; if (!G) return;
  const d = e.code.startsWith('Digit') ? e.code.slice(5) : null;
  if (d && d !== '0') {
    if (!e.ctrlKey && G.sel[0] && G.sel[0].isB && G.sel[0].team === 0) { const b = document.querySelectorAll('#panel [data-act]:not(.ib)')[+d - 1]; if (b) act(b.dataset.act); return; }
    if (e.ctrlKey) { G.groups[d] = G.sel.filter(o => !o.isB && o.team === 0); e.preventDefault(); toast(tr('Group {0} set.', d)); }
    else if (G.groups[d]) { const g = G.groups[d].filter(u => !u.dead); if (g.length) { if (G.sel.length === g.length && g.every(u => G.sel.includes(u))) { G.cam.x = g[0].x; G.cam.y = g[0].y; } G.sel = g; updHud(); } }
    return;
  }
  switch (e.code) {
    case 'KeyS': if (e.ctrlKey) { e.preventDefault(); saveGame(false); } break;
    case 'KeyA': if (e.ctrlKey) { e.preventDefault(); G.sel = G.units.filter(u => u.team === 0 && !u.dead && !u.T.temp && !u.T.convoy && !u.T.hero); updHud(); } break;
    case 'KeyX': act('ord:stop'); break;
    case 'KeyZ': act('ord:hold'); break;
    case 'KeyV': act('ord:patrol'); break;
    case 'KeyC': act('ord:guard'); break;
    case 'KeyU': if (G.sel[0] && G.sel[0].isB) act('lvl:1'); break;
    case 'Period': case 'Tab': e.preventDefault(); act('idle'); break;
    case 'KeyQ': act('pw:strike'); break;
    case 'KeyE': act('pw:repair'); break;
    case 'KeyR': act('pw:sortie'); break;
    case 'KeyT': act('pw:laser'); break;
    case 'KeyB': act('bt:gun'); break;
    case 'KeyP': togglePause(); break;
    case 'KeyF': act('speed'); break;
    case 'KeyM': setMute(!AU.on); break;
    case 'KeyG': act('adv'); break;
    case 'KeyH': { const hq = G.blds.find(b => b.k === 'hq' && b.team === 0); if (hq) { G.cam.x = hq.x; G.cam.y = hq.y; } break; }
    case 'Space': e.preventDefault(); if (G.alertPos) { G.cam.x = G.alertPos.x; G.cam.y = G.alertPos.y; } break;
    case 'Escape': if (!$('confirm').classList.contains('hidden')) { const n = document.querySelector('#confirm [data-c=no]'); if (n) n.click(); } else if (G.mode) G.mode = null; else { G.sel = []; } updHud(); break;
  }
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.inside = false; });

function camera(dt) {
  const c = G.cam, sp = 900 * CFG.scroll / c.z * dt; let dx = 0, dy = 0;
  if (keys.ArrowLeft || (keys.KeyA && !keys.ControlLeft && !keys.ControlRight)) dx--; if (keys.ArrowRight || keys.KeyD) dx++;
  if (keys.ArrowUp || keys.KeyW) dy--; if (keys.ArrowDown || keys.KeyS) dy++;
  if (CFG.edge && mouse.inside && !drag && !pan && document.hasFocus()) { if (mouse.x < 6) dx--; if (mouse.x > W - 6) dx++; if (mouse.y < 6) dy--; if (mouse.y > H - 6) dy++; }
  dx *= sp; dy *= sp; // screen-aligned pan converted to world axes
  c.x = clamp(c.x + dx / (2 * K) + dy / K, 0, G.map.WW); c.y = clamp(c.y + dy / K - dx / (2 * K), 0, G.map.WH);
}

/* ---------- menu & loop ---------- */
// The theatre map is a simplified sketch for mission selection, not an accurate map. Both armies are fictional.
const ZONES = [
  { id: 'north', name: 'Kurdistan Region', sub: 'Northern mountains · Kurdish north', map: 2, col: '#4f9a62', mission: 'Hold the Pass',
    brief: 'Crimson armour is pushing through the mountain passes. Dig in around your Command Core and hold out for 8 minutes.',
    obj: { type: 'survive', time: 480 }, over: { weather: 'clear' }, label: [44.3, 36.35],
    pts: [[42.35, 37.1], [43, 37.35], [44.2, 37.25], [44.8, 37.15], [45, 36.5], [45.5, 36], [46.2, 35.8], [46, 35.1], [45.6, 34.6], [45, 34.9], [44.4, 35.5], [43.9, 35.9], [43.4, 36.4], [42.9, 36.7], [42.4, 36.8]] },
  { id: 'centre', name: 'Central Iraq', sub: 'Western desert and river plains · Sunni-majority centre', map: 0, col: '#b89a5e', mission: 'Desert Crossroads',
    brief: 'Two armies meet on the river plain in a dust wind. Capture what you can and destroy the Crimson Command Core.',
    obj: { type: 'destroy' }, over: { weather: 'dust', theme: 'desert' }, label: [42.3, 33.9],
    pts: [[42.35, 37.1], [42.4, 36.8], [42.9, 36.7], [43.4, 36.4], [43.9, 35.9], [44.4, 35.5], [45, 34.9], [45.6, 34.6], [45.5, 34], [46.1, 33.3], [46.2, 33], [45.3, 32.95], [44.3, 32.8], [43.7, 32.3], [43.5, 31.4], [43.2, 30.3], [42.1, 31.1], [40.4, 31.95], [39.2, 32.15], [38.8, 33.35], [41, 34.4], [41.2, 34.8], [41.3, 35.6], [41.4, 36.5]] },
  { id: 'south', name: 'Southern Iraq', sub: 'Marshes and oil fields · Shia-majority south', map: 1, col: '#3f8f96', mission: 'Secure the Oil Fields',
    brief: 'A storm covers the marshes. Capture and hold six Refineries or Ore Mines at the same time for 30 seconds to cut off Crimson’s fuel.',
    obj: { type: 'hold', n: 6, secs: 30 }, over: { weather: 'rain' }, label: [45.6, 31.3],
    pts: [[46.2, 33], [47.4, 32.4], [47.8, 31.8], [47.7, 31], [48, 30.5], [48.5, 29.95], [47.95, 30], [47.7, 30.1], [47.1, 30], [46.55, 29.1], [44.7, 29.2], [43.2, 30.3], [43.5, 31.4], [43.7, 32.3], [44.3, 32.8], [45.3, 32.95]] }
];
// Three missions per region, played in order. Progress and surviving veterans are kept in the browser's storage.
const MISSIONS = {
  north: [
    { mid: 'n1', map: 2, mission: 'Hold the Pass', brief: 'Crimson armour is pushing through the mountain passes. Dig in around your Command Core and hold out for 8 minutes.', obj: { type: 'survive', time: 480 }, over: { weather: 'clear' } },
    { mid: 'n2', map: 6, mission: 'Mountain Convoy', brief: 'Three supply trucks must reach the Ore Mine in the middle of the ridge. Clear the road and get at least two of them there. The convoy sets off after 60 seconds.', obj: { type: 'escort', count: 3, need: 2, delay: 60 }, over: { weather: 'clear' } },
    { mid: 'n4', map: 5, mission: 'Night Raid', brief: 'No reinforcements tonight: your factories are offline. Take the strike team through the pass in the dark and knock out the marked Crimson Refinery.', obj: { type: 'raid', target: 'refinery' }, over: { weather: 'clear', night: true } },
    { mid: 'n5', map: 7, mission: 'King of the Ridge', brief: 'Whoever holds the Ore Mine in the middle of the pass controls the road. Hold it for three and a half minutes in total before Crimson does. The clock starts after the first minute.', obj: { type: 'koth', secs: 210, grace: 60 }, over: { weather: 'dust' } },
    { mid: 'n3', map: 8, mission: 'Break the Siege', brief: 'Crimson has dug in across the ridge behind a fortified Command Core and armed turret pads. Destroy the Core.', obj: { type: 'destroy', boost: 1 }, over: { weather: 'dust' } }
  ],
  centre: [
    { mid: 'c1', map: 0, mission: 'Desert Crossroads', brief: 'Two armies meet on the river plain in a dust wind. Capture what you can and destroy the Crimson Command Core.', obj: { type: 'destroy' }, over: { weather: 'dust', theme: 'desert' } },
    { mid: 'c2', noVan: true, map: 9, mission: 'Strike the Depot', brief: 'Crimson’s Tank Factory is feeding the whole front. Knock it out or capture it within 7 minutes.', obj: { type: 'timed', time: 420 }, over: { weather: 'clear', theme: 'desert' } },
    { mid: 'c3', map: 10, mission: 'Defend the Outpost', brief: 'An allied outpost near the river is cut off and Crimson is coming for it. Keep it standing for 7 minutes.', obj: { type: 'defend', time: 420 }, over: { weather: 'dust', theme: 'desert' } },
    { mid: 'c4', noVan: true, map: 3, mission: 'Blitz', brief: 'Crimson is still digging in on the open flats. Destroy its Command Core within 10 minutes, before the defences are finished.', obj: { type: 'timed', time: 600, target: 'hq' }, over: { weather: 'clear', theme: 'desert' } },
    { mid: 'c5', map: 11, mission: 'Break the Machine', brief: 'Crimson holds every factory on its side of the desert. Knock out or capture all of its Tank Factories and Sky Docks.', obj: { type: 'purge', kinds: ['factory', 'airpad'], spread: true }, over: { weather: 'dust', theme: 'desert' } }
  ],
  south: [
    { mid: 's1', map: 1, mission: 'Secure the Oil Fields', brief: 'A storm covers the marshes. Capture and hold six Refineries or Ore Mines at the same time for 30 seconds to cut off Crimson’s fuel.', obj: { type: 'hold', n: 6, secs: 30 }, over: { weather: 'rain' } },
    { mid: 's2', map: 12, mission: 'Storm Convoy', brief: 'Three supply trucks must cross the causeways to the Sky Dock in the centre. Get at least two of them through. The convoy sets off after 60 seconds.', obj: { type: 'escort', count: 3, need: 2, delay: 60 }, over: { weather: 'rain' } },
    { mid: 's4', map: 4, mission: 'Air Superiority', brief: 'Crimson has taken every Sky Dock in the delta and its gunships are coming. Build Skyguards and flak, and hold out for 8 minutes.', obj: { type: 'survive', time: 480, air: true }, over: { weather: 'clear' } },
    { mid: 's5', map: 13, mission: 'Liberation', brief: 'Crimson occupies the whole eastern delta and its Command Core is fortified. Take the islands back one by one and destroy the Core.', obj: { type: 'destroy', boost: 1, spread: true }, over: { weather: 'rain' } },
    { mid: 's3', map: 14, mission: 'The Last Stronghold', brief: 'Crimson’s final Command Core is heavily fortified and well supplied. End the war here.', obj: { type: 'destroy', boost: 2 }, over: { weather: 'rain' } }
  ]
};
const ORDER = ['n1', 'n2', 'n4', 'n5', 'n3', 'c1', 'c2', 'c3', 'c4', 'c5', 's1', 's2', 's4', 's5', 's3'];
const mapOf = (z, m) => m && m.map !== undefined ? m.map : z.map;
for (const t of [UT, TT, BT, PW]) for (const k in t) trProps(t[k], ['name', 'desc']);
for (const m of MAPS) trProps(m, ['name', 'desc']);
for (const z of ZONES) { trProps(z, ['name', 'sub', 'mission', 'brief']); for (const m of MISSIONS[z.id]) trProps(m, ['mission', 'brief']); }
const CAMP = { done: {}, vets: [], all: false };
try { Object.assign(CAMP, JSON.parse(localStorage.getItem('sm_camp')) || {}); } catch (e) {}
function campSave() { try { localStorage.setItem('sm_camp', JSON.stringify(CAMP)); } catch (e) {} }
function mUnlocked(mid) { const i = ORDER.indexOf(mid); return CAMP.all || i <= 0 || CAMP.done[mid] > 0 || CAMP.done[ORDER[i - 1]] > 0; }
function findMission(mid) { for (const z of ZONES) for (const m of MISSIONS[z.id]) if (m.mid === mid) return { z, m }; return null; }
const DIFFTXT = { easy: 'Slower attacks and a weaker economy. Good for learning.', normal: 'A fair fight.', hard: 'Faster attacks and a stronger economy.' };
let selZone = null, selM = null, selDiff = 'normal';
function objText() {
  const o = G.obj, mm = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'), left = () => mm(Math.max(0, o.time - G.t));
  if (o.type === 'survive') return tr('Objective: hold out — {0} left', left());
  if (o.type === 'hold') return tr('Objective: hold {0} Refineries or Mines ({1}/{0})', o.n, G.objN || 0) + (G.holdT ? tr(' — holding {0}s of {1}', G.holdT, o.secs) : '');
  if (o.type === 'escort') return G.conv.gone ? tr('Objective: escort the convoy — arrived {0}/{1}, trucks left {2}', G.conv.arrived, o.need, G.units.filter(u => u.T.convoy && !u.dead).length) : tr('Objective: escort the convoy — it sets off in {0}', mm(Math.max(0, o.delay - G.t)));
  const tgt = G.blds.find(b => b.objTarget), tn = tgt ? tgt.T.name : tr('target');
  if (o.type === 'timed') return tgt && tgt.k === 'hq' ? tr('Objective: destroy the Crimson Command Core — {0} left', left()) : tr('Objective: knock out the marked {0} — {1} left', tn, left());
  if (o.type === 'raid') return tr('Objective: knock out the marked {0} — strike team only, no reinforcements', tn);
  if (o.type === 'koth') { const h = G.blds.find(b => b.hill), k = G.ms.koth; return tr('Objective: hold the central {0} — you {1} · Crimson {2} of {3}', h ? h.T.name : tr('structure'), mm(k[0]), mm(k[1]), mm(o.secs)); }
  if (o.type === 'purge') return tr('Objective: knock out every Crimson Tank Factory and Sky Dock ({0} left)', G.objN === undefined ? '…' : G.objN);
  if (o.type === 'defend') return tr('Objective: keep the Allied Outpost standing — {0} left', left());
  if (G.spec) return tr('Watching: your allies fight on ({0} enemy Cores left)', G.teams.filter((t, i) => t.alive && hostile(i, 0)).length);
  if (G.sk) return tr('Objective: destroy every enemy Command Core ({0} left)', G.teams.filter((t, i) => t.alive && hostile(i, 0)).length);
  return tr('Objective: destroy the Crimson Command Core');
}
function winNow(why, keep) {
  if (G.over) return; G.over = true; G.why = why || ''; const g = G; let wait = 1200;
  if (keep) { // reinforcements arrive: air strikes sweep the attackers around what you were defending
    const foes = G.units.filter(u => u.team === 1 && !u.dead && !u.T.air && dist(u, keep) < 900).sort((a, b) => dist(a, keep) - dist(b, keep)), hit = [];
    for (const u of foes) { if (hit.length >= 6) break; if (!hit.some(h => dist(h, u) < 110)) hit.push(u); }
    hit.forEach((u, i) => G.strikes.push({ x: u.x, y: u.y, team: 0, t: .5 + i * .45, n: 7, gap: 0 }));
    for (const u of G.units) if (u.team === 1 && !u.dead) { u.order = null; u.tgt = null; }
    toast('Reinforcements have arrived. Crimson is pulling back!', 'good'); sfx('cap'); if (hit.length) wait = 5200;
  }
  setTimeout(() => { if (G === g) endGame(true); }, wait);
}
function loseNow(msg) { if (G.over) return; G.over = true; G.why = msg; toast(msg, 'bad'); const g = G; setTimeout(() => { if (G === g) endGame(false); }, 1600); }
function checkObjective() { // runs once a second
  const o = G.obj; if (G.over || !G.teams[0].alive) return;
  if (o.type === 'survive') { if (G.t >= o.time) winNow(tr('You held out for the full {0} minutes and your Command Core is still standing.', Math.round(o.time / 60)), G.blds.find(b => b.k === 'hq' && b.team === 0)); }
  else if (o.type === 'hold') { G.objN = G.blds.filter(b => b.team === 0 && b.T.income && b.k !== 'hq' && b.hp > 0).length; if (G.objN >= o.n) { G.holdT = (G.holdT || 0) + 1; if (G.holdT >= o.secs) winNow(tr('You held {0} income structures for {1} seconds.', o.n, o.secs)); } else G.holdT = 0; }
  else if (o.type === 'escort') {
    const c = G.conv; let alive = 0;
    if (!c.gone && G.t >= o.delay) { c.gone = true; toast('The convoy is moving out. Protect it!', 'good'); sfx('cap'); }
    for (const u of G.units) {
      if (!u.T.convoy || u.dead) continue;
      if (c.gone && dist(u, c.dest) < 120) { u.dead = true; c.arrived++; part('ring', u.x, u.y, 0, 0, .6, 40, '120,255,170'); toast(tr('A supply truck has arrived ({0}/{1}).', c.arrived, o.need), 'good'); sfx('cap'); continue; }
      alive++; if (c.gone && !u.order) orderMove([u], c.dest.x + (rnd() - .5) * 60, c.dest.y + (rnd() - .5) * 40);
    }
    if (c.arrived >= o.need) winNow(tr('The convoy got through ({0} trucks arrived).', c.arrived)); else if (c.arrived + alive < o.need) loseNow('Too many trucks were lost.');
  }
  else if (o.type === 'timed') { const t = G.blds.find(b => b.objTarget); if (!t || t.team !== 1 || t.hp <= 0) winNow('The target was knocked out in time.'); else if (G.t >= o.time) loseNow('Time ran out.'); }
  else if (o.type === 'defend') { const p = G.blds.find(b => b.k === 'outpost'); if (!p || p.team !== 0 || p.hp <= 0) loseNow('The outpost has fallen.'); else if (G.t >= o.time) winNow('The Allied Outpost is still standing.', p); }
  else if (o.type === 'raid') { const t = G.blds.find(b => b.objTarget); if (!t || t.team !== 1 || t.hp <= 0) winNow('The strike team knocked out the target.'); else if (!G.units.some(u => u.team === 0 && !u.dead && !u.T.temp && !u.T.convoy && !u.T.hero)) loseNow('The strike team was wiped out.'); }
  else if (o.type === 'koth') {
    const h = G.blds.find(b => b.hill), k = G.ms.koth; if (h && h.hp > 0 && h.team >= 0 && G.t >= (o.grace || 0)) k[h.team]++;
    if (k[0] >= o.secs) winNow('You held the hill long enough.'); else if (k[1] >= o.secs) loseNow('Crimson held the hill for too long.');
    if (h && capturable(h, 1) && Math.floor(G.t) % 20 === 0) { const sq = G.units.filter(u => u.team === 1 && !u.dead && !u.T.air && !u.order).sort((a, b) => dist(a, h) - dist(b, h)).slice(0, 3); if (sq.length) { orderMove(sq, h.x, h.y + h.T.r * .5); sq.forEach(u => u.busy = G.t + 16); } }
  }
  else if (o.type === 'purge') { G.objN = G.blds.filter(b => b.team === 1 && b.hp > 0 && o.kinds.includes(b.k)).length; if (!G.objN) winNow('Every Crimson factory is out of action.'); }
}
// what the computer goes for in missions that have a special target
function missionTarget(ti) {
  if (ti !== 1) return null; const o = G.obj;
  if (o.type === 'escort' && G.conv.gone) return G.units.find(u => u.T.convoy && !u.dead) || null;
  if (o.type === 'defend') return G.blds.find(b => b.k === 'outpost' && b.team === 0 && b.hp > 0) || null;
  if (o.type === 'koth') return G.blds.find(b => b.hill && b.team === 0 && b.hp > 0) || null;
  return null;
}
function objPoints() { // places to ring on the ground and the minimap
  const o = G.obj, P = (e, r, col) => ({ x: e.x, y: e.y, r, col });
  if (o.type === 'escort') return [{ x: G.conv.dest.x, y: G.conv.dest.y, r: 60, col: '255,207,90' }];
  if (o.type === 'timed' || o.type === 'raid') { const t = G.blds.find(b => b.objTarget); return t ? [P(t, t.T.r + 22, '255,93,74')] : []; }
  if (o.type === 'defend') { const p = G.blds.find(b => b.k === 'outpost'); return p ? [P(p, p.T.r + 22, '120,255,170')] : []; }
  if (o.type === 'koth') { const h = G.blds.find(b => b.hill); return h ? [P(h, h.T.r + 24, h.team === 0 ? '120,255,170' : h.team === 1 ? '255,93,74' : '255,207,90')] : []; }
  if (o.type === 'purge') return G.blds.filter(b => b.team === 1 && b.hp > 0 && o.kinds.includes(b.k) && expAt(b.x, b.y)).map(b => P(b, b.T.r + 20, '255,93,74'));
  return [];
}
function setupMission(loading) {
  const o = G.obj, m = G.map, hq = G.blds.find(b => b.k === 'hq' && b.team === 0), ehq = G.blds.find(b => b.k === 'hq' && b.team === 1), tm1 = G.teams[1];
  G.ms = { koth: [0, 0] }; G.noProd = o.type === 'raid'; G.noVan = G.noProd || !!(G.zone && G.zone.noVan) || !!(G.sk && !G.sk.van); // some missions are fought without the command craft, on both sides
  const give = b => { b.team = 1; b.hp = b.k === 'pad' ? 0 : maxHp(b); if (b.T.makes) b.prod = b.T.makes.includes('bt0') ? 'bt0' : b.T.makes[0]; };
  if (o.spread) { // Crimson starts holding its half of the map; you start with a war chest and an escort
    for (const b of G.blds) if (b.team === -1 && b.k !== 'pad' && b.x > m.WW * .5) give(b);
    G.teams[0].credits += 1000; tm1.waveT *= 1.4; ['bt0', 'bt0', 'bt0', 'bt0', 'ad0', 'eng'].forEach((k, i) => mkUnit(k, 0, hq.x - 100 + i * 42, hq.y + 135));
  }
  if (o.air) { // every Sky Dock is Crimson's; you start with some air defence
    for (const b of G.blds) if (b.team === -1 && b.k === 'airpad') { give(b); b.lvl = 1; }
    G.teams[0].credits += 400; ['ad0', 'ad0', 'ad0'].forEach((k, i) => mkUnit(k, 0, hq.x - 40 + i * 42, hq.y + 135));
    const pd = G.blds.find(b => b.k === 'pad' && b.team === 0 && !b.turret); if (pd) { pd.turret = 'flak'; pd.hp = TT.flak.hp; }
  }
  if (o.boost) { ehq.lvl = Math.min(2, o.boost); ehq.hp = maxHp(ehq); tm1.credits += 400 * o.boost; for (const b of G.blds) if (b.k === 'pad' && b.team === 1 && !b.turret) { b.turret = rnd() < .5 ? 'gun' : 'cannon'; b.hp = TT[b.turret].hp; } }
  if (o.type === 'escort') {
    const c = G.def.center[0];
    G.conv = { dest: { x: (c[1] + .5) * TILE, y: (c[2] + .5) * TILE + BT[c[0]].r + 44 }, arrived: 0, gone: false };
    for (let i = 0; i < o.count; i++) { const u = mkUnit('truck', 0, hq.x - 60 + i * 60, hq.y + 135); u.a = u.ta = .6; }
    tm1.waveT = Math.min(tm1.waveT, o.delay + 45);
  } else if (o.type === 'timed' || o.type === 'raid') {
    const kind = o.target || 'factory', t = kind === 'hq' ? ehq : G.blds.filter(b => b.team === 1 && b.k === kind).sort((a, b) => dist(a, ehq) - dist(b, ehq))[0];
    if (t) { t.objTarget = true; if (t.k !== 'hq') { t.fort = true; t.hp = maxHp(t); } }
    if (o.type === 'raid') { // the strike team: this is all you get
      let i = 0; for (const [k, n] of [['bt0', 4], ['ar1', 2], ['ad1', 2], ['eng', 2], ['bt0', 2]]) for (let j = 0; j < n; j++, i++) mkUnit(k, 0, hq.x - 110 + (i % 6) * 44, hq.y + 130 + (i / 6 | 0) * 40);
      tm1.waveT *= 1.6;
    }
  } else if (o.type === 'koth') {
    const c = G.def.center[0], cx = (c[1] + .5) * TILE, cy = (c[2] + .5) * TILE, h = G.blds.slice().sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    if (h) h.hill = true;
  } else if (o.type === 'defend') {
    const px = hq.x + (m.WW / 2 - hq.x) * .5, py = hq.y + (m.WH / 2 - hq.y) * .5;
    const b = G.blds.filter(b => b.team === -1 && b.k !== 'pad' && b.k !== 'robot').sort((a, c) => Math.hypot(a.x - px, a.y - py) - Math.hypot(c.x - px, c.y - py))[0];
    if (b) { b.k = 'outpost'; b.T = BT.outpost; b.team = 0; b.hp = BT.outpost.hp; b.prod = null; }
    tm1.waveT = Math.min(tm1.waveT, 120);
  }
  if (!loading && G.zone && G.zone.mid && CAMP.vets.length) { // veterans from the last victory
    let n = 0; CAMP.vets.forEach((v, i) => { if (!UT[v.k] || UT[v.k].temp || UT[v.k].convoy) return; const u = mkUnit(v.k, 0, hq.x - 100 + (i % 6) * 40, hq.y + 180 + (i / 6 | 0) * 34); u.rank = v.rank; u.kills = v.kills; u.hp = maxHp(u); n++; });
    if (n) setTimeout(() => G && toast(tr(n > 1 ? '{0} veterans report for duty.' : '{0} veteran reports for duty.', n), 'good'), 2500);
  }
}
function showScreen(id) { for (const q of document.querySelectorAll('.mscreen')) q.classList.toggle('hidden', q.id !== 'm-' + id); }
function pickZone(z) { selZone = z; const ms = MISSIONS[z.id]; selM = ms.find(m => mUnlocked(m.mid) && !CAMP.done[m.mid]) || ms.filter(m => mUnlocked(m.mid)).pop() || ms[0]; }
function buildZones() {
  const X = lon => ((lon - 38.3) * 56).toFixed(1), Y = lat => ((37.7 - lat) * 66).toFixed(1), path = pts => 'M' + pts.map(p => X(p[0]) + ' ' + Y(p[1])).join('L') + 'Z';
  const line = pts => 'M' + pts.map(p => X(p[0]) + ' ' + Y(p[1])).join('L');
  let h = '<defs><filter id="zsh"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity=".6"/></filter></defs><g filter="url(#zsh)">';
  for (const z of ZONES) h += `<path class="zone${selZone === z ? ' on' : ''}${mUnlocked(MISSIONS[z.id][0].mid) ? '' : ' locked'}" data-zone="${z.id}" d="${path(z.pts)}" fill="${z.col}"/>`;
  h += '</g>';
  h += `<path class="river" d="${line([[42.4, 37.05], [43.1, 36.35], [43.3, 35.3], [43.9, 34.2], [44.4, 33.3], [45.3, 32.5], [46.6, 31.6], [47.4, 31], [47.8, 30.5], [48.4, 30]])}"/>`;
  h += `<path class="river" d="${line([[41.0, 34.4], [42.4, 34.1], [43.3, 33.4], [44.2, 32.6], [44.6, 31.9], [46.2, 31.05], [47.4, 31]])}"/>`;
  for (const [nm, lon, lat] of [['Erbil', 44, 36.2], ['Mosul', 43.1, 36.35], ['Baghdad', 44.4, 33.3], ['Ramadi', 43.3, 33.4], ['Najaf', 44.3, 32], ['Basra', 47.8, 30.5]]) h += `<circle class="city" cx="${X(lon)}" cy="${Y(lat)}" r="3"/><text class="cityt" x="${+X(lon) + 6}" y="${+Y(lat) + 4}">${tr(nm)}</text>`;
  for (const z of ZONES) { const n = MISSIONS[z.id].filter(m => CAMP.done[m.mid]).length; h += `<text class="zlabel" x="${X(z.label[0])}" y="${Y(z.label[1])}">${z.name}</text><text class="zsub" x="${X(z.label[0])}" y="${+Y(z.label[1]) + 16}">${mUnlocked(MISSIONS[z.id][0].mid) ? tr('{0}/{1} complete', n, MISSIONS[z.id].length) : tr('locked')}</text>`; }
  $('iraq').innerHTML = h;
  const z = selZone;
  if (!z) { $('zinfo').innerHTML = '<h3>' + tr('Select a region') + '</h3><p class="sub2">' + tr('Each region has five missions, played in order. Finishing a region opens the next one, from north to south.') + '</p>'; $('znext').disabled = true; return; }
  let t = `<img class="zflag" alt="${z.name} flag" src="${mkFlag(z.id).toDataURL()}"><h3>${z.name}</h3><div class="sub2">${z.sub}</div>`;
  MISSIONS[z.id].forEach((m, i) => { const un = mUnlocked(m.mid), dn = CAMP.done[m.mid] || 0; t += `<div class="mrow${selM === m ? ' on' : ''}${un ? '' : ' locked'}" data-mis="${m.mid}"><b>${i + 1}. ${m.mission}</b><span>${dn ? '★'.repeat(dn) : tr(un ? 'open' : 'locked')}</span></div>`; });
  const ok = selM && mUnlocked(selM.mid);
  t += selM ? `<p>${ok ? selM.brief : tr('Locked. Win the mission before it to open this one.')}</p><p class="sub2">${tr('Battlefield: {0}', MAPS[mapOf(z, selM)].name)}${selM.over.night ? ' · ' + tr('night') : ''} · ${tr(selM.over.weather === 'rain' ? 'storm' : selM.over.weather === 'dust' ? 'dust wind' : 'clear')}${CAMP.vets.length ? ' · ' + tr('{0} veterans will join you', CAMP.vets.length) : ''}</p>` : '';
  $('zinfo').innerHTML = t; $('znext').disabled = !ok;
}
function buildDiffs() {
  $('dtitle').textContent = selM ? selM.mission + ' — ' + selZone.name : tr('Difficulty');
  $('diffs').innerHTML = Object.keys(DIFF).map(d => `<div class="card ${d === selDiff ? 'on' : ''}" data-diff="${d}"><h4>${tr(d[0].toUpperCase() + d.slice(1))}</h4><p>${tr(DIFFTXT[d])}</p></div>`).join('');
}
function withLoading(fn) { const L = $('loading'); L.classList.remove('hidden'); setTimeout(() => { try { fn(); } finally { requestAnimationFrame(() => requestAnimationFrame(() => L.classList.add('hidden'))); } }, 70); } // the page gets a chance to paint the loading screen before the heavy work starts
const SK = { n: 2, map: 0, diffs: ['normal', 'normal', 'normal'], al: [0, 1, 2, 3], slots: [0, 1, 2, 3], credits: 1500, van: true, wx: 'clear', flag: 'azure' };
try { Object.assign(SK, JSON.parse(localStorage.getItem('sm_sk')) || {}); } catch (e) {}
const PREV = {};
const SKC = { grass: [64, 102, 58], dirt: [122, 106, 76], water: [26, 70, 108], shal: [58, 124, 142], road: [150, 140, 118], rock: [98, 100, 106], dgrass: [186, 160, 108], ddirt: [156, 128, 86], droad: [206, 190, 150] };
const COMPASS = ['East', 'South-east', 'South', 'South-west', 'West', 'North-west', 'North', 'North-east'];
function skMap() { return PREV[SK.map] || (PREV[SK.map] = buildMap(MAPS[SK.map], true)); }
function skStarts() { return skMap().sites.filter(q => q.k === 'hq').sort((a, b) => a.o - b.o); } // one Command Core site per sector, in sector order
// the ground, drawn once per map and palette at the size of the canvas: every pixel takes the terrain that dominates around it, so shores and rock edges come out smooth instead of blocky
function skGround(m, PW, PH, desert) {
  const key = 'g' + PW + (desert ? 'd' : ''); if (m[key]) return m[key];
  const c = document.createElement('canvas'); c.width = PW; c.height = PH; const g = c.getContext('2d'), img = g.createImageData(PW, PH), d = img.data, w = m.w, hh = m.h, t = m.t, wt = [0, 0, 0, 0, 0];
  const COL = desert ? [SKC.dgrass, SKC.ddirt, SKC.water, SKC.droad, SKC.rock] : [SKC.grass, SKC.dirt, SKC.water, SKC.road, SKC.rock];
  for (let py = 0; py < PH; py++) { const fy = (py + .5) / PH * hh - .5, y0 = Math.max(0, Math.min(hh - 2, Math.floor(fy))), ty = clamp(fy - y0, 0, 1);
    for (let px = 0; px < PW; px++) { const fx = (px + .5) / PW * w - .5, x0 = Math.max(0, Math.min(w - 2, Math.floor(fx))), tx = clamp(fx - x0, 0, 1);
      wt[0] = wt[1] = wt[2] = wt[3] = wt[4] = 0; wt[t[y0 * w + x0]] += (1 - tx) * (1 - ty); wt[t[y0 * w + x0 + 1]] += tx * (1 - ty); wt[t[(y0 + 1) * w + x0]] += (1 - tx) * ty; wt[t[(y0 + 1) * w + x0 + 1]] += tx * ty;
      let k = 0; for (let i = 1; i < 5; i++) if (wt[i] > wt[k]) k = i;
      let col = COL[k]; const n = ((Math.sin(px * 12.9898 + py * 78.233) * 43758.5453) % 1 + 1) % 1, i4 = (py * PW + px) * 4; let sh = .94 + n * .12;
      if (k === 2) { const dp = clamp((wt[2] - .5) * 2.2, 0, 1); col = [SKC.shal[0] + (SKC.water[0] - SKC.shal[0]) * dp, SKC.shal[1] + (SKC.water[1] - SKC.shal[1]) * dp, SKC.shal[2] + (SKC.water[2] - SKC.shal[2]) * dp]; sh = .97 + n * .06; } // lighter in the shallows
      else if (wt[2] > .22) sh *= 1.14; // pale shore
      else if (k === 4) sh *= .9 + (wt[4] - .5) * .5; // rock gets lighter towards the middle of an outcrop
      d[i4] = col[0] * sh; d[i4 + 1] = col[1] * sh; d[i4 + 2] = col[2] * sh; d[i4 + 3] = 255;
    } }
  g.putImageData(img, 0, 0); return (m[key] = c);
}
function skPreview() {
  const cvs = $('skprev'); if (!cvs) return; const m = skMap(), D = Math.min(2, window.devicePixelRatio || 1), CW = 400, PW = Math.round(CW * D), PH = Math.round(PW * m.h / m.w), sc = PW / m.w, g = cvs.getContext('2d');
  cvs.width = PW; cvs.height = PH; cvs.style.width = CW + 'px'; cvs.style.height = Math.round(CW * m.h / m.w) + 'px';
  g.drawImage(skGround(m, PW, PH, SK.wx === 'dust' || MAPS[SK.map].theme === 'desert'), 0, 0);
  if (SK.wx === 'night') { g.fillStyle = 'rgba(6,10,30,.5)'; g.fillRect(0, 0, PW, PH); }
  const P = q => [(q.x + .5) * sc, (q.y + .5) * sc], SCOL = { mine: '#e0b040', tech: '#6eebff', foundry: '#ff9a4a', robot: '#c58bff', airpad: '#9fd0ff' };
  for (const q of m.sites) { if (q.k === 'hq' || q.k === 'pad') continue; const p = P(q), r = 3.6 * D, own = q.o >= 0 ? SK.slots.slice(0, SK.n).indexOf(q.o) : -1; g.fillStyle = own >= 0 ? TEAMC[own].c : SCOL[q.k] || '#e8ecef'; g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 1.2 * D; g.beginPath(); g.roundRect(p[0] - r, p[1] - r, r * 2, r * 2, r * .45); g.fill(); g.stroke(); }
  for (const q of skStarts()) { const p = P(q), ti = SK.slots.slice(0, SK.n).indexOf(q.o), R = 12 * D;
    if (ti < 0) { g.setLineDash([4 * D, 3 * D]); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.6 * D; g.beginPath(); g.arc(p[0], p[1], R * .8, 0, TAU); g.stroke(); g.setLineDash([]); continue; } // free start: click to take it
    if (ti === 0) { g.strokeStyle = '#ffcf5a'; g.lineWidth = 2.4 * D; g.beginPath(); g.arc(p[0], p[1], R + 5 * D, 0, TAU); g.stroke(); }
    g.fillStyle = TEAMC[ti].c; g.strokeStyle = '#fff'; g.lineWidth = 2 * D; g.beginPath(); g.arc(p[0], p[1], R, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 ' + 14 * D + 'px "Segoe UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ABCD'[SK.al[ti]], p[0], p[1] + D);
  }
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.strokeRect(1, 1, PW - 2, PH - 2);
}
// what a start position offers: where it is, and the neutral structures that are closer to it than to any other start
function skSpec(sec) {
  const m = skMap(), starts = skStarts(), me = starts.find(q => q.o === sec); if (!me) return '';
  const ang = Math.atan2(me.y - (m.h - 1) / 2, me.x - (m.w - 1) / 2), dir = COMPASS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8], cnt = {};
  for (const q of m.sites) { if (q.o >= 0 || q.k === 'pad') continue; let best = null, bd = 1e9; for (const st of starts) { const d = Math.hypot(st.x - q.x, st.y - q.y); if (d < bd) { bd = d; best = st; } } if (best === me && bd < Math.max(m.w, m.h) * .42) cnt[q.k] = (cnt[q.k] || 0) + 1; }
  const near = Object.keys(cnt).map(k => (cnt[k] > 1 ? cnt[k] + '× ' : '') + BT[k].name).join(tr(', '));
  return tr('{0} start', tr(dir)) + (near ? ' · ' + tr('Nearby to capture: {0}', near) : '');
}
function buildSkirmish() {
  if (mapCap(MAPS[SK.map] || MAPS[0]) < SK.n) SK.map = MAPS.findIndex(d => mapCap(d) >= SK.n);
  if (!SK.al.slice(1, SK.n).some(a => a !== SK.al[0])) SK.al[1] = SK.al[0] === 1 ? 2 : 1; // there must be someone to fight
  { const cap = mapCap(MAPS[SK.map]), sl = (SK.slots || []).slice(0, SK.n); if (sl.length < SK.n || sl.some((v, i) => !(v >= 0 && v < cap) || sl.indexOf(v) !== i)) SK.slots = [0, 1, 2, 3]; } // every army needs its own sector on this map
  const opt = (v, t, cur) => '<option value="' + v + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + t + '</option>', TEAMN = ['A', 'B', 'C', 'D'];
  let t = '<div class="skrow"><span>' + tr('Armies') + '</span><span class="seg">' + [2, 3, 4].map(n => '<button data-sk="n:' + n + '" class="' + (SK.n === n ? 'on' : '') + '">' + n + '</button>').join('') + '</span></div>';
  t += '<div class="skrow"><span>' + tr('Battlefield') + '</span><select data-sk="map">' + MAPS.map((d, i) => mapCap(d) >= SK.n ? opt(i, d.name + ' (' + mapCap(d) + ')', SK.map) : '').join('') + '</select></div>';
  t += '<div class="skprevw"><canvas id="skprev" title="' + tr('Click a start position to play from there') + '"></canvas><small>' + tr('Click a start position to play from there. The gold ring is you; letters are teams; small squares are structures to capture.') + '</small><div class="skspec"><b>' + tr('Your position') + ':</b> ' + skSpec(SK.slots[0]) + '</div></div>';
  t += '<div class="skrow"><span><i class="dot" style="background:' + TEAMC[0].c + '"></i>' + tr('You') + '</span><span>' + tr('Team') + ' <select data-sk="al:0">' + TEAMN.slice(0, SK.n).map((q, i) => opt(i, q, SK.al[0])).join('') + '</select></span></div>';
  for (let i = 1; i < SK.n; i++) t += '<div class="skrow"><span><i class="dot" style="background:' + TEAMC[i].c + '"></i>' + tr(TEAMC[i].n) + ' <small class="skpos">' + skSpec(SK.slots[i]).split(' · ')[0] + '</small></span><span><select data-sk="diff:' + i + '">' + ['easy', 'normal', 'hard'].map(d => opt(d, tr(d[0].toUpperCase() + d.slice(1)), SK.diffs[i - 1])).join('') + '</select> ' + tr('Team') + ' <select data-sk="al:' + i + '">' + TEAMN.slice(0, SK.n).map((q, j) => opt(j, q, SK.al[i])).join('') + '</select></span></div>';
  t += '<div class="skrow"><span>' + tr('Starting credits') + '</span><select data-sk="credits">' + [500, 1500, 3000].map(c => opt(c, c, SK.credits)).join('') + '</select></div>';
  t += '<div class="skrow"><span>' + tr('Weather') + '</span><select data-sk="wx">' + [['clear', 'clear'], ['rain', 'storm'], ['dust', 'dust wind'], ['night', 'night'], ['random', 'random']].map(q => opt(q[0], tr(q[1]), SK.wx)).join('') + '</select></div>';
  t += '<div class="skrow"><span>' + tr('Your flag') + '</span><select data-sk="flag">' + [['azure', 'Azure'], ['north', 'Kurdistan Region'], ['centre', 'Central Iraq'], ['south', 'Southern Iraq']].map(q => opt(q[0], tr(q[1]), SK.flag)).join('') + '</select></div>';
  t += '<label class="skrow"><span>' + tr('Vanguard') + '</span><input type="checkbox" data-sk="van"' + (SK.van ? ' checked' : '') + '></label>';
  t += '<p class="sub2" style="margin:8px 0 0">' + tr('Armies with the same team letter are allies: they share what they see and do not attack each other. The last alliance with a Command Core wins.') + '</p>';
  $('skbox').innerHTML = t; skPreview();
}
function skChange(k, v) {
  const [a, i] = k.split(':');
  if (a === 'n') SK.n = +i; else if (a === 'map') SK.map = +v; else if (a === 'diff') SK.diffs[+i - 1] = v; else if (a === 'al') SK.al[+i] = +v; else if (a === 'credits') SK.credits = +v; else if (a === 'van') SK.van = !!v; else SK[a] = v;
  try { localStorage.setItem('sm_sk', JSON.stringify(SK)); } catch (e) {} buildSkirmish();
}
$('skbox').addEventListener('click', e => {
  const b = e.target.closest('button[data-sk]'); if (b) { sfx('ui'); skChange(b.dataset.sk); return; }
  if (e.target.id !== 'skprev') return; // a click on the map: take the nearest start position
  const m = skMap(), r = e.target.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * m.w - .5, my = (e.clientY - r.top) / r.height * m.h - .5; let best = null, bd = 1e9;
  for (const q of skStarts()) { const d = Math.hypot(q.x - mx, q.y - my); if (d < bd) { bd = d; best = q; } }
  if (!best || bd > Math.max(m.w, m.h) * .12 || best.o === SK.slots[0]) return;
  const j = SK.slots.slice(0, SK.n).indexOf(best.o); if (j > 0) SK.slots[j] = SK.slots[0]; SK.slots[0] = best.o; // swap with whoever was there, or move to a free start
  sfx('ui'); try { localStorage.setItem('sm_sk', JSON.stringify(SK)); } catch (er) {} buildSkirmish();
});
$('skbox').addEventListener('change', e => { const el = e.target.closest('[data-sk]'); if (el) skChange(el.dataset.sk, el.type === 'checkbox' ? el.checked : el.value); });
$('skgo').addEventListener('click', () => {
  auInit(); const wx = SK.wx === 'random' ? ['clear', 'rain', 'dust', 'night'][Math.random() * 4 | 0] : SK.wx, d = MAPS[SK.map];
  const sk = { n: SK.n, slots: SK.slots.slice(0, SK.n), diffs: SK.diffs.slice(), al: SK.al.slice(), credits: SK.credits, van: SK.van, flag: SK.flag, over: { weather: wx === 'night' ? 'clear' : wx, night: wx === 'night', theme: wx === 'dust' ? 'desert' : d.theme } };
  withLoading(() => startGame(SK.map, sk.diffs[0], null, false, sk));
});
function launch() { auInit(); withLoading(() => startGame(mapOf(selZone, selM), selDiff, Object.assign({}, selZone, selM))); }
$('menu').addEventListener('click', e => {
  const m = e.target.closest('[data-m]'), z = e.target.closest('[data-zone]'), d = e.target.closest('[data-diff]'), ms = e.target.closest('[data-mis]');
  if (m) { auInit(); sfx('ui'); const id = m.dataset.m; if (id === 'exit') askExit(false); else if (id === 'continue') withLoading(loadGame); else { showScreen(id); if (id === 'zones') buildZones(); if (id === 'skirmish') buildSkirmish(); if (id === 'settings') buildSettings(); if (id === 'main') buildMain(); } }
  if (z) { pickZone(ZONES.find(q => q.id === z.dataset.zone)); auInit(); sfx('ui'); buildZones(); }
  if (ms) { selM = MISSIONS[selZone.id].find(q => q.mid === ms.dataset.mis); sfx('ui'); buildZones(); }
  if (d) { selDiff = d.dataset.diff; buildDiffs(); }
});
$('znext').addEventListener('click', () => { if (selM && mUnlocked(selM.mid)) { buildDiffs(); showScreen('diff'); } });
$('start').addEventListener('click', launch);
/* ---------- settings ---------- */
const CFG = { edge: true, scroll: 1, cb: false, voice: true, lang: 'en', tut: true, clouds: true };
try { Object.assign(CFG, JSON.parse(localStorage.getItem('sm_cfg')) || {}); } catch (e) {}
const TEAM_STD = TEAMC.map(t => Object.assign({}, t)), TEAM_CB = [{ c: '#3b8fff', d: '#1b4f9c', l: '#b5d6ff', n: 'Azure' }, { c: '#ffb000', d: '#8a5a00', l: '#ffe2a0', n: 'Crimson' }, { c: '#e9eef2', d: '#7d8891', l: '#ffffff', n: 'Amber' }, { c: '#c06bd8', d: '#6a2f80', l: '#ecc8f6', n: 'Violet' }];
function applyCfg() {
  const src = CFG.cb ? TEAM_CB : TEAM_STD; for (let i = 0; i < TEAMC.length; i++) Object.assign(TEAMC[i], src[i]);
  delete FLAGS.crimson; delete FLAGS.azure; delete FLAGS.t2; delete FLAGS.t3; document.documentElement.style.setProperty('--red', TEAMC[1].c);
  try { localStorage.setItem('sm_cfg', JSON.stringify(CFG)); } catch (e) {}
}
function buildSettings() {
  for (const el of document.querySelectorAll('#m-settings [data-cfg]')) { const k = el.dataset.cfg; if (el.type === 'checkbox') el.checked = !!CFG[k]; else el.value = CFG[k] * 100; }
  $('scv').textContent = Math.round(CFG.scroll * 100) + '%'; $('smus').value = AU.vol.m * 100; $('sfxv').value = AU.vol.f * 100; $('svo').value = AU.vol.v * 100;
  $('unlockall').textContent = tr(CAMP.all ? 'Lock missions again' : 'Unlock all missions'); $('resetcamp').textContent = tr('Reset campaign progress'); $('slang').value = LANG; $('resetcamp').dataset.arm = ''; $('setmsg').textContent = tr('{0} of {1} missions complete · {2} veterans waiting', Object.keys(CAMP.done).length, ORDER.length, CAMP.vets.length);
}
$('m-settings').addEventListener('input', e => {
  const el = e.target, k = el.dataset.cfg;
  if (k) { CFG[k] = el.type === 'checkbox' ? el.checked : el.value / 100; applyCfg(); $('scv').textContent = Math.round(CFG.scroll * 100) + '%'; }
  else if (el.id === 'smus') { setVol('m', el.value / 100); $('vmus').value = el.value; } else if (el.id === 'sfxv') { setVol('f', el.value / 100); $('vfx').value = el.value; } else if (el.id === 'svo') setVol('v', el.value / 100);
});
$('svo').addEventListener('change', () => { auInit(); VO.q.length = 0; delete VO.last.upgraded; voice('upgraded', true); }); // play one line so the new level can be heard
$('unlockall').addEventListener('click', () => { CAMP.all = !CAMP.all; campSave(); buildSettings(); });
$('resetcamp').addEventListener('click', e => { // asks twice before erasing
  const b = e.currentTarget; if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = tr('Click again to erase all progress'); return; }
  CAMP.done = {}; CAMP.vets = []; CAMP.all = false; campSave(); try { localStorage.removeItem('sm_save'); } catch (er) {} buildSettings(); $('setmsg').textContent = tr('Campaign progress erased.');
});

/* ---------- save and load ---------- */
function saveGame(auto) {
  if (!G || G.over || !((G.zone && G.zone.mid) || G.sk)) return false;
  const R = v => Math.round(v * 10) / 10, m = G.map;
  const data = {
    v: 4, mid: G.zone ? G.zone.mid : null, sk: G.sk || null, mi: G.mi, spec: !!G.spec, name: G.zone ? G.zone.mission : G.def.name, diff: G.diffName, when: Date.now(), t: G.t, speed: G.speed, cam: G.cam, objN: G.objN, holdT: G.holdT, conv: G.conv, ms: G.ms, uid,
    teams: G.teams.map(t => ({ credits: t.credits, rp: t.rp || 0, dmgU: t.dmgU, arm: t.arm, alive: t.alive, pw: t.pw, res: t.res || null, waveT: t.waveT, waves: t.waves || 0, kills: t.kills, lost: t.lost, advT: t.advT || 0, outAt: t.outAt || 0 })),
    blds: G.blds.map(b => ({ id: b.id, k: b.k, tx: b.x / TILE | 0, ty: b.y / TILE | 0, team: b.team, hp: R(b.hp), lvl: b.lvl || 0, fort: !!b.fort, turret: b.turret, ft: b.ft, lines: b.lines || null, engQ: b.engQ || 0, prod: b.prod, prevProd: b.prevProd || null, paid: b.paid, pt: R(b.pt), rally: b.rally, up: b.up || null, built: !!b.built, cap: b.cap, capTeam: b.capTeam, objTarget: !!b.objTarget, hill: !!b.hill, ta: R(b.ta) })),
    units: G.units.filter(u => !u.dead && !u.T.temp).map(u => {
      const o = u.order, last = o && o.path && o.path.length ? o.path[o.path.length - 1] : null;
      return { id: u.id, k: u.k, team: u.team, x: R(u.x), y: R(u.y), a: R(u.a), hp: R(u.hp), kills: u.kills, rank: u.rank, spdM: u.spdM, hpM: u.hpM, dmgM: u.dmgM, regen: !!u.regen, hold: !!u.hold, patrol: u.patrol || null, guard: u.guard ? u.guard.id : 0, busy: u.busy, ord: !o ? null : o.k === 'atk' ? { k: 'atk', tgt: o.tgt ? o.tgt.id : 0 } : last ? { k: o.k, x: R(last.x), y: R(last.y) } : null };
    }),
    exp: Array.from(m.exp).join(''), groups: Object.fromEntries(Object.entries(G.groups).map(([k, g]) => [k, g.filter(u => !u.dead).map(u => u.id)]))
  };
  try { localStorage.setItem('sm_save', JSON.stringify(data)); } catch (e) { if (!auto) toast('Could not save: the browser’s storage is full or blocked.', 'bad'); return false; }
  if (!auto) { toast('Game saved.', 'good'); sfx('ui'); }
  return true;
}
function saveInfo() { try { const d = JSON.parse(localStorage.getItem('sm_save')); return d && d.v === 4 && (findMission(d.mid) || (d.sk && MAPS[d.mi] && d.teams && d.teams.length === d.sk.n)) ? d : null; } catch (e) { return null; } }
function loadGame() {
  const d = saveInfo(); if (!d) return false;
  const fm = d.sk ? null : findMission(d.mid), byId = new Map(); auInit();
  if (fm) { selZone = fm.z; selM = fm.m; selDiff = d.diff; startGame(mapOf(fm.z, fm.m), d.diff, Object.assign({}, fm.z, fm.m), true); }
  else { startGame(d.mi, d.diff, null, true, d.sk); G.spec = !!d.spec; }
  G.blds = [];
  for (const q of d.blds) { const b = mkBld({ k: q.k, x: q.tx, y: q.ty, o: q.team }); Object.assign(b, { id: q.id, hp: q.hp, lvl: q.lvl, fort: q.fort, turret: q.turret, ft: q.ft, lines: q.lines || undefined, engQ: q.engQ || 0, prod: q.prod, prevProd: q.prevProd, paid: q.paid, pt: q.pt, rally: q.rally, up: q.up, built: q.built, cap: q.cap, capTeam: q.capTeam, objTarget: q.objTarget, hill: q.hill, ta: q.ta }); byId.set(b.id, b); }
  G.units = []; const pend = [];
  const heroSeen = {}; for (const q of d.units) { if (!UT[q.k]) continue; if (UT[q.k].hero) { if (heroSeen[q.team]) continue; heroSeen[q.team] = 1; } // a save from an older version may hold several: keep one per side
    const u = mkUnit(q.k, q.team, q.x, q.y); Object.assign(u, { id: q.id, a: q.a, ta: q.a, hp: q.hp, kills: q.kills, rank: q.rank, spdM: q.spdM, hpM: q.hpM, dmgM: q.dmgM, regen: q.regen, hold: q.hold, patrol: q.patrol, busy: q.busy || 0 }); byId.set(u.id, u); pend.push([u, q]); }
  for (const [u, q] of pend) {
    if (q.guard) u.guard = byId.get(q.guard) || null;
    if (q.ord) { if (q.ord.k === 'atk') { const t = byId.get(q.ord.tgt); if (t) u.order = { k: 'atk', tgt: t, path: null, i: 0, rp: 0 }; } else orderMove([u], q.ord.x, q.ord.y, q.ord.k === 'amove'); }
  }
  let top = d.uid || 0; for (const k of byId.keys()) top = Math.max(top, k + 1); uid = Math.max(uid, top);
  d.teams.forEach((t, i) => Object.assign(G.teams[i], t)); setupFactories(); // factories from a save without line data get the standard layout
  Object.assign(G, { t: d.t, speed: d.speed || 1, objN: d.objN, holdT: d.holdT, conv: d.conv || G.conv, ms: d.ms || G.ms, sel: [], incT: 0 }); Object.assign(G.cam, d.cam);
  for (const k in d.groups) G.groups[k] = d.groups[k].map(id => byId.get(id)).filter(Boolean);
  for (let i = 0; i < G.map.exp.length && i < d.exp.length; i++) G.map.exp[i] = d.exp.charCodeAt(i) === 49 ? 1 : 0;
  updFog(); $('bspeed').textContent = tr('Speed {0}×', G.speed); $('toasts').innerHTML = ''; toast(tr('Loaded: {0}.', fm ? fm.m.mission : tr('Skirmish') + ' — ' + G.def.name), 'good'); updHud();
  return true;
}
function buildMain() {
  const d = saveInfo(), b = $('bcont'); b.classList.toggle('hidden', !d);
  if (d) { const s = Math.floor(d.t); b.innerHTML = tr('Continue') + ' <small>' + (d.sk ? tr('Skirmish') + ' — ' + MAPS[d.mi].name : findMission(d.mid).m.mission) + ' · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</small>'; }
}
// The page's own fixed text (menus, help, top bar) is remembered once in English, then rewritten for the chosen language.
const I18N = [];
(function scanStatic() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (!p || p.closest('script,style,[data-keep]')) continue; const raw = n.nodeValue, src = raw.replace(/\s+/g, ' ').trim(); if (src) I18N.push({ n, src, lead: /^\s/.test(raw) ? ' ' : '', trail: /\s$/.test(raw) ? ' ' : '' }); }
  for (const el of document.querySelectorAll('[title]')) I18N.push({ el, src: el.getAttribute('title') });
})();
function applyLang(l) {
  if (l !== undefined) { LANG = LANGS[l] ? l : 'en'; CFG.lang = LANG; try { localStorage.setItem('sm_cfg', JSON.stringify(CFG)); } catch (e) {} voLoad(); $('toasts').innerHTML = ''; }
  const de = document.documentElement; de.lang = LANG; de.dir = LANG === 'en' ? 'ltr' : 'rtl';
  for (const q of I18N) { if (q.el) q.el.setAttribute('title', tr(q.src)); else if (q.n.isConnected) q.n.nodeValue = q.lead + tr(q.src) + q.trail; }
  for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('on', b.dataset.lang === LANG);
  $('bspeed').textContent = tr('Speed {0}×', G ? G.speed : 1); $('bmute').textContent = tr(AU.on ? 'Sound on' : 'Sound off'); $('bidle').textContent = tr('Idle {0}', 0);
  buildMain(); buildSettings(); if (selZone) buildZones(); buildDiffs(); buildSkirmish(); if (G) updHud();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) { auInit(); sfx('ui'); applyLang(b.dataset.lang); } });
$('slang').addEventListener('change', e => applyLang(e.target.value));
applyCfg(); applyLang(); showScreen('main');

// The pointer shows what a right click will do with the selected units: attack, capture, upgrade (Vanguard) or dock (Vanguard on your Core).
let curNow = '';
function updCursor() {
  let c = '';
  if (G && !G.over && mouse.inside && !G.mode) {
    const us = ownSel();
    if (us.length) {
      if (pick(mouse.x, mouse.y, false)) c = CUR.atk;
      else {
        const b = pickBld(mouse.x, mouse.y), van = us.some(u => u.k === 'adv');
        if (b && b.team === 0) { if (van) c = b.hp > 0 && (b.k !== 'pad' || b.turret) && b.hp < maxHp(b) ? CUR.fix : b.k === 'hq' ? CUR.dock : ''; }
        else if (b && capturable(b, 0)) { if (us.some(u => !u.T.air || u.T.hero)) c = CUR.cap; }
        else if (b && hostile(b.team, 0) && b.hp > 0) c = CUR.atk;
      }
    }
  }
  if (c !== curNow) { curNow = c; cv.style.cursor = c; }
}
// Errors are caught so the game keeps running, and the last few are kept in storage (sm_err) so they can be read afterwards.
const ERRS = { t: 0, n: 0 };
function logErr(where, e) {
  const now = performance.now(); if (now - ERRS.t < 2000 || ERRS.n > 40) return; ERRS.t = now; ERRS.n++;
  try { let q = []; try { q = JSON.parse(localStorage.getItem('sm_err')) || []; } catch (x) {} q.push({ when: Date.now(), where, t: G ? Math.round(G.t) : -1, map: G ? G.mi : -1, msg: String(e && e.message || e), stack: String(e && e.stack || '').slice(0, 700) }); localStorage.setItem('sm_err', JSON.stringify(q.slice(-6))); } catch (x) {}
  if (window.console) console.error('[' + where + ']', e);
}
let last = performance.now(), lastFrame = last, rafId = 0;
function frame(now, slow) {
  cancelAnimationFrame(rafId); rafId = requestAnimationFrame(frame); // asked for first, so nothing below can stop the loop
  lastFrame = performance.now(); if (!(now > 0)) now = lastFrame;
  const real = clamp((now - last) / 1000, 0, slow === true ? .1 : .05), sub = slow === true ? 2 : 1; last = now;
  if (G) try {
    camera(real);
    if (!G.paused) for (let i = 0; i < G.speed * sub; i++) update(real / sub);
    G.uiT -= real; if (G.uiT <= 0) { G.uiT = .25; updHud(); }
    G.saveT = (G.saveT || 0) + real; if (G.saveT > 45) { G.saveT = 0; if (!G.paused) saveGame(true); } // autosave
  } catch (e) { logErr('update', e); }
  try { if (ASSETS.ready) { render(); updCursor(); } } catch (e) { logErr('render', e); }
}
rafId = requestAnimationFrame(frame);
// Watchdog: if the browser stops handing out animation frames while the window is still in view (it can wrongly decide the
// window is covered), drive the game from a timer instead so the battle never stands still.
setInterval(() => { const n = performance.now(); if (!document.hidden && n - lastFrame > 350) frame(n, true); }, 90);

// Load the assets, then let the game draw. Until then the loading screen stays up.
{ const box = $('loading'), lt = box.querySelector('.lt'), was = lt.textContent; box.classList.remove('hidden'); lt.textContent = tr('Loading assets…');
  loadAssets().then(() => { ASSETS.ready = true; lt.textContent = was; box.classList.add('hidden'); },
    e => { ASSETS.fail = e; logErr('assets', e); box.querySelector('.spin').style.display = 'none'; lt.style.cssText = 'max-width:640px;text-align:center;line-height:1.5'; lt.textContent = 'The assets folder could not be read: ' + (e && e.message || e) + '. Start the game with "Play Steel Meridian.bat" or Steel Meridian.exe.'; }); }
// small hook for debugging from the console
$('vmus').value = AU.vol.m * 100; $('vfx').value = AU.vol.f * 100;
$('vmus').addEventListener('input', e => setVol('m', e.target.value / 100)); $('vfx').addEventListener('input', e => setVol('f', e.target.value / 100));
// Pictures of single assets for documents (docs/report): draws one model on the game canvas and returns it as a PNG. Needs a battle to be running.
function thumb(kind, k, o) {
  o = o || {}; const px = o.px || 360, keep = [S, CX, CY, OX], a = o.a === undefined ? .5 : o.a; OX = 0; S = o.z || 4; CX = px / 2; CY = px * (o.cy || .62);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, px, px);
  try {
    if (kind === 'unit') { const u = { k, T: UT[k], team: o.team || 0, x: 0, y: 0, a, ta: o.ta === undefined ? a : o.ta, id: 1, odo: 0, flash: 0, hp: 1, order: o.order ? {} : null }; unitShadow(u); drawUnit(u); }
    else { const kk = kind === 'turret' ? 'pad' : k, b = { isB: true, k: kk, T: BT[kk], team: o.team === undefined ? 0 : o.team, x: 0, y: 0, hp: o.wreck ? 0 : 1, lvl: o.lvl || 0, fort: !!o.fort, turret: kind === 'turret' ? k : null, ta: o.ta === undefined ? .6 : o.ta, cd: 0, paid: !!o.paid }; bldShadow(b); drawBld(b); }
  } finally { S = keep[0]; CX = keep[1]; CY = keep[2]; OX = keep[3]; ctx.globalAlpha = 1; }
  const c = document.createElement('canvas'); c.width = c.height = px; c.getContext('2d').drawImage(cv, 0, 0, px, px, 0, 0, px, px); return c.toDataURL('image/png');
}
window.SM = { thumb,  get G() { return G; }, tr, applyLang, updHud, get LANG() { return LANG; }, AU, VO, voice, sfx, auInit, engineUpdate, start: startGame, render, UT, mkUnit, findPath, step: (n, dt) => { for (let i = 0; i < n; i++) update(dt || .05); } };
})();

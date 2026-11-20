'use strict';
/* Tank demo: sound effects (mockup, see ../tank-fx-design.md).
 * - Where the game already has a recording (sounds/README.txt: tank gun, artillery, explosions, laser; all CC0) the demo plays it,
 *   pitched by tank size, with a synthesised layer under it.
 * - Sounds the game has no recording for (rockets, flame jet, the Fusion and Graviton weapons, engines, fire) are synthesised
 *   here with the Web Audio API, so the demo adds no sound files.
 * - Every sound gets a stereo position and a loudness from where it happens on the screen. */
window.createSfx = function (base, demoBase) {
  const FILES = { shell: ['shell_1.wav', 'shell_2.wav', 'shell_3.wav'], arty: ['arty_1.wav', 'arty_2.wav'], boom: ['boom_1.wav', 'boom_2.wav', 'boom_3.wav'],
    bigboom: ['bigboom_1.wav', 'bigboom_2.wav'], laser: ['laser_1.wav'], flak: ['flak_1.wav', 'flak_2.wav'] };
  // Candidate recordings for the Anti-Air rocket launch, in the demo's own sounds/ folder (see sounds/README.txt there): real
  // rocket, missile and thruster sounds from OpenGameArt, all CC0.
  const RFILES = { rocket: 'k_rocket.ogg', missile: 'k_missile.wav', thruster: 'k_thruster.ogg', engine: 'k_engine.wav', launch: 'k_launch.wav',
    heavyshot: 'r_heavyshot.wav', shoot: 'r_shoot.wav', fire_a: 'r_fire_a.wav', fire_b: 'r_fire_b.wav', wind: 'r_wind.wav', swoosh: 'r_swoosh.wav' };   // second line: the first set (shot and whoosh recordings)
  // Each option is a list of [recording, { g: loudness, rate: speed, cut: length in seconds, off: start this far into the file }].
  // Some recordings are very quiet, so their loudness is well above 1.
  const ROCKET = {
    rocket:   [['rocket', { g: 2.4, rate: 1.15, cut: 1.0, off: 0.2 }]],
    missile:  [['missile', { g: 6, rate: 1.3, cut: 1.1, off: 0.25 }]],
    thruster: [['thruster', { g: 1.3, cut: 0.9, off: 0.5 }], ['engine', { g: 0.45, rate: 2, cut: 0.7 }]],
    roar:     [['rocket', { g: 1.8, rate: 1.15, cut: 1.0, off: 0.2 }], ['engine', { g: 0.5, rate: 2.2, cut: 0.8 }]],
    hiss:     [['launch', { g: 0.22, rate: 0.55, cut: 0.9, off: 2.2 }], ['missile', { g: 5, rate: 1.3, cut: 1.1, off: 0.25 }]],
    // the first set, brought back to compare: a shot recording plus a fire or wind whoosh (these have no extra pop)
    fire:     [['heavyshot', { g: 0.7 }], ['fire_a', { g: 0.6, rate: 1.2, cut: 0.9, off: 0.08 }]],
    rush:     [['shoot', { g: 0.8 }], ['fire_b', { g: 0.55, rate: 1.3, cut: 0.8, off: 0.08 }]],
    wind:     [['heavyshot', { g: 0.35 }], ['wind', { g: 0.6, rate: 1.3, cut: 0.8, off: 0.08 }]],
    swoosh:   [['swoosh', { g: 0.7, rate: 1.2, cut: 0.8 }]],
  };
  const NOPOP = { fire: 1, rush: 1, wind: 1, swoosh: 1 };
  const PITCH = [1.22, 1, 0.82];                             // light, medium, heavy
  const rnd = (a, b) => a + Math.random() * (b - a);
  let ctx = null, master = null, noiseBuf = null, on = true, vol = 0.7, ends = [], rocketMode = 'rocket';
  const smp = {}, last = {}, loops = {};

  function unlock() {                                        // browsers allow sound only after a click or a key
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
    master = ctx.createGain(); master.gain.value = on ? vol : 0; master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const [name, files] of Object.entries(FILES)) {
      smp[name] = [];
      for (const f of files) fetch(base + f).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => ctx.decodeAudioData(b)).then((buf) => smp[name].push(buf)).catch(() => {});
    }
    for (const [n, file] of Object.entries(RFILES)) { smp['r_' + n] = []; fetch(demoBase + file).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => ctx.decodeAudioData(b)).then((buf) => smp['r_' + n].push(buf)).catch(() => {}); }
    makeLoops();
  }
  const shape = (param, t, dur, g, att = 0.004) => { param.setValueAtTime(0.0001, t); param.linearRampToValueAtTime(g, t + att); param.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, att + 0.01)); };
  function noise(dst, t, dur, o) {                           // filtered noise: o = { type, f0, f1, q, g, att }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7; f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ctx.createGain(); shape(g.gain, t, dur, o.g, o.att);
    s.connect(f); f.connect(g); g.connect(dst); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function tone(dst, t, dur, o) {                            // a pitched sweep: o = { type, f0, f1, g, att }
    const s = ctx.createOscillator(); s.type = o.type || 'sine'; s.frequency.setValueAtTime(o.f0, t);
    if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ctx.createGain(); shape(g.gain, t, dur, o.g, o.att);
    s.connect(g); g.connect(dst); s.start(t); s.stop(t + dur + 0.05);
  }
  function sample(dst, t, name, o) {                         // a recording from sounds/; false when it is not loaded
    const list = smp[name]; if (!list || !list.length) return false;
    const s = ctx.createBufferSource(); s.buffer = list[(Math.random() * list.length) | 0]; s.playbackRate.value = (o.rate || 1) * rnd(0.96, 1.04);
    const g = ctx.createGain(); g.gain.setValueAtTime(o.g, t);
    s.connect(g); g.connect(dst); s.start(t, o.off || 0);
    if (o.cut) { g.gain.setValueAtTime(o.g, t + o.cut * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + o.cut); s.stop(t + o.cut + 0.02); }
    return true;
  }

  // ---- one-shot sounds: (output, start time, options) with o.size 0..2
  const S = {
    // Panzer gun (owner's choice, 2026-11-21: the "recorded mix"): the game's artillery and explosion recordings, played faster
    // and cut short, with a sharp crack on top. Until the recordings are loaded, a synthesised stand-in plays.
    cannon(d, t, o) {
      const z = PITCH[o.size];
      if (smp.arty && smp.arty.length && smp.boom && smp.boom.length) { sample(d, t, 'arty', { rate: 1.5 * z, g: 0.8, cut: 0.7 }); sample(d, t, 'boom', { rate: 1.6 * z, g: 0.5, cut: 0.45 }); }
      else { noise(d, t, 0.38 / z, { f0: 1400 * z, f1: 110, g: 0.9 }); tone(d, t, 0.26 / z, { f0: 150 * z, f1: 40 * z, g: 0.75 }); }
      noise(d, t, 0.025, { type: 'highpass', f0: 2000, g: 0.5, att: 0.001 });
    },
    arty(d, t, o) {                                          // Artillery gun: deeper, longer
      const z = PITCH[o.size];
      if (!sample(d, t, 'arty', { rate: z, g: 0.85 })) noise(d, t, 0.7 / z, { f0: 900 * z, f1: 70, g: 1 });
      tone(d, t, 0.6 / z, { f0: 90 * z, f1: 28 * z, g: 0.9 }); noise(d, t + 0.05, 1.3, { f0: 420, f1: 90, g: 0.3, att: 0.1 });
    },
    whistle(d, t, o) { tone(d, t, o.dur || 0.8, { f0: 1500, f1: 520, g: 0.12, att: (o.dur || 0.8) * 0.7 }); },          // a shell coming down
    rocket(d, t, o) {                                        // Anti-Air launch
      const z = PITCH[o.size];
      if (ROCKET[rocketMode]) {                              // one of the library recordings
        let ok = false;
        for (const [n, q] of ROCKET[rocketMode]) ok = sample(d, t, 'r_' + n, { rate: (q.rate || 1) * z, g: q.g, cut: q.cut, off: q.off }) || ok;
        if (ok) { if (!NOPOP[rocketMode]) noise(d, t, 0.05, { type: 'highpass', f0: 1800, g: 0.3 }); return; }   // plus a small pop as it leaves the tube
      }
      if (rocketMode === 'mix' && smp.flak && smp.flak.length && smp.arty && smp.arty.length) {   // the game's own recordings: a gun pop, then a synthesised rush
        sample(d, t, 'flak', { rate: 0.7 * z, g: 0.5, cut: 0.3 }); sample(d, t, 'arty', { rate: 2.2 * z, g: 0.3, cut: 0.3 });
        noise(d, t, 0.7, { type: 'bandpass', q: 0.9, f0: 400 * z, f1: 2200 * z, g: 0.45, att: 0.08 }); noise(d, t, 0.6, { f0: 260, f1: 110, g: 0.35, att: 0.04 }); return;
      }
      noise(d, t, 0.06, { type: 'highpass', f0: 1800, g: 0.45 }); noise(d, t, 0.6, { type: 'bandpass', q: 1.2, f0: 500 * z, f1: 2600 * z, g: 0.5, att: 0.06 });
      noise(d, t, 0.5, { f0: 300, f1: 120, g: 0.4, att: 0.03 });
    },
    flak(d, t) { noise(d, t, 0.14, { type: 'bandpass', q: 0.8, f0: 1900, f1: 500, g: 0.7 }); tone(d, t, 0.2, { f0: 150, f1: 55, g: 0.5 }); noise(d, t + 0.02, 0.5, { f0: 500, f1: 100, g: 0.25, att: 0.03 }); },
    hit(d, t) { noise(d, t, 0.07, { type: 'bandpass', q: 2, f0: 2600, g: 0.5 }); tone(d, t, 0.1, { type: 'triangle', f0: 950, f1: 280, g: 0.3 }); noise(d, t, 0.25, { f0: 700, f1: 120, g: 0.5 }); },
    boom(d, t, o) {                                          // artillery shell lands
      if (!sample(d, t, 'boom', { rate: PITCH[o.size] * 0.95, g: 0.8 })) noise(d, t, 0.9, { f0: 1200, f1: 60, g: 1 });
      tone(d, t, 0.5, { f0: 100, f1: 30, g: 0.8 });
    },
    death(d, t, o) {                                         // a tank is destroyed: explosion, then falling metal
      const z = PITCH[o.size];
      if (!sample(d, t, o.size === 2 ? 'bigboom' : 'boom', { rate: z * 0.9, g: 1 })) noise(d, t, 1.2, { f0: 1500, f1: 50, g: 1 });
      tone(d, t, 0.8, { f0: 110 * z, f1: 26, g: 1 }); noise(d, t + 0.1, 1.6, { f0: 500, f1: 70, g: 0.4, att: 0.2 });
      for (let i = 0; i < 4; i++) { const tt = t + rnd(0.35, 1.3); noise(d, tt, 0.09, { type: 'bandpass', q: 9, f0: rnd(700, 2400), g: 0.22 }); }
    },
    laser(d, t) {                                            // Light Special
      sample(d, t, 'laser', { rate: 1.25, g: 0.3, cut: 0.3 });
      tone(d, t, 0.22, { type: 'sawtooth', f0: 2300, f1: 520, g: 0.16 }); tone(d, t, 0.2, { f0: 3400, f1: 1300, g: 0.14 });
    },
    charge(d, t) { tone(d, t, 0.56, { f0: 170, f1: 1500, g: 0.26, att: 0.5 }); tone(d, t, 0.56, { type: 'sawtooth', f0: 85, f1: 760, g: 0.09, att: 0.5 }); },   // Fusion-Lambda charging
    fusion(d, t) {                                           // Fusion-Lambda fires
      noise(d, t, 0.09, { type: 'highpass', f0: 2200, g: 0.7 }); tone(d, t, 0.55, { type: 'sawtooth', f0: 980, f1: 55, g: 0.4 });
      tone(d, t, 0.7, { f0: 75, f1: 32, g: 0.9 }); noise(d, t, 0.7, { type: 'bandpass', q: 3, f0: 3200, f1: 300, g: 0.25 });
    },
    // Graviton (Heavy Special). Two versions to compare (owner, 2026-11-21: the first, fully synthesised one was not good).
    // 'rec' is built from the game's recordings, as the Panzer gun is: the laser recording played at half speed for a heavy
    // beam, with a slowed artillery shot as the kick; on landing a short rush, then the big explosion recordings played slow.
    gravfire(d, t, o) {
      if (smp.laser && smp.laser.length && smp.arty && smp.arty.length) {
        sample(d, t, 'laser', { rate: 0.5, g: 0.6, cut: Math.max(0.5, Math.min(1.8, o.dur || 1.2)) }); sample(d, t, 'arty', { rate: 0.85, g: 0.4, cut: 0.55 });
        tone(d, t, 0.5, { f0: 70, f1: 38, g: 0.7, att: 0.01 }); return;
      }
      tone(d, t, 0.55, { f0: 48, f1: 150, g: 0.8, att: 0.12 }); tone(d, t, 0.8, { type: 'triangle', f0: 320, f1: 80, g: 0.3, att: 0.05 }); noise(d, t, 0.6, { f0: 180, f1: 500, g: 0.4, att: 0.25 }); },
    gravimp(d, t) {                                          // Graviton lands: the air is sucked in, then the blast
      if (smp.bigboom && smp.bigboom.length && smp.boom && smp.boom.length) {
        noise(d, t, 0.46, { type: 'bandpass', q: 1.5, f0: 220, f1: 2600, g: 0.4, att: 0.42 });
        const b = t + 0.45; sample(d, b, 'bigboom', { rate: 0.75, g: 1 }); sample(d, b, 'boom', { rate: 0.6, g: 0.6 }); tone(d, b, 1.1, { f0: 85, f1: 24, g: 0.9, att: 0.004 });
        return;
      }
      noise(d, t, 0.46, { type: 'bandpass', q: 1.5, f0: 180, f1: 3400, g: 0.55, att: 0.42 }); tone(d, t, 0.46, { f0: 60, f1: 420, g: 0.4, att: 0.42 });
      const b = t + 0.45; tone(d, b, 1.3, { f0: 95, f1: 22, g: 1 }); noise(d, b, 1.1, { f0: 800, f1: 60, g: 0.8 }); tone(d, b, 0.5, { type: 'sawtooth', f0: 600, f1: 70, g: 0.25 });
    },
    crackle(d, t) { noise(d, t, rnd(0.015, 0.04), { type: 'highpass', f0: rnd(1500, 4000), g: rnd(0.15, 0.4) }); },
  };
  // o: pan -1..1, gain 0..1, size 0..2, dur. At most ~28 sounds at once and the same sound at most every 35 ms.
  function play(name, o = {}) {
    if (!ctx || !on || ctx.state !== 'running') return;
    const now = ctx.currentTime, gain = o.gain == null ? 1 : o.gain;
    if (gain < 0.03 || now - (last[name] || -1) < 0.035) return;
    ends = ends.filter((e) => e > now); if (ends.length > 28 && name !== 'death') return;
    last[name] = now; ends.push(now + 0.6);
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan || 0));
    g.connect(p); p.connect(master);
    S[name](g, now + 0.005, Object.assign({ size: 1 }, o));
  }
  // ---- sounds that run all the time and only change loudness: the flame jet and the engines
  function makeLoops() {
    const src = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random()); return s; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const out = (max) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); return { g, max }; };
    const fl = out(0.5), roar = filt('lowpass', 560), hiss = filt('bandpass', 1700, 0.8), hg = ctx.createGain(); hg.gain.value = 0.35;
    const flut = ctx.createGain(); flut.gain.value = 0.8; const lfo = ctx.createOscillator(); lfo.frequency.value = 13; const lg = ctx.createGain(); lg.gain.value = 0.2;
    lfo.connect(lg); lg.connect(flut.gain); lfo.start();
    const n1 = src(); n1.connect(roar); roar.connect(flut); n1.connect(hiss); hiss.connect(hg); hg.connect(flut); flut.connect(fl.g); loops.flame = fl;
    const en = out(0.2), lp = filt('lowpass', 210);
    for (const f of [41, 61.5, 82.6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    const rum = filt('lowpass', 95), rg = ctx.createGain(); rg.gain.value = 2.2; src().connect(rum); rum.connect(rg); rg.connect(lp); lp.connect(en.g); loops.engine = en;
  }
  function loop(name, level) { const l = loops[name]; if (ctx && l) l.g.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * l.max, ctx.currentTime, 0.09); }
  function setOn(v) { on = v; if (master) master.gain.setTargetAtTime(on ? vol : 0, ctx.currentTime, 0.03); }
  function setVolume(v) { vol = v; if (master && on) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.03); }
  return { unlock, play, loop, setOn, setVolume, setRocket: (v) => { rocketMode = v; }, rocket: () => rocketMode, ready: () => !!ctx && ctx.state === 'running', samples: () => Object.values(smp).reduce((a, l) => a + l.length, 0) };
};

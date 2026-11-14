// Records the Steel Meridian announcer with ElevenLabs. The lines are in tools/voice-lines.json.
// The API key is read from the ELEVENLABS_API_KEY environment variable only; it is never printed or written to a file.
//
//   node tools/elevenlabs-voice.js check                 key works? credits left, models that speak Sorani Kurdish, female voices
//   node tools/elevenlabs-voice.js test <voiceId,...>    one test line per language for each voice  -> tools/voice-test/
//   node tools/elevenlabs-voice.js all <voiceId> [langs] every line (langs: en,ar,ckb; default all)  -> tools/voice-out/<lang>/
//
// Optional: ELEVEN_KEYS=key1,key2 records only those lines with "all".
// Optional: ELEVEN_MODEL to force a model id (default: the first model in the account that lists Sorani Kurdish, "ckb").
const fs = require('fs'), path = require('path');
const KEY = process.env.ELEVENLABS_API_KEY, API = 'https://api.elevenlabs.io', HERE = __dirname, RATE = 24000;
if (!KEY) { console.error('ELEVENLABS_API_KEY is not set.'); process.exit(2); }
const LINES = JSON.parse(fs.readFileSync(path.join(HERE, 'voice-lines.json'), 'utf8'));
const [, , cmd, a1, a2] = process.argv;

async function api(p, opt = {}) {
  const r = await fetch(API + p, { ...opt, headers: { 'xi-api-key': KEY, ...(opt.headers || {}) } });
  if (!r.ok) { let t = await r.text(); try { const j = JSON.parse(t); t = (j.detail && (j.detail.message || j.detail.status)) || t; } catch (e) {} throw new Error(p.split('?')[0] + ' -> HTTP ' + r.status + ': ' + String(t).slice(0, 300)); }
  return r;
}
function wav(pcm) { // 16-bit mono PCM -> WAV file
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]);
}
async function models() { return (await api('/v1/models')).json(); }
const speaks = (m, code) => (m.languages || []).some(l => l.language_id === code);
async function pickModel() {
  if (process.env.ELEVEN_MODEL) return process.env.ELEVEN_MODEL;
  const ms = (await models()).filter(m => m.can_do_text_to_speech !== false && speaks(m, 'ckb'));
  if (!ms.length) throw new Error('No text-to-speech model in this account lists Sorani Kurdish (ckb). Nothing was recorded.');
  return (ms.find(m => m.model_id === 'eleven_v4') || ms[0]).model_id;
}
async function say(voice, model, lang, text, out) {
  const body = { text, model_id: model, language_code: lang, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true } };
  let r;
  try { r = await api('/v1/text-to-speech/' + voice + '?output_format=pcm_' + RATE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (e) { if (!/language_code|language code/i.test(e.message)) throw e; delete body.language_code; r = await api('/v1/text-to-speech/' + voice + '?output_format=pcm_' + RATE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  const pcm = Buffer.from(await r.arrayBuffer()); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, wav(pcm));
  return (pcm.length / 2 / RATE).toFixed(1) + 's';
}

(async () => {
  if (cmd === 'check') {
    try { const sub = await (await api('/v1/user/subscription')).json(); console.log('Key works. Plan: ' + sub.tier + ' · characters used ' + sub.character_count + ' of ' + sub.character_limit); } catch (e) { console.log('Plan and credits: not readable with this key (' + e.message.replace(/^.*HTTP /, 'HTTP ') + ')'); }
    const need = Object.values(LINES).reduce((n, l) => n + Object.values(l).join('').length, 0);
    console.log('All 63 lines are about ' + need + ' characters.');
    let ms = []; try { ms = await models(); } catch (e) { console.log('Models: not readable with this key (' + e.message.replace(/^.*HTTP /, 'HTTP ') + ')'); }
    console.log('\nModels that list Sorani Kurdish (ckb): ' + (ms.filter(m => speaks(m, 'ckb')).map(m => m.model_id).join(', ') || 'NONE'));
    console.log('Models that list Arabic (ar): ' + ms.filter(m => speaks(m, 'ar')).map(m => m.model_id).join(', '));
    let vs = []; try { vs = (await (await api('/v1/voices')).json()).voices || []; } catch (e) { console.log('Voices: not readable with this key (' + e.message.replace(/^.*HTTP /, 'HTTP ') + ')'); }
    console.log('\nFemale voices in the account (' + vs.filter(v => (v.labels || {}).gender === 'female').length + '):');
    for (const v of vs) { const L = v.labels || {}; if (L.gender === 'female') console.log('  ' + v.voice_id + '  ' + String(v.name).padEnd(34) + [L.age, L.accent, L.descriptive || L.description, L.use_case].filter(Boolean).join(' · ')); }
  } else if (cmd === 'test') {
    if (!a1) throw new Error('give one or more voice ids, separated by commas'); const model = await pickModel(); console.log('model: ' + model);
    for (const v of a1.split(',')) for (const lang of ['ckb', 'ar', 'en']) console.log(v + ' ' + lang + ' ' + await say(v, model, lang, LINES[lang].core_attack + ' ' + LINES[lang].victory, path.join(HERE, 'voice-test', v + '_' + lang + '.wav')));
  } else if (cmd === 'all') {
    if (!a1) throw new Error('give the voice id'); const model = await pickModel(); console.log('model: ' + model);
    for (const lang of (a2 || 'en,ar,ckb').split(',')) for (const k in LINES[lang]) if (!process.env.ELEVEN_KEYS || process.env.ELEVEN_KEYS.split(',').includes(k)) console.log(lang + ' ' + k.padEnd(14) + await say(a1, model, lang, LINES[lang][k], path.join(HERE, 'voice-out', lang, k + '.wav')));
  } else console.log('usage: node tools/elevenlabs-voice.js check | test <voiceId,...> | all <voiceId> [en,ar,ckb]');
})().catch(e => { console.error('error: ' + e.message); process.exitCode = 1; });

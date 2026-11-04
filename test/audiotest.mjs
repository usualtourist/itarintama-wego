import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const three = fs.readFileSync('vendor/three.module.min.js');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await page.route('**/three.module.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
await page.goto('file://' + process.cwd() + '/build/index.html#bobr');
await page.waitForTimeout(2500);
// Offline-renderöinti: näytteet eri etäisyyksiltä
const res = await page.evaluate(async () => {
  const g = window.__game;
  const A = g.audio.constructor;
  const sr = 44100, secs = 22;
  const ctx = new OfflineAudioContext(2, sr * secs, sr);
  const a = new A();
  a.init(ctx);
  a.setListener(0, 1.6, 0, 0);
  const ev = [];
  const put = (t, name, f) => { ev.push([t, name]); f(t); };
  put(0.5, 'Kar98k 20 m', (t) => a.gunshot('k98', 20, 1.5, 0, t));
  put(1.5, 'Kar98k 300 m', (t) => a.gunshot('k98', 300, 1.5, 0, t));
  put(3.0, 'MG 34 sarja 60 m', (t) => { for (let k = 0; k < 8; k++) a.gunshot('mg34', -60, 1, 0, t + k * 0.07); });
  put(4.5, 'MP 40 10 m', (t) => { for (let k = 0; k < 4; k++) a.gunshot('mp40', 10, 1, 5, t + k * 0.12); });
  put(6.0, 'ohilento + Mosin 250 m', (t) => { a.crack(2, 1.6, 3, t, false); a.gunshot('mosin', 0, 1.5, 250, t + 250 / 343 - 0.15); });
  put(8.0, 'käsikranaatti 30 m', (t) => a.explosion(30, 0, 10, 1, t));
  put(10.0, '5 cm KwK 80 m', (t) => a.gunshot('kwk38', 0, 2, -80, t));
  put(11.5, 'kalahdus panssariin', (t) => a.impact(3, 15, 1, 0, t));
  put(12.5, '10,5 cm vihellys + iskemä 120 m', (t) => { a.sfx(2, 80, 0, 90, t + 2.0); a.explosion(80, 0, 90, 3, t + 2.0 + 0.35); });
  put(16.0, 'heitin + kranaatti', (t) => { a.sfx(1, -40, 0, 0, t); a.sfx(3, 30, 0, 30, t + 2.5); a.explosion(30, 0, 30, 1.15, t + 2.5); });
  put(19.5, 'savukranaatti', (t) => a.sfx(4, 8, 0, 4, t));
  if (window.__ENG) a.engine(25, 1.5, 25, true, true);
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new Int16Array(L.length * 2);
  let peak = 0;
  for (let i = 0; i < L.length; i++) { out[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; out[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const stats = ev.map(([t, n], i) => {
    const t1 = i + 1 < ev.length ? ev[i + 1][0] : secs;
    let pk = 0, ss = 0, nn = 0, sumL = 0, sumR = 0;
    for (let k = Math.floor(t * sr); k < Math.floor(t1 * sr); k++) { const v = Math.max(Math.abs(L[k]), Math.abs(R[k])); pk = Math.max(pk, v); ss += L[k] * L[k]; nn++; sumL += L[k] * L[k]; sumR += R[k] * R[k]; }
    return { n, peak: +pk.toFixed(3), rms: +Math.sqrt(ss / nn).toFixed(4), LR: +(10 * Math.log10((sumL + 1e-12) / (sumR + 1e-12))).toFixed(1) };
  });
  // base64 WAV
  const bytes = new Uint8Array(out.buffer);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { pcm: btoa(bin), sr, peak, stats, voices: a.count };
});
const pcm = Buffer.from(res.pcm, 'base64');
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(res.sr, 24); hdr.writeUInt32LE(res.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
fs.writeFileSync('build/aanet.wav', Buffer.concat([hdr, pcm]));
console.log('huippu', res.peak.toFixed(3), 'ääniä', res.voices);
for (const s of res.stats) console.log(s.n.padEnd(34), 'huippu', String(s.peak).padEnd(6), 'rms', String(s.rms).padEnd(7), 'V/O dB', s.LR);
console.log(logs.join('\n'));
await browser.close();

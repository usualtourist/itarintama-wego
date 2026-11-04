import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const three = fs.readFileSync('vendor/three.module.min.js');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.route('**/three.module.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
await page.goto('file://' + process.cwd() + '/build/index.html#bobr');
await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const A = window.__game.audio.constructor, sr = 44100, secs = 8;
  const ctx = new OfflineAudioContext(1, sr * secs, sr);
  const a = new A(); a.init(ctx); a.setListener(0, 1.6, 0, 0);
  a.engine(30, 1.5, 30, true, false);          // vaunu tyhjäkäynnillä 40 m päässä
  for (let k = 0; k < 6; k++) a['bird'](0.5 + k * 1.2);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  // energia taajuuskaistoittain (yksinkertainen DFT-otanta 2048 näytteen ikkunoissa)
  const bands = [[20, 250], [250, 1000], [1000, 2500], [2500, 6000], [6000, 16000]], E = bands.map(() => 0);
  const N = 2048;
  for (let w = sr; w + N < d.length; w += sr / 2) {
    for (let k = 1; k < N / 2; k += 2) {
      const f = k * sr / N; let re = 0, im = 0;
      for (let n = 0; n < N; n += 2) { const x = d[w + n] * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / N)); re += x * Math.cos(2 * Math.PI * k * n / N); im -= x * Math.sin(2 * Math.PI * k * n / N); }
      const bi = bands.findIndex(([lo, hi]) => f >= lo && f < hi); if (bi >= 0) E[bi] += re * re + im * im;
    }
  }
  let rms = 0; for (let i = sr; i < d.length; i++) rms += d[i] * d[i];
  return { rms: Math.sqrt(rms / (d.length - sr)), E: E.map((e) => 10 * Math.log10(e + 1e-12)) };
});
console.log('RMS', r.rms.toFixed(4), '| kaistat dB: 20–250', r.E[0].toFixed(1), '| 250–1k', r.E[1].toFixed(1), '| 1–2,5k', r.E[2].toFixed(1), '| 2,5–6k', r.E[3].toFixed(1), '| 6–16k', r.E[4].toFixed(1));
await browser.close();

import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const three = fs.readFileSync('vendor/three.module.min.js');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.route('**/three.module.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
await page.goto('file://' + process.cwd() + '/build/index.html#bobr');
await page.waitForTimeout(2500);
await page.click('#btn-start');
await page.evaluate(() => { const g = window.__game; const S = g.sim.squads; g.sim.setOrders(S[4], [{ x: 250, z: 445, mode: 'move' }]); g.sim.setOrders(S[2], [{ x: 245, z: 450, mode: 'quick' }]); g.sim.setOrders(S[1], [{ x: 170, z: 440, mode: 'quick' }]); for (let t = 0; t < 2; t++) { g.sim.runTurn(); } });
const r = await page.evaluate(async () => {
  const g = window.__game, sim = g.sim, A = g.audio.constructor;
  const out = [];
  for (const [name, lx, lz] of [['kamera 2. ryhmän luona', 245, 450], ['kamera puolustajan kuopissa', 290, 290], ['kaukana', 245, 540]]) {
    for (const speed of [1, 4]) {
      const ctx = new OfflineAudioContext(2, 44100 * (62 / speed), 44100);
      const a = new A(); a.init(ctx); a.setListener(lx, sim.T.h(lx, lz) + 1.6, lz, 0);
      let worst = 0, tot = 0, prev = 0;
      const step = speed / 60;
      for (let t = step; t <= 60; t += step) {
        const p0 = performance.now();
        a.playback(sim.shots, sim.impacts, sim.explosions, sim.sfx, prev, t, speed);
        const dt = performance.now() - p0; worst = Math.max(worst, dt); tot += dt; prev = t;
        // OfflineAudioContextin kello ei etene, joten simuloidaan äänien loppuminen tyhjentämällä lista
        a['ends'] = a['ends'].filter((e) => e > t / speed - 0.0);
      }
      out.push({ name, speed, voices: a.count, avgMs: +(tot / (60 / step)).toFixed(3), worstMs: +worst.toFixed(2) });
    }
  }
  return { out, shots: sim.shots.length, imp: sim.impacts.length / 5, ex: sim.explosions.length / 5, sfx: sim.sfx.length / 5 };
});
console.log('vuoron tapahtumat: laukaukset', r.shots, 'iskemät', r.imp, 'räjähdykset', r.ex, 'muut', r.sfx);
for (const o of r.out) console.log(o.name.padEnd(30), o.speed + '×', 'ääniä', String(o.voices).padEnd(5), 'keskim.', o.avgMs, 'ms/ruutu, pahin', o.worstMs, 'ms');
console.log(logs.join('\n'));
await browser.close();

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
await page.click('#btn-start');
console.log('ääni', await page.evaluate(() => ({ state: window.__game.audio.ctx?.state, on: window.__game.audio.enabled, btn: document.getElementById('btn-sound').textContent })));
await page.evaluate(() => { const g = window.__game; const S = g.sim.squads; g.sim.setOrders(S[4], [{ x: 250, z: 445, mode: 'move' }]); g.sim.setOrders(S[2], [{ x: 245, z: 450, mode: 'quick' }]); g.sim.setOrders(S[1], [{ x: 170, z: 440, mode: 'quick' }]); });
for (let k = 0; k < 2; k++) {
  await page.evaluate(() => window.__game.mainAction());
  await page.waitForFunction(() => window.__game.phase === 'playback', null, { timeout: 120000 });
  if (k === 0) { await page.evaluate(() => { const g = window.__game; g.playT = 60; g.mainAction(); }); continue; }
}
// toistetaan vuoro 2 nopeudella 1×, kamera lähellä 2. ryhmää
const before = await page.evaluate(() => { const g = window.__game; g.speed = 1; g.playT = 0; g.audioT = 0; g.playing = true; g.select(2); g.focusSquad(2); g.R.cam.dist = 35; return { c: g.audio.count, shots: g.sim.shots.length, expl: g.sim.explosions.length / 5, sfx: g.sim.sfx.length / 5 }; });
const t0 = Date.now();
const fr0 = await page.evaluate(() => { window.__fr = 0; const f = () => { window.__fr++; requestAnimationFrame(f); }; requestAnimationFrame(f); return 0; });
await page.waitForTimeout(12000);
const after = await page.evaluate(() => ({ c: window.__game.audio.count, t: window.__game.playT, fr: window.__fr }));
console.log('vuoro 2:', before, '→ ääniä toistettu', after.c - before.c, 'toistoaika', after.t.toFixed(1), 's, fps', (after.fr / ((Date.now() - t0) / 1000)).toFixed(1));
// 4× nopeus
await page.evaluate(() => { const g = window.__game; g.speed = 4; g.playT = 0; g.audioT = 0; g.playing = true; window.__c4 = g.audio.count; });
await page.waitForTimeout(6000);
console.log('4×: ääniä', await page.evaluate(() => window.__game.audio.count - window.__c4));
// mykistys M
await page.keyboard.press('m');
console.log('M jälkeen', await page.evaluate(() => ({ on: window.__game.audio.enabled, btn: document.getElementById('btn-sound').textContent, stored: localStorage.getItem('bobr-sound') })));
console.log(logs.join('\n') || 'ei virheitä');
await browser.close();

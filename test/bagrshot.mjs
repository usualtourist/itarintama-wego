import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const three = fs.readFileSync('vendor/three.module.min.js');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await page.route('**/three.module.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
await page.goto('file://' + process.cwd() + '/build/index.html');
await page.waitForTimeout(800);
await page.screenshot({ path: 'build/b0.png', timeout: 180000 });
await page.click('#pick-bagr');
await page.waitForTimeout(3500);
await page.screenshot({ path: 'build/b1.png', timeout: 180000 });
console.log('hash', await page.evaluate(() => location.hash), 'otsikko', await page.evaluate(() => document.getElementById('scn-title').textContent));
await page.click('#btn-start');
await page.waitForTimeout(400);
// T-34 ja PaK lähikuvat (paljastetaan vihollinen kuvaa varten)
await page.evaluate(() => { const g = window.__game; const t = g.sim.soldiers.find(s => s.veh); g.select(4); g.R.cam.tx = t.x; g.R.cam.tz = t.z - 3; g.R.cam.dist = 20; g.R.cam.pitch = 0.32; g.R.cam.yaw = 0.8; });
await page.waitForTimeout(800);
await page.screenshot({ path: 'build/b2.png', timeout: 180000 });
await page.evaluate(() => { const g = window.__game; g.reveal = true; for (const q of g.sim.guns) q.gun.seen0 = true; g.sim.recordFrame(g.sim.frameCount - 1); const gq = g.sim.guns[0].gun; g.R.cam.tx = gq.x; g.R.cam.tz = gq.z; g.R.cam.dist = 18; g.R.cam.pitch = 0.35; g.R.cam.yaw = 2.6; });
await page.waitForTimeout(800);
await page.screenshot({ path: 'build/b3.png', timeout: 180000 });
await page.evaluate(() => { const g = window.__game; g.reveal = false; g.R.cam.tx = 220; g.R.cam.tz = 380; g.R.cam.dist = 230; g.R.cam.pitch = 0.45; g.R.cam.yaw = 0.15; });
await page.waitForTimeout(800);
await page.screenshot({ path: 'build/b4.png', timeout: 180000 });
// pelataan loppuun
for (let t = 0; t < 25; t++) {
  if (await page.evaluate(() => window.__game.phase) === 'end') break;
  await page.evaluate(() => window.__game.mainAction());
  await page.waitForFunction(() => window.__game.phase !== 'computing', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; if (g.phase === 'playback') { g.playT = 60; g.mainAction(); } });
}
console.log('loppu', await page.evaluate(() => ({ p: window.__game.phase, v: document.getElementById('end-verdict').textContent, setup: window.__game.sim.setupName, cas: window.__game.sim.casualties })));
await page.screenshot({ path: 'build/b5.png', timeout: 180000 });
console.log(logs.join('\n') || 'ei virheitä');
await browser.close();

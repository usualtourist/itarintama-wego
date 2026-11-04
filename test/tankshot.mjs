import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const three = fs.readFileSync('vendor/three.module.min.js');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.route('**/three.module.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
await page.goto('file://' + process.cwd() + '/build/index.html#bobr');
await page.waitForTimeout(3000);
await page.click('#btn-start');
await page.waitForTimeout(300);
// valitse vaunu klikkaamalla merkkiä
await page.evaluate(() => { const g = window.__game; const t = g.sim.soldiers.find(s => s.veh); g.R.cam.tx = t.x; g.R.cam.tz = t.z - 4; g.R.cam.dist = 22; g.R.cam.pitch = 0.32; g.R.cam.yaw = 0.7; });
await page.waitForTimeout(600);
const pos = await page.evaluate(() => { const g = window.__game; const r = g.canvas.getBoundingClientRect(); const t = g.sim.soldiers.find(s => s.veh); const mp = g.R.markerPos(t.id); const p = g.R.project(mp.x, mp.y, mp.z, r.width, r.height); return { x: p.x + r.left, y: p.y + r.top }; });
await page.mouse.click(pos.x, pos.y);
await page.waitForTimeout(500);
await page.screenshot({ path: 'build/t1.png', timeout: 180000 });
console.log('valittu', await page.evaluate(() => window.__game.sel));
// käsky: liiku tietä pitkin
await page.evaluate(() => { const g = window.__game; g.R.cam.tx = 250; g.R.cam.tz = 470; g.R.cam.dist = 160; g.R.cam.pitch = 0.6; g.R.cam.yaw = 0; });
await page.waitForTimeout(400);
await page.keyboard.press('1');
await page.mouse.click(560, 300);
await page.waitForTimeout(300);
console.log('käskyt', JSON.stringify(await page.evaluate(() => { const g = window.__game; return g.sim.squads[g.sel].orders; })));
await page.evaluate(() => window.__game.mainAction());
await page.waitForFunction(() => window.__game.phase === 'playback', null, { timeout: 120000 });
for (let k = 0; k < 2; k++) {
  await page.evaluate(() => { const g = window.__game; g.playT = 60; g.mainAction(); g.mainAction(); });
  await page.waitForFunction(() => window.__game.phase === 'playback', null, { timeout: 120000 });
}
const shot = await page.evaluate(() => { const g = window.__game; const t = g.sim.soldiers.find(s => s.veh); const sh = g.sim.shots.find(s => s.big); if (sh) g.playT = sh.t0 + 0.05; else g.playT = 30; g.playing = false; g.R.cam.tx = t.x; g.R.cam.tz = t.z; g.R.cam.dist = 30; g.R.cam.pitch = 0.25; g.R.cam.yaw = 2.6; return !!sh; });
await page.waitForTimeout(800);
await page.screenshot({ path: 'build/t2.png', timeout: 180000 });
console.log('laukaus löytyi', shot);
console.log(logs.filter(l => !l.includes('GPU stall')).slice(0, 10).join('\n'));
await browser.close();

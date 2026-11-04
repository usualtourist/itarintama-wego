import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const three = fs.readFileSync('vendor/three.module.min.js');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await page.route('**/three.module.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
await page.goto('file://' + process.cwd() + '/build/index.html#bobr');
await page.waitForTimeout(3000);
await page.click('#btn-start');
await page.evaluate(() => { const g = window.__game; g.select(2); g.focusSquad(2); g.R.cam.dist = 70; });
await page.keyboard.press('j');
await page.waitForTimeout(300);
console.log('toast', await page.evaluate(() => document.getElementById('toast').textContent), 'ryhmiä', await page.evaluate(() => window.__game.sim.squads.length));
// kivääritiimi eteenpäin, kk-tiimi tukee
await page.keyboard.press('2');
await page.mouse.click(560, 260);
await page.waitForTimeout(300);
await page.screenshot({ path: 'build/t1.png', timeout: 180000 });
await page.evaluate(() => window.__game.mainAction());
await page.waitForFunction(() => window.__game.phase === 'playback', null, { timeout: 120000 });
await page.evaluate(() => { const g = window.__game; g.playT = 60; g.mainAction(); });
const sel = await page.evaluate(() => { const g = window.__game; g.select(g.sim.squads.length - 1); return g.sim.squads[g.sel].short; });
await page.keyboard.press('j');
await page.waitForTimeout(300);
console.log('valittu', sel, 'yhdistys toast:', await page.evaluate(() => document.getElementById('toast').textContent));
// pelataan loppuun
for (let t = 0; t < 25; t++) {
  if (await page.evaluate(() => window.__game.phase) === 'end') break;
  await page.evaluate(() => window.__game.mainAction());
  await page.waitForFunction(() => window.__game.phase !== 'computing', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; if (g.phase === 'playback') { g.playT = 60; g.mainAction(); } });
}
await page.click('#btn-showmap');
await page.waitForTimeout(800);
await page.screenshot({ path: 'build/t2.png', timeout: 180000 });
console.log('loppu', await page.evaluate(() => ({ p: window.__game.phase, setup: window.__game.sim.setupName })), logs.join('\n'));
await browser.close();

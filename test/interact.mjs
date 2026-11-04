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
await page.waitForTimeout(500);
// valitse 3. ryhmä klikkaamalla sen merkkiä
const pos = await page.evaluate(() => { const g = window.__game; const r = g.canvas.getBoundingClientRect(); const id = g.sim.squads[3].leader; const mp = g.R.markerPos(id); const p = g.R.project(mp.x, mp.y, mp.z, r.width, r.height); return { x: p.x + r.left, y: p.y + r.top }; });
await page.mouse.click(pos.x, pos.y);
await page.waitForTimeout(400);
console.log('valittu', await page.evaluate(() => window.__game.sel));
await page.keyboard.press('4');
await page.mouse.click(700, 250);
await page.waitForTimeout(300);
console.log('käskyt', JSON.stringify(await page.evaluate(() => window.__game.sim.squads[3].orders)));
await page.keyboard.press('t');
await page.mouse.move(600, 140);
await page.waitForTimeout(600);
console.log('tip', await page.evaluate(() => document.getElementById('tip').innerText));
await page.screenshot({ path: 'build/i1.png', timeout: 180000 });
await page.keyboard.press('Escape');
// pelataan vuoroja nopeasti loppuun
for (let t = 0; t < 25; t++) {
  const ph = await page.evaluate(() => window.__game.phase);
  if (ph === 'end') break;
  await page.evaluate(() => window.__game.mainAction());
  await page.waitForFunction(() => window.__game.phase !== 'computing', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; if (g.phase === 'playback') { g.playT = 60; g.mainAction(); } });
}
console.log('lopussa', await page.evaluate(() => ({ phase: window.__game.phase, turn: window.__game.sim.turn, cas: window.__game.sim.casualties, verdict: document.getElementById('end-verdict').textContent })));
await page.screenshot({ path: 'build/i2.png', timeout: 180000 });
console.log(logs.filter(l => !l.includes('GPU stall')).slice(0, 20).join('\n'));
await browser.close();

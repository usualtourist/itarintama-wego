import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const three = fs.readFileSync('vendor/three.module.min.js');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await page.route('**/three.module.min.js', (r) => r.fulfill({ body: three, contentType: 'application/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
await page.goto('file://' + process.cwd() + '/build/index.html#bobr');
await page.waitForTimeout(3000);
await page.click('#btn-start');
// johto valittuna: tykistö UI:n kautta
await page.evaluate(() => { const g = window.__game; g.select(0); g.R.cam.tx = 250; g.R.cam.tz = 380; g.R.cam.dist = 230; g.R.cam.pitch = 0.75; g.R.cam.yaw = 0; });
await page.waitForTimeout(500);
await page.keyboard.press('b');
const tgt = await page.evaluate(() => { const g = window.__game; const r = g.canvas.getBoundingClientRect(); const p = g.R.project(290, g.sim.T.h(290, 282), 282, r.width, r.height); return { x: p.x + r.left, y: p.y + r.top }; });
await page.mouse.click(tgt.x, tgt.y);
await page.waitForTimeout(300);
console.log('toast:', await page.evaluate(() => document.getElementById('toast').textContent), 'arty', await page.evaluate(() => JSON.stringify(window.__game.sim.arty)));
// 1. ryhmä savua
await page.evaluate(() => { const g = window.__game; g.select(1); const c = g.sim.squadCenter(g.sim.squads[1]); g.sim.squads[1].smokeOrder = { x: c.x + 5, z: c.z - 25 }; g.refreshPaths(); });
await page.screenshot({ path: 'build/a0.png', timeout: 180000 });
for (let k = 0; k < 2; k++) {
  await page.evaluate(() => window.__game.mainAction());
  await page.waitForFunction(() => window.__game.phase === 'playback', null, { timeout: 120000 });
  if (k === 0) {
    await page.evaluate(() => { const g = window.__game; g.playT = 40; g.playing = false; const c = g.sim.squadCenter(g.sim.squads[1]); g.R.cam.tx = c.x; g.R.cam.tz = c.z - 30; g.R.cam.dist = 70; g.R.cam.pitch = 0.4; });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'build/a1.png', timeout: 180000 });
  }
  await page.evaluate(() => { const g = window.__game; g.playT = 60; g.mainAction(); });
}
await page.evaluate(() => window.__game.mainAction());
await page.waitForFunction(() => window.__game.phase === 'playback', null, { timeout: 120000 });
const ex = await page.evaluate(() => { const g = window.__game; const big = []; for (let i = 0; i < g.sim.explosions.length; i += 5) if (g.sim.explosions[i + 4] >= 3) big.push(g.sim.explosions[i]); return big; });
await page.evaluate((t) => { const g = window.__game; g.playT = t + 0.35; g.playing = false; g.R.cam.tx = 290; g.R.cam.tz = 300; g.R.cam.dist = 120; g.R.cam.pitch = 0.35; g.R.cam.yaw = 0.2; }, ex.length ? ex[Math.min(5, ex.length - 1)] : 30);
await page.waitForTimeout(800);
await page.screenshot({ path: 'build/a2.png', timeout: 180000 });
console.log('isoja räjähdyksiä vuorolla 3:', ex.length, logs.join('\n'));
await browser.close();

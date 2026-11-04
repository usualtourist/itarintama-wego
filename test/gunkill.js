const sim = new Sim(1941); sim.aiHook = sovietAI;
const S = sim.squads, tank = sim.soldiers.find(s => s.veh), gq = sim.guns[0], g = gq.gun;
// tykki on jo havaittu; vaunu tulittaa 160 m päästä, 1. ryhmä tukee
g.seen0 = true; for (const id of gq.members) { sim.sideSeen[0][id] = 0; sim.sideFirst[0][id] = -20; sim.lastPos[0][id * 2] = sim.soldiers[id].x; sim.lastPos[0][id * 2 + 1] = sim.soldiers[id].z; }
sim.setOrders(S[4], [{ x: 200, z: 500, mode: 'move' }]);
let tankShellsAtGun = 0; const oe = sim.explodeAt.bind(sim);
sim.explodeAt = (x, y, z, side, thr, n, bl, bu) => { if (side === 0 && Math.hypot(x - g.x, z - g.z) < 15) tankShellsAtGun++; oe(x, y, z, side, thr, n, bl, bu); };
for (let t = 1; t <= 4; t++) {
  sim.runTurn();
  const crew = gq.members.map(i => sim.soldiers[i]);
  console.log(`T${t} vaunu (${tank.x.toFixed(0)},${tank.z.toFixed(0)}) tgt ${tank.tgt} kranaatteja ${tank.ammo} lähellä tykkiä ${tankShellsAtGun} | miehistö ${crew.map(c => ['ok','w','X','D'][c.state] + (sim.inFox(c) ? 'f' : '') + c.posture).join(' ')} tykki ${g.dead ? 'tuhottu' : 'ehjä'} PS ${g.ap} | LOS vaunu->tykki ${sim.T.los(tank.x, sim.T.h(tank.x, tank.z) + 2.05, tank.z, g.x, sim.T.h(g.x, g.z) + 0.8, g.z).toFixed(2)} knows ${sim.squadKnows(S[4], gq.members[1])}`);
}
// mihin vaunun kranaatit osuivat?
const sim2 = new Sim(1941); sim2.aiHook = sovietAI;
const gq2 = sim2.guns[0], g2 = gq2.gun, tk2 = sim2.soldiers.find(s => s.veh);
for (const id of gq2.members) { sim2.sideSeen[0][id] = 0; sim2.sideFirst[0][id] = -20; }
g2.seen0 = true;
sim2.setOrders(sim2.squads[4], [{ x: 200, z: 500, mode: 'move' }]);
const tgts = {}; const oe2 = sim2.explodeAt.bind(sim2);
sim2.explodeAt = (x, y, z, side, thr, n, bl, bu) => { if (thr === tk2.id) { const k = Math.round(Math.hypot(x - g2.x, z - g2.z) / 10) * 10; tgts[k] = (tgts[k] || 0) + 1; } oe2(x, y, z, side, thr, n, bl, bu); };
const seenT = []; 
for (let i = 0; i < 1200 * 2; i++) { if (i % 1200 === 0) sim2.beginTurn(); sim2.tick(); if (i % 100 === 0) seenT.push(tk2.tgt + ':' + (tk2.tgt >= 0 ? sim2.soldiers[tk2.tgt].squad : '')); }
console.log('kranaattien etäisyys tykistä (m):', tgts);
console.log('vaunun maalit (id:ryhmä):', seenT.join(' '));

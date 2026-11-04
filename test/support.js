// Heitin, tykistö ja savu
const sim = new Sim(1941); sim.aiHook = sovietAI;
const mq = sim.squads.find(q => q.mortar); const tgt = sim.squads.find(q => q.ai === 'front' && q.side === 1);
const c = sim.squadCenter(tgt);
console.log('heitin', mq.short, 'etäisyys kohteeseen', Math.round(Math.hypot(c.x - sim.squadCenter(mq).x, c.z - sim.squadCenter(mq).z)), 'tähystys', sim.mortarSpotter(mq, c.x, c.z));
mq.target = { kind: 'area', x: c.x, z: c.z };
// tykistö kuoppariviä vastaan
console.log('tulipyyntö:', sim.requestArty('he', 290, 282) ?? 'ok', 'jäljellä', sim.artyLeft);
const before = sim.casualties[1];
const imp = [];
const oe = sim.explodeAt.bind(sim);
sim.explodeAt = (x, y, z, side, thr, n, bl, bu, size, sr) => { if (thr === mq.members[1]) imp.push(Math.round(Math.hypot(x - c.x, z - c.z))); oe(x, y, z, side, thr, n, bl, bu, size, sr); };
for (let t = 1; t <= 4; t++) { sim.runTurn(); console.log('T' + t, 'S tappiot', sim.casualties[1] - before, 'heitin ammuksia', sim.soldiers[mq.members[1]].ammo + sim.soldiers[mq.members[1]].mag, sim.msgs.filter(m => m.text.startsWith('Tyk')).map(m => m.t.toFixed(0) + 's ' + m.text).join(' | ')); }
console.log('heittimen iskemät kohteesta (m):', imp.join(' '));
// savu katkaisee näkölinjan
const sim2 = new Sim(1941);
const a = { x: 250, z: 450 }, b = { x: 250, z: 300 };
const los0 = sim2.T.los(a.x, sim2.T.h(a.x, a.z) + 1.6, a.z, b.x, sim2.T.h(b.x, b.z) + 1.6, b.z);
sim2.addSmoke(250, 375, 6, 70);
for (let i = 0; i < 200; i++) sim2.tick();
console.log('LOS ennen savua', los0.toFixed(2), '10 s savun jälkeen', sim2.T.los(a.x, sim2.T.h(a.x, a.z) + 1.6, a.z, b.x, sim2.T.h(b.x, b.z) + 1.6, b.z).toFixed(2), 'pilvi', JSON.stringify(sim2.T.smokes[0]));

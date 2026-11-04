const sim = new Sim(1941);
const g = sim.guns[0].gun;
console.log('tykki', g.x, g.z, 'kävelt.', sim.T.walkable(g.x, g.z), 'talo lähellä', sim.T.insideBuilding(g.x, g.z, 2), 'maasto', sim.T.groundAt(g.x, g.z));
for (const id of sim.guns[0].members) { const s = sim.soldiers[id]; console.log(s.role, s.x.toFixed(1), s.z.toFixed(1), 'kuoppa', s.foxhole, sim.inFox(s)); }
// näkyvyys tieltä ja pellolta
for (const [x, z] of [[246, 546], [250, 470], [250, 400], [180, 450], [320, 450]]) console.log('LOS ->', x, z, sim.T.los(g.x, sim.T.h(g.x, g.z) + 0.85, g.z, x, sim.T.h(x, z) + 1.4, z).toFixed(2));

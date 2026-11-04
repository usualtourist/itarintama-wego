const sim = new Sim(1941); sim.aiHook = sovietAI;
const res = sim.squads.find(q => q.ai === 'reserve');
const B = sim.T.buildings[sim.nearestBuilding(res.gx, res.gz, 5)];
console.log('talo', B.x0.toFixed(1), B.z0.toFixed(1), B.x1.toFixed(1), B.z1.toFixed(1), 'ikkunapaikkoja', B.spots.length);
for (const id of res.members) { const s = sim.soldiers[id]; console.log(' ', s.name, s.x.toFixed(1), s.z.toFixed(1), 'paikka', s.spot, 'sisällä', sim.T.insideBuilding(s.x, s.z)); }
// näkölinjat: talon eteläpuolelta 60 m päästä ikkunaan ja seinään
const sp = B.spots.find(p => p.dir === -Math.PI / 2);
const ox = B.x0 - 40, oz = sp.z, oy = sim.T.h(ox, oz) + 1.6;
console.log('LOS ikkunaan', sim.T.los(ox, oy, oz, sp.x, B.y0 + 1.4, sp.z).toFixed(2), 'seinään', sim.T.los(ox, oy, oz, sp.x, B.y0 + 0.5, sp.z + 0.0).toFixed(2), 'ikkunaan sisältä ulos', sim.T.los(sp.x, B.y0 + 1.05, sp.z, ox, oy, oz).toFixed(2), 'keskeltä taloa ulos', sim.T.los((B.x0+B.x1)/2+1, B.y0 + 1.05, (B.z0+B.z1)/2, ox, oy, oz).toFixed(2), 'katon yli', sim.T.los(ox, oy, oz, sp.x, B.y0 + 4.0, B.z0 - 10).toFixed(2));
// läpäisytilasto: ammutaan 400 kiväärinluotia seinään 100 m päästä
let through = 0; const T = sim.T; const out = { t: 2, kind: 0, idx: -1, bkind: -1 };
const KW = WEAPONS.k98;
// suoraviivainen tarkistus: osuuko seinään ja läpäiseekö
for (let i = 0; i < 400; i++) {
  const b = { vx: 0, vy: 0, vz: -KW.v0 * Math.exp(-KW.drag * 100), frag: false, ap: false };
  if (sim.penetrates(b, 2, 0, 0.5 * KW.mass * b.vz * b.vz)) through++;
}
console.log('kiväärinluoti 100 m: läpi hirsiseinästä', (through / 4).toFixed(0) + '%');
// taistelu: 2. ryhmä tulittaa taloa 120 m päästä
const g2 = sim.squads[2];
for (const id of g2.members) { const s = sim.soldiers[id]; s.x = B.x0 - 60; s.z = (B.z0 + B.z1) / 2 + (id % 10 - 5) * 3; s.tx = s.x; s.tz = s.z; }
g2.target = { kind: 'area', x: B.x0 + 1, z: (B.z0 + B.z1) / 2 }; g2.targetUntil = 1e9;
let hitsWall = 0, hitsIn = 0; const ow = sim.wound.bind(sim);
sim.wound = (s, p, E, by) => { if (s.squad === res.id) hitsIn++; ow(s, p, E, by); };
sim.runTurn(); sim.runTurn();
console.log('2 min aluetulta 60 m tieltä: osumia talossa oleviin', hitsIn, 'reservin tappiot', res.members.filter(i => sim.soldiers[i].state >= 2).length, '/', res.members.length, 'iskemät seiniin', sim.impacts.filter((v, i) => i % 5 === 4 && v === 1).length);

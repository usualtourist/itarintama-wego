// Vaunun ja tykin kaksintaistelu eri etäisyyksillä (ei jalkaväkeä liikkeellä).
const res = {};
for (const z of [470, 420, 370]) for (let sd = 1; sd <= 8; sd++) {
  const sim = new Sim(1940 + sd); sim.aiHook = sovietAI;
  const tank = sim.soldiers.find(s => s.veh); const tsq = sim.squads[tank.squad];
  sim.setOrders(tsq, [{ x: 250, z, mode: 'move' }]);
  for (let t = 0; t < 5; t++) sim.runTurn();
  const g = sim.guns[0].gun;
  const k = `z${z} (${Math.round(Math.hypot(250 - g.x, z - g.z))} m)`;
  res[k] = res[k] || { vaunuTuhottu: 0, vaunuVaurio: 0, tykkiTuhottu: 0, miehistöPoissa: 0, tykinLaukauksia: 0 };
  const r = res[k];
  if (tank.veh.ko) r.vaunuTuhottu++; else if (tank.veh.immob || tank.veh.gunDmg || tank.veh.crewHits) r.vaunuVaurio++;
  if (g.dead) r.tykkiTuhottu++;
  if (sim.gunner(sim.guns[0]) < 0) r.miehistöPoissa++;
  r.tykinLaukauksia += g.shots;
}
console.log(res);

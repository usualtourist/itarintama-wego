const sim = new Sim(1941); sim.aiHook = sovietAI;
const tank = sim.soldiers.find(s => s.veh); const tsq = sim.squads[tank.squad];
sim.setOrders(tsq, [{ x: 248, z: 292, mode: 'quick' }]);
const seen = new Map();
for (let i = 0; i < 1200 * 4; i++) {
  if (i % 1200 === 0) sim.beginTurn();
  sim.tick();
  for (const s of sim.soldiers) if (s.huntTank >= 0 && i % 40 === 0) {
    const d = Math.hypot(s.x - tank.x, s.z - tank.z);
    console.log((sim.time).toFixed(0), s.name, 'd', d.toFixed(1), 'supp', s.supp.toFixed(0), 'mv', s.moving, 'kr', s.grenades, 'knows', sim.squadKnows(sim.squads[s.squad], tank.id), 'st', s.state);
  }
}
console.log(sim.allMsgs.filter(m => m.side === 1).map(m => m.t.toFixed(0) + ' ' + m.text).join('\n'));

// Päätön simulaatiotesti: saksalaiset hyökkäävät skriptatuin käskyin.
const t0 = Date.now();
const sim = new Sim(1941);
sim.aiHook = sovietAI;
console.log('maasto', Date.now() - t0, 'ms; puita', sim.T.trees.length, 'taloja', sim.T.buildings.length, 'aitoja', sim.T.fences.length, 'sotilaita', sim.soldiers.length);
const ger = sim.squads.filter(s => s.side === 0);
const plan = {
  1: [[150, 430, 'quick'], [140, 360, 'hunt'], [170, 300, 'hunt']],
  2: [[245, 440, 'move'], [250, 365, 'hunt']],
  3: [[330, 440, 'quick'], [330, 370, 'hunt']],
};
for (let turn = 1; turn <= 12 && !sim.gameOver; turn++) {
  if (turn === 1) for (const id of [1, 2, 3]) sim.setOrders(sim.squads[id], plan[id].map(([x, z, mode]) => ({ x, z, mode })));
  if (turn === 6) for (const id of [1, 2, 3]) { const sq = sim.squads[id]; if (sq.mstate < 3) sim.setOrders(sq, [{ x: sim.objectives[0].x + (id - 2) * 25, z: 215, mode: 'quick' }]); }
  const a = Date.now();
  sim.runTurn();
  const ms = Date.now() - a;
  const shotsG = sim.shots.filter(s => s.side === 0).length, shotsS = sim.shots.filter(s => s.side === 1).length;
  const st = sim.squads.map(q => `${q.short}:${sim.squadAlive(q).length}/${q.members.length} ${['ok','sh','pin','BRK','RUN'][q.mstate]} m${q.morale.toFixed(0)}`).join(' | ');
  const avgS = (side) => (sim.soldiers.filter(s => s.side === side && sim.alive(s)).reduce((a, s) => a + s.supp, 0) / Math.max(1, sim.soldiers.filter(s => s.side === side && sim.alive(s)).length)).toFixed(0);
  const g2 = sim.squads[2]; const c = sim.squadCenter(g2);
  console.log(`T${turn} ${ms}ms laukauksia G${shotsG} S${shotsS} tapp G${sim.casualties[0]} S${sim.casualties[1]} supp G${avgS(0)} S${avgS(1)} 2.ryhmä@(${c.x.toFixed(0)},${c.z.toFixed(0)}) seen S:${sim.soldiers.filter(s=>s.side===1&&sim.sideSees(0,s.id)).length}`);
  console.log('   ', st);
  for (const m of sim.msgs.slice(0, 6)) console.log('     ', m.t.toFixed(1), m.text);
}
console.log('pisteet', sim.score(), 'kohteet', sim.objectives.map(o => o.name + ':' + o.owner).join(', '));

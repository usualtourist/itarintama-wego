// Jokainen ryhmitys: kelvolliset paikat ja naiivin hyökkäyksen tulos
const res = {};
for (let setup = 1; setup <= 16; setup++) {
  const sim = new Sim(1941, setup); sim.aiHook = sovietAI;
  const bad = sim.soldiers.filter(s => s.side === 1 && (sim.T.insideBuilding(s.x, s.z) >= 0 && s.foxhole >= 0)).length;
  const S = sim.squads; const order = (id, w) => { if (S[id].mstate < 3) sim.setOrders(S[id], w.map(([x, z, mode]) => ({ x, z, mode }))); };
  order(1, [[170, 455, 'quick'], [175, 372, 'hunt']]); order(3, [[320, 455, 'quick'], [320, 372, 'hunt']]); order(2, [[245, 470, 'move']]); order(4, [[250, 445, 'move']]);
  for (let t = 1; t <= 12 && !sim.gameOver; t++) {
    if (t === 6) { order(1, [[200, 300, 'hunt']]); order(2, [[250, 320, 'hunt']]); order(3, [[300, 300, 'hunt']]); }
    if (t === 9) { order(1, [[sim.objectives[0].x, 205, 'quick']]); order(2, [[sim.objectives[0].x + 10, 215, 'quick']]); order(3, [[330, 170, 'quick']]); }
    sim.runTurn();
  }
  sim.updateObjectives();
  const [g, s] = sim.score();
  const tank = sim.soldiers.find(x => x.veh);
  console.log(String(setup).padStart(2), sim.setupName.padEnd(36), 'kuopat taloissa', bad, '| pisteet', g, '-', s, 'G', sim.casualties[0], 'S', sim.casualties[1], tank.veh.ko ? 'vaunu tuhottu' : '');
}

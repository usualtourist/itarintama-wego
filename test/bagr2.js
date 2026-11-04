setScenario(1);
for (const setup of [1, 2, 3]) {
  const sim = new Sim(1941, setup); sim.aiHook = sovietAI;
  sim.runTurn(); const s1 = sim.soldiers.filter(s => s.side === 0 && sim.sideSeen[1][s.id] > -1e8).length; const c1 = [...sim.casualties];
  sim.runTurn(); const s2 = sim.soldiers.filter(s => s.side === 0 && sim.sideSeen[1][s.id] > -1e8).length;
  console.log('ryhmitys', setup, sim.setupName.padEnd(40), '| havaittuja hyökkääjiä 1 min', s1, '2 min', s2, '| tappiot 1 min', c1.join('/'), '2 min', sim.casualties.join('/'), '| keskitys osui:', sim.allMsgs.filter(m=>m.side===1).length);
}

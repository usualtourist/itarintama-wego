setScenario(1);
for (const setup of [3, 5]) {
  const sim = new Sim(1941, setup); sim.aiHook = sovietAI;
  const by = {}; const ow = sim.wound.bind(sim);
  sim.wound = (s, part, E, b) => { const pre = s.state; ow(s, part, E, b); if (s.side === 0 && pre < 2 && s.state >= 2) { const k = b ? (b.side === 0 ? 'OMA:' : '') + sim.squads[b.squad].short + ':' + b.w.id + (E < 400 ? '/sirp' : '') : '?'; by[k] = (by[k] || 0) + 1; } };
  const S = sim.squads; const order = (id, w) => { const q = S[id]; if (q.mstate < 3 && sim.squadAlive(q).length) sim.setOrders(q, w.map(([x, z, mode]) => ({ x, z, mode })), true); };
  order(1, [[150, 470, 'quick'], [150, 375, 'hunt']]); order(2, [[245, 480, 'quick'], [245, 400, 'hunt']]); order(3, [[400, 470, 'quick'], [415, 360, 'hunt']]); order(4, [[372, 520, 'move']]); order(0, [[270, 495, 'move']]);
  for (let t = 1; t <= 6; t++) { sim.runTurn(); console.log(' T' + t, sim.casualties.join('/'), S.filter(q => q.side === 0).map(q => q.short + ':' + sim.squadAlive(q).length + ['', 'sh', 'pin', 'BRK', 'RUN'][q.mstate] + ' m' + q.morale.toFixed(0)).join(' ')); }
  console.log('ryhm', setup, sim.setupName, by);
}

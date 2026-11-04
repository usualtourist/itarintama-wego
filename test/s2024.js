const sim = new Sim(2024); sim.aiHook = sovietAI;
const S = sim.squads; const order = (id, w) => sim.setOrders(S[id], w.map(([x, z, mode]) => ({ x, z, mode })));
order(4, [[262, 530, 'move']]); order(1, [[110, 470, 'quick'], [104, 420, 'hunt']]); order(2, [[230, 490, 'move']]); order(3, [[300, 490, 'move']]);
const by = {}; const ow = sim.wound.bind(sim);
sim.wound = (s, part, E, b) => { const pre = s.state; ow(s, part, E, b); if (s.side === 0 && pre < 2 && s.state >= 2) { const k = b ? sim.squads[b.squad].short + ':' + b.w.id + (E < 400 ? '/sirp' : '') : '?'; by[k] = (by[k] || 0) + 1; } };
for (let t = 1; t <= 4; t++) { sim.runTurn(); console.log('T' + t, sim.casualties, S.filter(q => q.side === 0).map(q => `${q.short}:${sim.squadAlive(q).length}${['', 'sh', 'pin', 'BRK', 'RUN'][q.mstate]} m${q.morale.toFixed(0)} out${q.members.filter(i => sim.soldiers[i].out).length}`).join(' | ')); }
console.log(by);

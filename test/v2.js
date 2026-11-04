const sim = new Sim(1941, 2); sim.aiHook = sovietAI;
const by = {}; const ow = sim.wound.bind(sim);
sim.wound = (s, part, E, b) => { const pre = s.state; ow(s, part, E, b); if (s.side === 0 && pre < 2 && s.state >= 2) { const k = b ? sim.squads[b.squad].short + ':' + b.w.id + (E < 400 ? '/sirp' : '') : '?'; by[k] = (by[k] || 0) + 1; } };
const S = sim.squads; const order = (id, w) => { if (S[id].mstate < 3) sim.setOrders(S[id], w.map(([x, z, mode]) => ({ x, z, mode }))); };
order(1, [[170, 455, 'quick'], [175, 372, 'hunt']]); order(3, [[320, 455, 'quick'], [320, 372, 'hunt']]); order(2, [[245, 470, 'move']]); order(4, [[250, 445, 'move']]);
for (let t = 1; t <= 6; t++) { sim.runTurn(); console.log('T' + t, sim.casualties, S.filter(q => q.side === 0).map(q => `${q.short}:${sim.squadAlive(q).length}${['', 'sh', 'pin', 'BRK', 'RUN'][q.mstate]} out${q.members.filter(i => sim.soldiers[i].out).length}`).join(' | ')); }
console.log(by);

const sim = new Sim(1941); sim.aiHook = sovietAI;
const by = {}; const ow = sim.wound.bind(sim);
sim.wound = (s, part, E, b) => { const pre = s.state; ow(s, part, E, b); if (s.side === 0 && pre < 2 && s.state >= 2) { const k = (b ? sim.squads[b.squad].short + ':' + b.w.id : '?') + (E < 400 ? ' sirpale' : ''); by[k] = (by[k] || 0) + 1; } };
const S = sim.squads; const order = (id, w) => sim.setOrders(S[id], w.map(([x, z, mode]) => ({ x, z, mode })));
order(4, [[250, 445, 'move']]); order(1, [[170, 455, 'quick'], [175, 372, 'hunt']]); order(3, [[320, 455, 'quick'], [320, 372, 'hunt']]); order(2, [[245, 470, 'move']]);
for (let t = 1; t <= 4; t++) { sim.runTurn(); console.log('T' + t, sim.casualties, sim.allMsgs.filter(m => m.t > sim.time - 60 && m.text.match(/Pz|tykki/)).map(m => m.text).slice(0, 6).join(' | ')); }
console.log(by);
console.log('tykki', JSON.stringify(sim.guns[0].gun));

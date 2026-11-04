const sim = new Sim(1941); sim.aiHook = sovietAI;
const origW = sim.wound.bind(sim); const log = {};
sim.wound = (s, part, E, by) => { if (s.side===1) { const k = `${sim.inFox(s)?'FOX':'open'} p${s.posture} ${part} mv${s.moving?1:0} sq${sim.squads[s.squad].mstate}`; log[k]=(log[k]||0)+1; } origW(s, part, E, by); };
for (const id of [1,2,3]) sim.setOrders(sim.squads[id], [{x:[0,150,245,330][id], z:440, mode:'quick'}]);
sim.runTurn();
console.log(log);
console.log('cas', sim.casualties, sim.squads.map(q=>q.short+':'+q.mstate+':'+q.morale.toFixed(0)).join(' '));
console.log(sim.allMsgs.filter(m=>m.side===1).slice(0,30).map(m=>m.t.toFixed(1)+' '+m.text).join('\n'));

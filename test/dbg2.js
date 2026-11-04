const sim = new Sim(1941); sim.aiHook = sovietAI;
const origW = sim.wound.bind(sim); const log = {};
sim.wound = (s, part, E, by) => { if (s.side===0 && by) { const d = Math.hypot(s.x-by.x,s.z-by.z); const k = `${by.w.id} ${Math.round(d/50)*50}m p${s.posture} mv${s.moving?1:0} ${part}`; log[k]=(log[k]||0)+1; } origW(s, part, E, by); };
const plan = { 1: [[150, 430, 'quick'], [140, 360, 'hunt']], 2: [[245, 440, 'move'], [250, 365, 'hunt']], 3: [[330, 440, 'quick'], [330, 370, 'hunt']] };
for (const id of [1,2,3]) sim.setOrders(sim.squads[id], plan[id].map(([x,z,mode])=>({x,z,mode})));
sim.runTurn(); sim.runTurn();
console.log(Object.entries(log).sort((a,b)=>b[1]-a[1]));
const sh = {}; for (const s of sim.soldiers) sh[s.w.id]=(sh[s.w.id]||0)+s.shots; console.log(sh);
console.log('G posture', sim.soldiers.filter(s=>s.side===0&&sim.alive(s)).map(s=>s.posture+(sim.T.groundAt(s.x,s.z)===1?'w':'')).join(' '));

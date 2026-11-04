setScenario(1);
const res = { ko: 0, immob: 0, ok: 0, shots: 0, msgs: {} };
for (let setup = 1; setup <= 6; setup++) {
  const sim = new Sim(1941, setup); sim.aiHook = sovietAI;
  const tank = sim.soldiers.find(s => s.veh); const tq = sim.squads[tank.squad];
  const res3 = sim.squads.find(q => q.ai === 'reserve'); const c = sim.squadCenter(res3);
  // vaunu ajaa yksin kylään reservin taloille
  tank.x = roadX2(260); tank.z = 260; tank.tx = tank.x; tank.tz = tank.z; tq.gx = tank.x; tq.gz = tank.z;
  for (const id of sim.guns[0].members) sim.soldiers[id].state = 3; // ilman PaKia
  sim.setOrders(tq, [{ x: roadX2(c.z + 15), z: c.z + 15, mode: 'move' }]);
  for (let t = 0; t < 4; t++) sim.runTurn();
  for (const m of sim.allMsgs) if (m.text.includes('T-34')) { const k = m.text.replace(/\(\d+ m\)|\(\d+ mm\)/, '').trim(); res.msgs[k] = (res.msgs[k] || 0) + 1; }
  res.shots += sim.allMsgs.filter(m => m.text.includes('Panzerfaust')).length;
  if (tank.veh.ko) res.ko++; else if (tank.veh.immob) res.immob++; else res.ok++;
  const hunters = sim.soldiers.filter(s => s.huntTank >= 0).length;
  console.log('ryhm', setup, 'vaunu', tank.veh.ko ? 'tuhottu' : tank.veh.immob ? 'liikuntakyvytön' : 'ehjä', '@', tank.x.toFixed(0), tank.z.toFixed(0), 'reservi @', c.x.toFixed(0), c.z.toFixed(0), 'PzF jäljellä', sim.soldiers.filter(s => s.side === 1).reduce((a, s) => a + s.pzf, 0), 'metsästäjiä', hunters);
}
console.log(res);

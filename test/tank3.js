// Vaunu ajaa yksin vihollisen kuoppien keskelle: lähitorjunnan pitäisi toimia.
let res = { ko: 0, immob: 0, ok: 0 };
for (let seed = 1; seed <= 6; seed++) {
  const sim = new Sim(1940 + seed); sim.aiHook = sovietAI;
  const tank = sim.soldiers.find(s => s.veh); const tsq = sim.squads[tank.squad];
  sim.setOrders(tsq, [{ x: 248, z: 292, mode: 'quick' }]);
  for (let turn = 1; turn <= 5; turn++) sim.runTurn();
  const msgs = sim.allMsgs.filter(m => m.text.includes('Pz')).map(m => m.text);
  console.log(seed, `@(${tank.x.toFixed(0)},${tank.z.toFixed(0)})`, tank.veh.ko ? 'TUHOTTU' : tank.veh.immob ? 'tela poikki' : 'kunnossa', 'heittoja', msgs.filter(t => t.includes('kasapanoksen')).length, 'tapot', tank.kills);
  if (tank.veh.ko) res.ko++; else if (tank.veh.immob) res.immob++; else res.ok++;
}
console.log(res);

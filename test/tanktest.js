// Vaunutesti: vaunu ajaa tietä pitkin kohti kylää ja tukee jalkaväkeä.
const sim = new Sim(1941); sim.aiHook = sovietAI;
const tank = sim.soldiers.find(s => s.veh); const tsq = sim.squads[tank.squad];
console.log('vaunu', tank.name, tank.x.toFixed(0), tank.z.toFixed(0), 'reitti?');
sim.setOrders(tsq, [{ x: 250, z: 470, mode: 'move' }]);
console.log('polku', tsq.path.map(p => p.x.toFixed(0) + ',' + p.z.toFixed(0)).join(' '));
for (const id of [1, 2, 3]) sim.setOrders(sim.squads[id], [{ x: [0, 180, 230, 300][id], z: 470, mode: 'move' }]);
for (let turn = 1; turn <= 10 && !sim.gameOver; turn++) {
  if (turn === 4) sim.setOrders(tsq, [{ x: 250, z: 330, mode: 'hunt' }]);
  if (turn === 7) sim.setOrders(tsq, [{ x: 245, z: 290, mode: 'move' }]);
  sim.runTurn();
  const v = tank.veh;
  const kills = tank.kills;
  console.log(`T${turn} vaunu @(${tank.x.toFixed(0)},${tank.z.toFixed(0)}) hd ${tank.heading.toFixed(2)} tur ${v.turret.toFixed(2)} kranaatteja ${tank.ammo} kk ${v.mgMag + v.mgAmmo} luukut ${v.buttoned ? 'kiinni' : 'auki'} immob ${v.immob} ko ${v.ko} cmd ${v.cmdHit} tapot ${kills} | tapp G${sim.casualties[0]} S${sim.casualties[1]}`);
  for (const m of sim.msgs.filter(m => m.text.includes('Pz'))) console.log('    ', m.t.toFixed(1), m.text);
}

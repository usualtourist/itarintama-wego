const sim = new Sim(1942); sim.aiHook = sovietAI;
const tank = sim.soldiers.find(s => s.veh); sim.setOrders(sim.squads[tank.squad], [{ x: 250, z: 420, mode: 'move' }]);
for (let t = 0; t < 5; t++) sim.runTurn();
const cnt = {}; for (const m of sim.allMsgs) if (m.text.startsWith('Pz') || m.text.includes('tykki')) cnt[m.text.replace(/\(\d+ mm\)/, '')] = (cnt[m.text.replace(/\(\d+ mm\)/, '')] || 0) + 1;
console.log(cnt, 'tykin laukaukset', sim.guns[0].gun.shots, 'AP', sim.guns[0].gun.ap, 'HE', sim.guns[0].gun.he);
const sh = sim.shots.length; void sh;

// Järkevä hyökkäys: vaunu ja kk:t tukevat, jalkaväki etenee notkon kautta, sitten kylään.
function play(seed, log) {
  const sim = new Sim(seed); sim.aiHook = sovietAI;
  const S = sim.squads, tank = sim.soldiers.find(s => s.veh);
  const ox = sim.objectives[0].x, oz = sim.objectives[0].z, bx = sim.objectives[1].x, bz = sim.objectives[1].z;
  const order = (id, wps) => { const q = S[id]; if (q.mstate < 3 && sim.squadAlive(q).length) sim.setOrders(q, wps.map(([x, z, mode]) => ({ x, z, mode }))); };
  for (let turn = 1; turn <= 20 && !sim.gameOver; turn++) {
    if (turn === 1) {
      order(4, [[250, 445, 'move']]);                 // vaunu harjanteelle tulitukeen
      order(1, [[170, 455, 'quick'], [175, 372, 'hunt']]); // notkoon länsipuolelle
      order(3, [[320, 455, 'quick'], [320, 372, 'hunt']]); // notkoon itäpuolelle
      order(2, [[245, 470, 'move']]);                  // tuliryhmä
    }
    if (turn === 6) { order(4, [[248, 360, 'move']]); order(2, [[250, 372, 'quick']]); }
    if (turn === 9) { order(1, [[200, 300, 'hunt']]); order(3, [[300, 300, 'hunt']]); order(2, [[250, 320, 'hunt']]); order(4, [[250, 320, 'move']]); }
    if (turn === 13) { order(1, [[ox - 10, oz + 10, 'quick']]); order(2, [[ox + 10, oz + 15, 'quick']]); order(3, [[bx, bz + 10, 'quick']]); order(4, [[roadX(240), 240, 'move']]); order(0, [[250, 300, 'move']]); }
    if (turn === 16) { order(1, [[ox, oz, 'hunt']]); order(2, [[ox + 5, oz - 5, 'hunt']]); order(3, [[bx, bz, 'hunt']]); }
    sim.runTurn();
    if (log) console.log(`T${turn} tapp G${sim.casualties[0]} S${sim.casualties[1]} kohteet ${sim.objectives.map(o => o.owner).join(',')} ` + S.map(q => q.short + ':' + sim.squadAlive(q).length + ['', 'sh', 'pin', 'BRK', 'RUN'][q.mstate]).join(' '));
  }
  sim.updateObjectives();
  const [g, s] = sim.score(); const diff = g - s;
  const verdict = diff > 300 ? 'Ratkaiseva voitto' : diff > 80 ? 'Taktinen voitto' : diff > -80 ? 'Ratkaisematon' : diff > -300 ? 'Taktinen tappio' : 'Ratkaiseva tappio';
  return `siemen ${seed}: vuoro ${sim.turn - 1}, pisteet ${g}-${s}, tappiot G${sim.casualties[0]} S${sim.casualties[1]}, kohteet ${sim.objectives.map(o => o.name + '=' + (o.owner === 0 ? 'G' : o.owner === 1 ? 'S' : '?')).join(' ')} → ${verdict}${tank.veh.ko ? ' (vaunu tuhottu)' : ''}`;
}
console.log(play(1941, true));
for (const sd of [7, 42, 1000, 2024]) console.log(play(sd, false));

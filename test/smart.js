const s0 = new Sim(1941); const g0 = s0.guns[0].gun; const tk0 = s0.soldiers.find(s => s.veh);
console.log('LOS tykki -> vaunun lähtö', s0.T.los(g0.x, s0.T.h(g0.x, g0.z) + 0.85, g0.z, tk0.x, s0.T.h(tk0.x, tk0.z) + 1.3, tk0.z).toFixed(2), Math.round(Math.hypot(g0.x - tk0.x, g0.z - tk0.z)), 'm');
// Fiksu suunnitelma: 1. ryhmä etsii tykin metsänreunasta, vaunu odottaa harjanteen takana, sitten tykki tuhotaan ja hyökätään.
function play(seed, log) {
  const sim = new Sim(seed); sim.aiHook = sovietAI;
  const S = sim.squads, tank = sim.soldiers.find(s => s.veh), g = sim.guns[0].gun;
  const ox = sim.objectives[0].x, oz = sim.objectives[0].z, bx = sim.objectives[1].x, bz = sim.objectives[1].z;
  const order = (id, w) => { const q = S[id]; if (q.mstate < 3 && sim.squadAlive(q).length && !(q.veh && !sim.alive(tank))) sim.setOrders(q, w.map(([x, z, mode]) => ({ x, z, mode }))); };
  let phase = 0;
  for (let turn = 1; turn <= 20 && !sim.gameOver; turn++) {
    if (turn === 1) {
      // vaunu odottaa harjanteen takana
      order(1, [[110, 470, 'quick'], [104, 420, 'hunt']]);        // metsänreunaa pohjoiseen
      order(2, [[230, 490, 'move']]); order(3, [[300, 490, 'move']]);
    }
    if (phase === 0 && g.seen0) {
      phase = 1;
      S[4].target = null; order(4, [[200, 500, 'move']]);         // vaunu tulitusasemaan tykkiä vastaan
      order(1, [[g.x + 18, g.z + 25, 'hunt']]);
    }
    if (phase === 1 && (g.dead || sim.gunner(sim.guns[0]) < 0)) {
      phase = 2;
      order(1, [[175, 372, 'hunt']]); order(2, [[245, 440, 'quick'], [250, 372, 'hunt']]); order(3, [[320, 455, 'quick'], [320, 372, 'hunt']]);
      order(4, [[250, 445, 'move']]);
      phase = 2; var p2 = turn;
    }
    if (phase === 2 && turn === p2 + 3) { order(1, [[200, 300, 'hunt']]); order(3, [[300, 300, 'hunt']]); order(2, [[250, 320, 'hunt']]); order(4, [[250, 330, 'move']]); }
    if (phase === 2 && turn === p2 + 6) { order(1, [[ox - 10, oz + 10, 'quick']]); order(2, [[ox + 10, oz + 15, 'quick']]); order(3, [[bx, bz + 10, 'quick']]); order(4, [[roadX(240), 240, 'move']]); }
    sim.runTurn();
    if (log) console.log(`T${turn} vaihe ${phase} tapp G${sim.casualties[0]} S${sim.casualties[1]} tykki ${g.dead ? 'tuhottu' : sim.gunner(sim.guns[0]) < 0 ? 'ei miehistöä' : g.seen0 ? 'havaittu' : 'piilossa'} vaunu ${tank.veh.ko ? 'KO' : 'ok'}`);
  }
  sim.updateObjectives();
  const [a, b] = sim.score(); const diff = a - b;
  const v = diff > 300 ? 'Ratkaiseva voitto' : diff > 80 ? 'Taktinen voitto' : diff > -80 ? 'Ratkaisematon' : diff > -300 ? 'Taktinen tappio' : 'Ratkaiseva tappio';
  return `siemen ${seed}: ${a}-${b} G${sim.casualties[0]} S${sim.casualties[1]} vaunu ${tank.veh.ko ? 'tuhottu' : 'ehjä'} → ${v}`;
}
console.log(play(1941, true)); for (const sd of [7, 42, 1000, 2024]) console.log(play(sd, false));


setScenario(1);
function play(setup, plan, log) {
  const sim = new Sim(1941, setup); sim.aiHook = sovietAI;
  const S = sim.squads, tank = sim.soldiers.find(s => s.veh), gq = sim.guns[0], g = gq.gun;
  const order = (id, w) => { const q = S[id]; if (q && !q.dissolved && q.mstate < 3 && sim.squadAlive(q).length && !(q.veh && !sim.alive(tank))) sim.setOrders(q, w.map(([x, z, mode]) => ({ x, z, mode })), true); };
  const V = sim.objectives[0], H = sim.objectives[1];
  let pzfShots = 0, pzfHits = 0;
  for (let turn = 1; turn <= 20 && !sim.gameOver; turn++) {
    if (plan === 'naive') {
      if (turn === 1) { order(4, [[362, 400, 'move']]); order(1, [[170, 470, 'quick'], [175, 330, 'hunt']]); order(2, [[250, 470, 'quick'], [255, 340, 'hunt']]); order(3, [[340, 470, 'quick'], [345, 350, 'hunt']]); }
      if (turn === 6) { order(1, [[H.x, H.z, 'quick']]); order(2, [[250, 280, 'quick']]); order(3, [[V.x - 10, V.z + 30, 'quick']]); order(4, [[345, 290, 'move']]); }
      if (turn === 10) { order(2, [[H.x + 20, H.z, 'quick']]); order(3, [[V.x, V.z, 'quick']]); order(4, [[V.x + 8, V.z + 20, 'move']]); order(0, [[260, 360, 'move']]); }
    } else {
      // valmisteleva keskitys, savu, heitin ja tykistö; jalkaväki suon ja koivikon kautta, vaunu odottaa kunnes PaK on löydetty
      if (turn === 1) {
        order(1, [[150, 470, 'quick'], [150, 375, 'hunt']]);     // suon kautta
        order(2, [[245, 480, 'quick'], [245, 400, 'hunt']]);
        order(3, [[400, 470, 'quick'], [415, 360, 'hunt']]);     // koivikon kautta
        order(4, [[372, 520, 'move']]); order(0, [[270, 495, 'move']]);
        S[5].target = { kind: 'area', x: 250, z: 300 };
      }
      if (turn === 3) { sim.requestArty('he', 250, 290); }
      if (turn === 4) { order(0, [[250, 440, 'move']]); }
      if (turn === 7) { order(1, [[160, 320, 'hunt']]); order(3, [[410, 290, 'hunt']]); order(2, [[245, 345, 'hunt']]); sim.requestArty('he', 175, 255); }
      if (g.seen0 || g.dead || turn >= 9) { if (!S[4]._go) { S[4]._go = 1; order(4, [[365, 430, 'move']]); } }
      if (turn === 11) { order(1, [[H.x, H.z, 'quick']]); order(2, [[230, 285, 'quick']]); order(3, [[V.x + 20, V.z + 25, 'quick']]); sim.requestArty('he', V.x, V.z - 20); }
      if (turn === 14) { order(2, [[H.x + 15, H.z + 5, 'quick']]); order(3, [[V.x, V.z, 'quick']]); order(4, [[350, 290, 'move']]); order(0, [[240, 330, 'move']]); }
      if (turn === 17) { order(2, [[V.x - 15, V.z, 'quick']]); }
    }
    sim.runTurn();
    for (const m of sim.msgs) if (m.text.includes('Panzerfaust')) pzfShots++;
    if (log) console.log(`  T${turn} tapp ${sim.casualties.join('/')} kohteet ${sim.objectives.map(o => o.owner).join(',')} PaK ${g.dead ? 'X' : g.seen0 ? 'havaittu' : '?'} T-34 ${tank.veh.ko ? 'KO' : tank.veh.immob ? 'immob' : 'ok'} ` + S.filter(q => !q.dissolved).map(q => q.short + ':' + sim.squadAlive(q).length + ['', 'sh', 'pin', 'BRK', 'RUN'][q.mstate]).join(' '));
  }
  sim.updateObjectives();
  const [a, b] = sim.score(); const diff = a - b;
  const v = diff > 300 ? 'Ratkaiseva voitto' : diff > 80 ? 'Taktinen voitto' : diff > -80 ? 'Ratkaisematon' : diff > -300 ? 'Taktinen tappio' : 'Ratkaiseva tappio';
  return `${plan.padEnd(6)} ryhm ${setup} ${sim.setupName.padEnd(38)} ${a}-${b} tapp ${sim.casualties.join('/')} T-34 ${tank.veh.ko ? 'tuhottu' : 'ehjä'} PzF ${pzfShots} → ${v}`;
}
console.log(play(1, 'smart', false));
for (let st = 2; st <= 6; st++) console.log(play(st, 'smart', false));
for (let st = 1; st <= 6; st++) console.log(play(st, 'naive', false));

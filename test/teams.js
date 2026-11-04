const sim = new Sim(1941, 8); sim.aiHook = sovietAI;
const q = sim.squads[2];
console.log('voiko jakaa', sim.canSplit(q));
const t = sim.splitSquad(q);
console.log('emo', q.short, q.members.map(i => sim.soldiers[i].role).join(','), '| tiimi', t.short, t.members.map(i => sim.soldiers[i].role).join(','), 'johtaja', sim.soldiers[t.leader].role);
console.log('yhteys', q.c2, t.c2, 'savut', q.smokeLeft, t.smokeLeft);
// kk-tiimi tulitukeen, kivääritiimi etenee
t.target = { kind: 'area', x: 290, z: 282 };
sim.setOrders(q, [{ x: 250, z: 440, mode: 'quick' }], true);
sim.runTurn();
const cq = sim.squadCenter(q), ct = sim.squadCenter(t);
console.log('vuoron jälkeen: kiv @', cq.x.toFixed(0), cq.z.toFixed(0), 'kk @', ct.x.toFixed(0), ct.z.toFixed(0), 'kk laukauksia', sim.soldiers[t.members.find(i => sim.soldiers[i].w.kind === 'lmg')].shots, 'yhteys', q.c2, t.c2);
console.log('yhdistys kaukaa onnistuu?', sim.canMerge(q));
sim.setOrders(t, [{ x: cq.x + 5, z: cq.z + 5, mode: 'quick' }], true);
sim.runTurn();
console.log('lähekkäin, yhdistys?', sim.canMerge(t), sim.mergeTeams(t), '→', q.short, q.members.length, 'jäsentä, tiimi purettu', t.dissolved, 'sotilaiden ryhmä', [...new Set(q.members.map(i => sim.soldiers[i].squad))]);
sim.runTurn();
console.log('jatkuu ilman virheitä, tappiot', sim.casualties);

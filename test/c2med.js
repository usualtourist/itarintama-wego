const sim = new Sim(1941); sim.aiHook = sovietAI;
sim.updateC2();
console.log('yhteys alussa:', sim.squads.map(q => q.short + (q.c2 ? '✓' : '✗')).join(' '));
// 1. ryhmä kauas johdosta → ei yhteyttä, käsky viivästyy
const q1 = sim.squads[1];
for (const id of q1.members) { sim.soldiers[id].x -= 90; sim.soldiers[id].tx -= 90; }
sim.updateC2();
console.log('1. ryhmä siirretty 90 m länteen: yhteys', q1.c2);
sim.setOrders(q1, [{ x: 100, z: 480, mode: 'move' }], true);
sim.setOrders(sim.squads[2], [{ x: 245, z: 480, mode: 'move' }], true);
sim.beginTurn();
console.log('käskyviive 1. ryhmä', (q1.holdUntil - sim.time).toFixed(1), 's, 2. ryhmä', (sim.squads[2].holdUntil - sim.time).toFixed(1), 's');
for (let i = 0; i < 1200; i++) sim.tick(); sim.endTurn();
// ensiapu: haavoitetaan kaksi 3. ryhmän miestä levossa
const q3 = sim.squads[3];
const v1 = sim.soldiers[q3.members[5]], v2 = sim.soldiers[q3.members[6]];
v1.state = 2; v2.state = 2;
for (let t = 0; t < 3; t++) sim.runTurn();
console.log('hoidettu:', v1.treated, v2.treated, 'tila', v1.state, v2.state, sim.allMsgs.filter(m => m.text.includes('sitoi')).map(m => m.text).join(' | '));
// verenvuoto: 30 hoitamatonta, 20 min
let dead = 0;
for (let k = 0; k < 30; k++) { let alive = true; for (let s = 0; s < 1200; s++) if (sim.rng.chance(0.0011)) { alive = false; break; } if (!alive) dead++; }
console.log('hoitamattomista kuolee 20 minuutissa noin', Math.round(dead / 30 * 100) + '%');
console.log('pisteet', sim.score());

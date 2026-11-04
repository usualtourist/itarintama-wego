setScenario(1);
const sim = new Sim(1941, 3); const T = sim.T;
const cnt = {}; for (let i = 0; i < T.ground.length; i++) cnt[T.ground[i]] = (cnt[T.ground[i]] || 0) + 1;
console.log('maasto %:', Object.entries(cnt).map(([k, v]) => GROUND_NAMES[k] + ' ' + (100 * v / T.ground.length).toFixed(0)).join(', '), '| taloja', T.buildings.length, 'puita', T.trees.length, 'aitoja', T.fences.length);
console.log('ryhmitys', sim.setupName);
for (const q of sim.squads) { const c = sim.squadCenter(q); const inB = q.members.filter(i => T.insideBuilding(sim.soldiers[i].x, sim.soldiers[i].z) >= 0).length; console.log(' ', q.side, q.short.padEnd(8), 'n', q.members.length, '@', c.x.toFixed(0), c.z.toFixed(0), 'maasto', GROUND_NAMES[T.groundAt(c.x, c.z)], 'taloissa', inB); }
const tk = sim.soldiers.find(s => s.veh);
const path = findPath(T, tk.x, tk.z, 336, 200, true);
console.log('vaunun reitti kylään:', path.length, 'pistettä', path.length ? path.map(p => p.x.toFixed(0) + ',' + p.z.toFixed(0)).join(' ') : 'EI REITTIÄ');
const path2 = findPath(T, tk.x, tk.z, 172, 250, true);
console.log('vaunun reitti kukkulalle:', path2.length ? path2.slice(-3).map(p => p.x.toFixed(0) + ',' + p.z.toFixed(0)).join(' ') : 'EI REITTIÄ');
const road = []; for (let z = 360; z <= 540; z += 15) road.push([roadX2(z), z]);
const vis = (x, z, eye, pts, th) => pts.filter(([px, pz]) => T.los(x, T.h(x, z) + eye, z, px, T.h(px, pz) + th, pz) >= 0).length;
console.log('PaK-vaihtoehdot, näkyvyys tielle (' + road.length + ' pistettä z 360–540):');
for (const [x, z] of SCENARIO.defense.gun) console.log('  ', x, z, GROUND_NAMES[T.groundAt(x, z)], 'tie', vis(x, z, 0.9, road, 1.4), 'etäisyys tielle', Math.round(Math.abs(x - roadX2(z))));
const field = []; for (let z = 330; z <= 500; z += 20) for (let x = 60; x <= 420; x += 30) if (T.groundAt(x, z) !== 2) field.push([x, z]);
console.log('MG-vaihtoehdot, näkyvyys etumaastoon (' + field.length + '):'); for (const [x, z] of SCENARIO.defense.mg) console.log('  ', x, z, vis(x, z, 0.5, field, 1.0));
console.log('Etulinjat:'); for (const f of SCENARIO.defense.front) console.log('  ', f.name, f.pos.map(([x, z]) => `${x},${z} ${GROUND_NAMES[T.groundAt(x, z)]} näk ${vis(x, z, 0.3, field, 1.0)}`).join(' | '));
// alkupisteet: näkyykö puolustajille?
const att = sim.soldiers.filter(s => s.side === 0); const defs = sim.soldiers.filter(s => s.side === 1);
let seen = 0; for (const a of att) if (defs.some(d => T.los(d.x, T.h(d.x, d.z) + 1, d.z, a.x, T.h(a.x, a.z) + 1.4, a.z) >= 0)) seen++;
console.log('hyökkääjiä näkyvissä alussa', seen, '/', att.length);

const sim = new Sim(1941); const T = sim.T; const tk = sim.soldiers.find(s => s.veh);
const D = SCENARIO.defense;
for (const [x, z] of [...D.gun, [100, 410, 0], [96, 425, 0], [108, 405, 0], [380, 410, 0], [355, 395, 0]]) {
  const l = T.los(x, T.h(x, z) + 0.85, z, tk.x, T.h(tk.x, tk.z) + 1.4, tk.z);
  const ger = sim.soldiers.filter(s => s.side === 0 && !s.veh && T.los(x, T.h(x, z) + 0.85, z, s.x, T.h(s.x, s.z) + 1.0, s.z) >= 0).length;
  const road = []; for (let rz = 380; rz <= 500; rz += 10) road.push(T.los(x, T.h(x, z) + 0.85, z, roadX(rz), T.h(roadX(rz), rz) + 1.4, rz) >= 0 ? 1 : 0);
  console.log(x, z, 'näkee vaunun lähtöpaikan', l >= 0, Math.round(Math.hypot(x - tk.x, z - tk.z)) + ' m', '| saksalaisia näkyvissä', ger, '| tie', road.join(''));
}

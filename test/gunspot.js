const sim = new Sim(1941); const T = sim.T;
const out = [];
for (let z = 360; z <= 440; z += 4) for (let x = 90; x <= 135; x += 2) {
  if (!T.walkable(x, z)) continue;
  const g = T.groundAt(x, z); if (g === 2) continue; // ei metsän sisällä
  // metsää takana (lännessä) 6 m sisällä?
  if (T.groundAt(x - 6, z) !== 2) continue;
  let ok = 0;
  for (let rz = 380; rz <= 480; rz += 10) { const rx = roadX(rz); if (T.los(x, T.h(x, z) + 0.85, z, rx, T.h(rx, rz) + 1.4, rz) >= 0) ok++; }
  out.push({ x, z, ok, g });
}
out.sort((a, b) => b.ok - a.ok); console.log(out.slice(0, 8));

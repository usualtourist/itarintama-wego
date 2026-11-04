// Mitataan ehdokaspaikkojen näkyvyys hyökkäysreiteille.
const sim = new Sim(1941); const T = sim.T;
const road = []; for (let z = 380; z <= 500; z += 10) road.push([roadX(z), z]);
const field = []; for (let z = 320; z <= 480; z += 20) for (let x = 140; x <= 380; x += 30) field.push([x, z]);
const vis = (x, z, eye, pts, th) => pts.filter(([px, pz]) => T.los(x, T.h(x, z) + eye, z, px, T.h(px, pz) + th, pz) >= 0).length;
const ok = (x, z) => T.insideBuilding(x, z, 1.5) < 0 && T.groundAt(x, z) !== 3;
const gunC = { G_west: [100, 378], G_eastgrove: [362, 372], G_eastgrove2: [372, 395], G_villageW: [208, 262], G_orchard: [300, 252], G_gullyE: [345, 352], G_westforest2: [104, 440], G_barnS: [330, 180] };
console.log('TYKKI (tie z380-500, ' + road.length + ' pistettä):');
for (const [k, [x, z]] of Object.entries(gunC)) console.log(' ', k, x, z, 'ok', ok(x, z), 'maasto', T.groundAt(x, z), 'tie näkyy', vis(x, z, 0.85, road, 1.4), 'pelto', vis(x, z, 0.85, field, 1.4));
const mgC = { M_cur: [312, 262], M_westrise: [215, 255], M_gully: [240, 360], M_barn: [318, 178], M_village: [262, 230], M_eastedge: [350, 290], M_west: [150, 290], M_orchardS: [325, 255] };
console.log('MAXIM (pelto ' + field.length + ' pistettä, kohde kyykyssä):');
for (const [k, [x, z]] of Object.entries(mgC)) console.log(' ', k, x, z, 'ok', ok(x, z), 'pelto', vis(x, z, 0.5, field, 1.0));
const frC = { F_W: [200, 282], F_E: [290, 282], F_gullyW: [185, gullyZ(185) - 4], F_gullyE: [300, gullyZ(300) - 4], F_grove: [372, 352], F_westedge: [125, 300], F_center: [245, 285] };
console.log('ETULINJA (pelto, kuoppa):');
for (const [k, [x, z]] of Object.entries(frC)) console.log(' ', k, x.toFixed(0), z.toFixed(0), 'ok', ok(x, z), 'maasto', T.groundAt(x, z), 'pelto', vis(x, z, 0.3, field, 1.0));

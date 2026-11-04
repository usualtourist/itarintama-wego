// A*-polunhaku 4 m ruudukossa ja polun suoristus.
import { Terrain, MAP_W, MAP_D } from './terrain';

const PNX = MAP_W / 4, PNZ = MAP_D / 4;

class Heap {
  ids: number[] = []; keys: number[] = [];
  push(id: number, k: number) {
    const a = this.ids, b = this.keys;
    a.push(id); b.push(k);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (b[p] <= b[i]) break;
      [a[p], a[i]] = [a[i], a[p]]; [b[p], b[i]] = [b[i], b[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.ids, b = this.keys;
    const top = a[0];
    const lid = a.pop()!, lk = b.pop()!;
    if (a.length) {
      a[0] = lid; b[0] = lk;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [b[m], b[i]] = [b[i], b[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.ids.length; }
}

const gScore = new Float32Array(PNX * PNZ);
const came = new Int32Array(PNX * PNZ);
const closed = new Uint8Array(PNX * PNZ);

function nearestFree(T: Terrain, ix: number, iz: number, veh = false): number {
  const blk = veh ? T.blockedVeh : T.blockedNav;
  for (let r = 0; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = ix + dx, z = iz + dz;
    if (x < 0 || z < 0 || x >= PNX || z >= PNZ) continue;
    if (!blk[z * PNX + x]) return z * PNX + x;
  }
  return iz * PNX + ix;
}

export function findPath(T: Terrain, sx: number, sz: number, gx: number, gz: number, veh = false): { x: number; z: number }[] {
  const blk = veh ? T.blockedVeh : T.blockedNav;
  const s = nearestFree(T, Math.min(PNX - 1, Math.max(0, Math.floor(sx / 4))), Math.min(PNZ - 1, Math.max(0, Math.floor(sz / 4))), veh);
  const g = nearestFree(T, Math.min(PNX - 1, Math.max(0, Math.floor(gx / 4))), Math.min(PNZ - 1, Math.max(0, Math.floor(gz / 4))), veh);
  if (lineWalkable(T, sx, sz, gx, gz, veh)) return [{ x: gx, z: gz }];
  gScore.fill(1e9); came.fill(-1); closed.fill(0);
  const open = new Heap();
  gScore[s] = 0;
  const gxI = g % PNX, gzI = (g / PNX) | 0;
  const hfn = (i: number) => Math.hypot((i % PNX) - gxI, ((i / PNX) | 0) - gzI) * 0.85;
  open.push(s, hfn(s));
  let found = false, iter = 0;
  while (open.size && iter++ < 60000) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === g) { found = true; break; }
    const cx = cur % PNX, cz = (cur / PNX) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= PNX || nz >= PNZ) continue;
      const ni = nz * PNX + nx;
      if (blk[ni] || closed[ni]) continue;
      if (dx && dz && (blk[cz * PNX + nx] || blk[nz * PNX + cx])) continue;
      const step = (dx && dz ? 1.414 : 1) * (veh ? T.navCostVeh(nx, nz) : T.navCost(nx, nz));
      const ng = gScore[cur] + step;
      if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; open.push(ni, ng + hfn(ni)); }
    }
  }
  if (!found) return veh ? [] : [{ x: gx, z: gz }];
  const cells: { x: number; z: number }[] = [];
  for (let c = g; c !== -1 && c !== s; c = came[c]) cells.push({ x: (c % PNX) * 4 + 2, z: ((c / PNX) | 0) * 4 + 2 });
  cells.reverse();
  if (cells.length) cells[cells.length - 1] = { x: gx, z: gz };
  // suoristus: hypätään suoraan niin pitkälle kuin pääsee
  const out: { x: number; z: number }[] = [];
  let ax = sx, az = sz, i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !lineWalkable(T, ax, az, cells[j].x, cells[j].z, veh)) j--;
    out.push(cells[j]);
    ax = cells[j].x; az = cells[j].z;
    i = j + 1;
  }
  return out;
}

export function lineWalkable(T: Terrain, ax: number, az: number, bx: number, bz: number, veh = false): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / 1.5);
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
    if (veh ? !T.walkableVeh(x, z) : !T.walkable(x, z)) return false;
  }
  return true;
}

// Maasto: korkeuskartta, maastotyypit, esteet (talot, puut, aidat, heinäsuovat),
// näkölinjat ja luotien osumatestit.
import { Rng, fbm, clamp } from './rng';

export const MAP_W = 480;
export const MAP_D = 560;
export const CELL = 2;
export const NX = MAP_W / CELL + 1;
export const NZ = MAP_D / CELL + 1;
const BUCKET = 8;
const BX = Math.ceil(MAP_W / BUCKET);
const BZ = Math.ceil(MAP_D / BUCKET);

export const Gr = { Grass: 0, Wheat: 1, Forest: 2, Road: 3, Plowed: 4, Orchard: 5, Yard: 6, Meadow: 7, Marsh: 8 };
export const GROUND_NAMES = ['Nurmi', 'Viljapelto', 'Metsä', 'Tie', 'Kynnös', 'Hedelmätarha', 'Kasvimaa', 'Niitty', 'Suo'];
// liikkumisen nopeuskerroin maastotyypeittäin
export const GROUND_SPEED = [1, 0.8, 0.72, 1.05, 0.8, 0.95, 0.85, 0.95, 0.5];
// polunhaun hinta
const GROUND_COST = [1, 1.15, 1.35, 0.85, 1.2, 1.05, 1.1, 1.0, 2.0];

export interface Opening { u0: number; u1: number; y0: number; y1: number; }
export interface Spot { x: number; z: number; dir: number; }
export interface Building {
  x0: number; x1: number; z0: number; z1: number; y0: number; wallH: number; roofH: number; alongX: boolean; kind: number;
  openings: Opening[];  // aukot suhteellisina (u 0..1 seinän pituudesta, y metreinä lattiasta), samat kaikilla seinillä
  spots: Spot[];        // ampumapaikat ikkunoiden ja ovien sisäpuolella
}
export const WALL_T = 0.22;
// Seinä i: 0 = z0-puoli, 1 = z1-puoli, 2 = x0-puoli, 3 = x1-puoli
export function wallBox(B: Building, i: number): number[] {
  const yl = B.y0 - 1, yh = B.y0 + B.wallH;
  if (i === 0) return [B.x0, yl, B.z0, B.x1, yh, B.z0 + WALL_T];
  if (i === 1) return [B.x0, yl, B.z1 - WALL_T, B.x1, yh, B.z1];
  if (i === 2) return [B.x0, yl, B.z0, B.x0 + WALL_T, yh, B.z1];
  return [B.x1 - WALL_T, yl, B.z0, B.x1, yh, B.z1];
}
export interface Tree { x: number; z: number; y0: number; r: number; trunkH: number; crownY: number; crownR: number; kind: number; }
export interface Hay { x: number; z: number; y0: number; r: number; h: number; }
export interface Fence { x1: number; z1: number; x2: number; z2: number; y0: number; h: number; }
export interface Foxhole { x: number; z: number; y0: number; }

export const OB_BUILD = 0, OB_TREE = 1, OB_HAY = 2, OB_FENCE = 3;
export const HIT_NONE = 0, HIT_TERRAIN = 1, HIT_BUILD = 2, HIT_TRUNK = 3, HIT_HAY = 4, HIT_FENCE = 5, HIT_ROOF = 6;

export interface HitOut { t: number; kind: number; idx: number; bkind: number; }

export class Terrain {
  heights = new Float32Array(NX * NZ);
  ground = new Uint8Array((NX - 1) * (NZ - 1));
  buildings: Building[] = [];
  trees: Tree[] = [];
  hays: Hay[] = [];
  fences: Fence[] = [];
  foxholes: Foxhole[] = [];
  obsType: number[] = [];
  obsIdx: number[] = [];
  stamp: Uint32Array = new Uint32Array(1);
  stampN = 1;
  buckets: number[][] = [];
  blockedNav: Uint8Array = new Uint8Array(0);
  blockedVeh: Uint8Array = new Uint8Array(0);
  // savupilvet (simulaatio päivittää): keskipiste, säde, korkeus, tiheys 0..1
  smokes: { x: number; z: number; r: number; h: number; y0: number; dens: number }[] = [];
  seed: number;

  constructor(seed: number) {
    this.seed = seed;
    for (let i = 0; i < BX * BZ; i++) this.buckets.push([]);
  }

  // ---------- perustiedot ----------
  h(x: number, z: number): number {
    const fx = clamp(x / CELL, 0, NX - 1.001), fz = clamp(z / CELL, 0, NZ - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const H = this.heights;
    const i0 = iz * NX + ix;
    const a = H[i0], b = H[i0 + 1], c = H[i0 + NX], d = H[i0 + NX + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  groundAt(x: number, z: number): number {
    const ix = clamp(Math.floor(x / CELL), 0, NX - 2), iz = clamp(Math.floor(z / CELL), 0, NZ - 2);
    return this.ground[iz * (NX - 1) + ix];
  }
  inMap(x: number, z: number): boolean { return x >= 1 && z >= 1 && x <= MAP_W - 1 && z <= MAP_D - 1; }

  insideBuilding(x: number, z: number, margin = 0): number {
    const b = this.bucketAt(x, z);
    if (!b) return -1;
    for (const o of b) {
      if (this.obsType[o] !== OB_BUILD) continue;
      const B = this.buildings[this.obsIdx[o]];
      if (x > B.x0 - margin && x < B.x1 + margin && z > B.z0 - margin && z < B.z1 + margin) return this.obsIdx[o];
    }
    return -1;
  }
  bucketAt(x: number, z: number): number[] | null {
    const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET);
    if (bx < 0 || bz < 0 || bx >= BX || bz >= BZ) return null;
    return this.buckets[bz * BX + bx];
  }

  addObstacle(type: number, idx: number, x0: number, z0: number, x1: number, z1: number) {
    const id = this.obsType.length;
    this.obsType.push(type);
    this.obsIdx.push(idx);
    const m = 2;
    const bx0 = clamp(Math.floor((x0 - m) / BUCKET), 0, BX - 1), bx1 = clamp(Math.floor((x1 + m) / BUCKET), 0, BX - 1);
    const bz0 = clamp(Math.floor((z0 - m) / BUCKET), 0, BZ - 1), bz1 = clamp(Math.floor((z1 + m) / BUCKET), 0, BZ - 1);
    for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) this.buckets[bz * BX + bx].push(id);
  }

  // Kerää esteet, joiden lohkojen läpi jana kulkee.
  private gather(ax: number, az: number, bx: number, bz: number, out: number[]) {
    out.length = 0;
    if (++this.stampN > 4e9) { this.stamp.fill(0); this.stampN = 1; }
    const sn = this.stampN;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / 4));
    let last = -1;
    for (let i = 0; i <= n; i++) {
      const x = ax + (dx * i) / n, z = az + (dz * i) / n;
      const ix = Math.floor(x / BUCKET), iz = Math.floor(z / BUCKET);
      if (ix < 0 || iz < 0 || ix >= BX || iz >= BZ) continue;
      const k = iz * BX + ix;
      if (k === last) continue;
      last = k;
      const arr = this.buckets[k];
      for (let j = 0; j < arr.length; j++) {
        const o = arr[j];
        if (this.stamp[o] !== sn) { this.stamp[o] = sn; out.push(o); }
      }
    }
  }
  private tmpList: number[] = [];

  // Jana vs. ontto talo: palauttaa ensimmäisen osuman seinään (ei aukkoon) tai kattoon.
  // res.t = parametri, res.roof = osui kattoon, res.open = kulki aukon läpi (peitteisyyttä varten)
  buildingHit(B: Building, ax: number, ay: number, az: number, dx: number, dy: number, dz: number, res: { t: number; roof: boolean; open: number }) {
    res.t = 2; res.roof = false; res.open = 0;
    // nopea karsinta koko talon laatikolla
    if (segAabb(ax, ay, az, dx, dy, dz, B.x0, B.y0 - 1, B.z0, B.x1, B.y0 + B.wallH + B.roofH, B.z1) > 1) return;
    for (let i = 0; i < 4; i++) {
      const w = wallBox(B, i);
      const t = segAabb(ax, ay, az, dx, dy, dz, w[0], w[1], w[2], w[3], w[4], w[5]);
      if (t > 1 || t >= res.t) continue;
      const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
      const u = i < 2 ? (px - B.x0) / (B.x1 - B.x0) : (pz - B.z0) / (B.z1 - B.z0);
      const hy = py - B.y0;
      let inOpen = false;
      for (const o of B.openings) if (u > o.u0 && u < o.u1 && hy > o.y0 && hy < o.y1) { inOpen = true; break; }
      if (inOpen) { res.open++; continue; }
      res.t = t; res.roof = false;
    }
    // katto: harjakaton tilavuus likimain laatikkona
    const rt = segAabb(ax, ay, az, dx, dy, dz, B.x0, B.y0 + B.wallH, B.z0, B.x1, B.y0 + B.wallH + B.roofH * 0.75, B.z1);
    if (rt < res.t) { res.t = rt; res.roof = true; }
  }
  private bres = { t: 2, roof: false, open: 0 };

  // Näkölinja: -1 = estetty, muuten peitteisyys 0..1
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return 0;
    let clear = 1;
    // maasto
    const n = Math.ceil(d / 2);
    const skip = Math.min(0.4, 1.5 / d);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (t < skip || t > 1 - skip) continue;
      const x = ax + dx * t, z = az + dz * t, y = ay + dy * t;
      const g = this.h(x, z);
      const above = y - g;
      if (above < 0.04) return -1;
      const gt = this.groundAt(x, z);
      if (gt === Gr.Forest && above < 2.2) clear *= 0.955;
      else if (gt === Gr.Wheat && above < 0.95) clear *= t > 1 - 14 / d ? 0.84 : 0.93;
      else if (gt === Gr.Orchard && above < 2) clear *= 0.985;
      else if (gt === Gr.Marsh && above < 1.25) clear *= t > 1 - 12 / d ? 0.86 : 0.94; // ruovikko
    }
    // savu: matka pilven läpi himmentää eksponentiaalisesti
    for (const c of this.smokes) {
      const l2 = dx * dx + dz * dz;
      let t = ((c.x - ax) * dx + (c.z - az) * dz) / l2;
      t = clamp(t, 0, 1);
      const px = ax + dx * t, pz = az + dz * t, py = ay + dy * t;
      const dd = Math.hypot(px - c.x, pz - c.z);
      if (dd >= c.r || py > c.y0 + c.h) continue;
      const half = Math.sqrt(c.r * c.r - dd * dd);
      const L = Math.min(2 * half, half + Math.min(t * d, half) + Math.min((1 - t) * d, half) - half);
      clear *= Math.exp(-L * 0.32 * c.dens);
      if (clear < 0.04) return -1;
    }
    // esteet
    const list = this.tmpList;
    this.gather(ax, az, bx, bz, list);
    for (const o of list) {
      const type = this.obsType[o], idx = this.obsIdx[o];
      if (type === OB_BUILD) {
        const B = this.buildings[idx];
        this.buildingHit(B, ax, ay, az, dx, dy, dz, this.bres);
        if (this.bres.t <= 1) return -1;
        if (this.bres.open) clear *= Math.pow(0.72, this.bres.open); // ikkunanpuitteet
      } else if (type === OB_TREE) {
        const T = this.trees[idx];
        if (T.r > 0) {
          const t = segCyl(ax, ay, az, dx, dy, dz, T.x, T.z, T.r, T.y0, T.y0 + T.trunkH);
          if (t > 0.02 && t < 0.98) return -1;
        }
        const ts = segSphereDepth(ax, ay, az, dx, dy, dz, T.x, T.crownY, T.z, T.crownR);
        if (ts > 0) clear *= Math.max(0.15, 1 - ts * (T.kind === 3 ? 0.42 : 0.18));
      } else if (type === OB_HAY) {
        const H = this.hays[idx];
        const t = segCyl(ax, ay, az, dx, dy, dz, H.x, H.z, H.r, H.y0, H.y0 + H.h * 0.85);
        if (t > 0.02 && t < 0.98) return -1;
      } else {
        const F = this.fences[idx];
        const t = segFence(ax, ay, az, dx, dy, dz, F);
        if (t > 0 && t < 1) clear *= 0.62;
      }
      if (clear < 0.04) return -1;
    }
    return 1 - clear;
  }

  // Luodin askel: ensimmäinen osuma janalla [0,1]. ignore = este, jonka läpi luoti juuri meni.
  bulletHit(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ignore: number, out: HitOut) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    out.t = 2; out.kind = HIT_NONE; out.idx = -1; out.bkind = -1;
    const len = Math.hypot(dx, dy, dz);
    // maasto
    const n = Math.max(1, Math.ceil(len / 0.9));
    let prevT = 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + dx * t, z = az + dz * t;
      if (ay + dy * t < this.h(x, z)) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) / 2;
          if (ay + dy * m < this.h(ax + dx * m, az + dz * m)) hi = m; else lo = m;
        }
        out.t = hi; out.kind = HIT_TERRAIN;
        break;
      }
      prevT = t;
    }
    const list = this.tmpList;
    this.gather(ax, az, bx, bz, list);
    for (const o of list) {
      if (o === ignore) continue;
      const type = this.obsType[o], idx = this.obsIdx[o];
      let t = 2, kind = HIT_NONE;
      if (type === OB_BUILD) {
        const B = this.buildings[idx];
        this.buildingHit(B, ax, ay, az, dx, dy, dz, this.bres);
        t = this.bres.t;
        kind = this.bres.roof ? HIT_ROOF : HIT_BUILD;
        if (t < out.t) out.bkind = B.kind;
      } else if (type === OB_TREE) {
        const T = this.trees[idx];
        if (T.r > 0) { t = segCyl(ax, ay, az, dx, dy, dz, T.x, T.z, T.r, T.y0 - 0.5, T.y0 + T.trunkH); kind = HIT_TRUNK; }
      } else if (type === OB_HAY) {
        const H = this.hays[idx];
        t = segCyl(ax, ay, az, dx, dy, dz, H.x, H.z, H.r * 0.9, H.y0 - 0.3, H.y0 + H.h * 0.8);
        kind = HIT_HAY;
      } else {
        t = segFence(ax, ay, az, dx, dy, dz, this.fences[idx]);
        kind = HIT_FENCE;
      }
      if (t >= 0 && t < out.t) { out.t = t; out.kind = kind; out.idx = o; }
    }
  }

  // Polunhaun ruudukko (4 m)
  buildNav() {
    const nx = MAP_W / 4, nz = MAP_D / 4;
    this.blockedNav = new Uint8Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = ix * 4 + 2, z = iz * 4 + 2;
      if (!this.inMap(x, z)) this.blockedNav[iz * nx + ix] = 1;
    }
  }
  // Ajoneuvojen ruudukko: metsä, talot ja paksut puunrungot estävät.
  buildVehNav() {
    const nx = MAP_W / 4, nz = MAP_D / 4;
    this.blockedVeh = new Uint8Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = ix * 4 + 2, z = iz * 4 + 2;
      if (!this.walkableVeh(x, z)) this.blockedVeh[iz * nx + ix] = 1;
    }
  }
  walkableVeh(x: number, z: number): boolean {
    if (!this.inMap(x, z) || x < 3 || z < 3 || x > MAP_W - 3 || z > MAP_D - 3) return false;
    if (this.insideBuilding(x, z, 2.7) >= 0) return false;
    const gg = this.groundAt(x, z);
    if (gg === Gr.Forest || gg === Gr.Marsh) return false;
    const b = this.bucketAt(x, z);
    if (b) for (const o of b) {
      if (this.obsType[o] !== OB_TREE) continue;
      const t = this.trees[this.obsIdx[o]];
      if (t.r >= 0.11 && Math.hypot(t.x - x, t.z - z) < 1.7) return false;
    }
    return true;
  }
  navCostVeh(ix: number, iz: number): number {
    const g = this.groundAt(ix * 4 + 2, iz * 4 + 2);
    return g === Gr.Road ? 0.7 : g === Gr.Plowed ? 1.35 : g === Gr.Wheat ? 1.1 : g === Gr.Yard ? 1.2 : 1;
  }
  navCost(ix: number, iz: number): number {
    const x = ix * 4 + 2, z = iz * 4 + 2;
    let c = GROUND_COST[this.groundAt(x, z)];
    if (this.insideBuilding(x, z, 1) >= 0) c += 1.5; // ikkunoista ja ovista kulkeminen hidastaa
    const b = this.bucketAt(x, z);
    if (b) for (const o of b) {
      if (this.obsType[o] !== OB_FENCE) continue;
      const F = this.fences[this.obsIdx[o]];
      if (distPointSeg2(x, z, F.x1, F.z1, F.x2, F.z2) < 2.2) { c += 1.5; break; }
    }
    return c;
  }
  walkable(x: number, z: number): boolean { return this.inMap(x, z); }
  // Onko piste seinälinjan lähellä (sisään tai ulos kulkiessa liike hidastuu)?
  nearWall(x: number, z: number): boolean {
    const bi = this.insideBuilding(x, z, 0.5);
    if (bi < 0) return false;
    const B = this.buildings[bi];
    return Math.min(Math.abs(x - B.x0), Math.abs(x - B.x1), Math.abs(z - B.z0), Math.abs(z - B.z1)) < 0.5;
  }
}

// ---------- geometria ----------
export function distPointSeg2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function segAabb(ax: number, ay: number, az: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  let tmin = 0, tmax = 1;
  const o = [ax, ay, az], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return 2;
    } else {
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return 2;
    }
  }
  return tmin;
}

function segCyl(ax: number, ay: number, az: number, dx: number, dy: number, dz: number,
  cx: number, cz: number, r: number, ylo: number, yhi: number): number {
  const fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return 2;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 2;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a);
  if (t < 0) { if (c < 0) t = 0; else return 2; }
  if (t > 1) return 2;
  const y = ay + dy * t;
  if (y < ylo || y > yhi) return 2;
  return t;
}

// Palauttaa kuinka "syvältä" jana kulkee pallon läpi (0..1 suhteessa halkaisijaan), 0 jos ei osu.
function segSphereDepth(ax: number, ay: number, az: number, dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number, r: number): number {
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / l2;
  if (t < 0.02 || t > 0.98) return 0;
  const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz;
  const d = Math.sqrt(px * px + py * py + pz * pz);
  if (d >= r) return 0;
  return Math.sqrt(1 - (d * d) / (r * r));
}

function segFence(ax: number, ay: number, az: number, dx: number, dy: number, dz: number, F: Fence): number {
  const ex = F.x2 - F.x1, ez = F.z2 - F.z1;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return 2;
  const t = ((F.x1 - ax) * ez - (F.z1 - az) * ex) / den;
  const u = ((F.x1 - ax) * dz - (F.z1 - az) * dx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return 2;
  const y = ay + dy * t;
  if (y > F.y0 + F.h || y < F.y0 - 0.5) return 2;
  return t;
}

// ---------- kartan generointi ----------
export const roadX = (z: number) => 240 + 14 * Math.sin(z / 85) + 6 * Math.sin(z / 37);
export const gullyZ = (x: number) => 352 + 16 * Math.sin(x / 70) + 6 * Math.sin(x / 23);
export const SIDE_ROAD_Z = 162;
export const BARN = { x: 330, z: 160 };

// Rakennusapuvälineet kartoille: maastotyypin alue, talo, aita, puu, heinäsuova.
export function makeBuilder(T: Terrain, rng: Rng) {
  const setGroundRect = (x0: number, z0: number, x1: number, z1: number, g: number) => {
    for (let z = Math.max(0, z0); z < Math.min(MAP_D - 1, z1); z += CELL) for (let x = Math.max(0, x0); x < Math.min(MAP_W - 1, x1); x += CELL) {
      const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
      if (T.ground[iz * (NX - 1) + ix] !== Gr.Road) T.ground[iz * (NX - 1) + ix] = g;
    }
  };

  const addBuilding = (cx: number, cz: number, sx: number, sz: number, wallH: number, roofH: number, kind: number) => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const y0 = Math.min(T.h(x0, z0), T.h(x1, z0), T.h(x0, z1), T.h(x1, z1), T.h(cx, cz));
    // tasoitetaan maa talon alta, jotta lattia on vaakasuora
    for (let iz = Math.floor((z0 - 1) / CELL); iz <= Math.ceil((z1 + 1) / CELL); iz++) for (let ix = Math.floor((x0 - 1) / CELL); ix <= Math.ceil((x1 + 1) / CELL); ix++) {
      if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) continue;
      const px = ix * CELL, pz = iz * CELL;
      const inside = px >= x0 - 0.2 && px <= x1 + 0.2 && pz >= z0 - 0.2 && pz <= z1 + 0.2;
      if (inside) T.heights[iz * NX + ix] = y0;
      else T.heights[iz * NX + ix] = Math.max(y0 - 0.3, Math.min(T.heights[iz * NX + ix], y0 + 0.25));
    }
    const openings: Opening[] = kind === 1
      ? [{ u0: 0.39, u1: 0.61, y0: -0.6, y1: 3.0 }]
      : [{ u0: 0.22, u1: 0.38, y0: 0.9, y1: 1.8 }, { u0: 0.62, u1: 0.78, y0: 0.9, y1: 1.8 }];
    const spots: Spot[] = [];
    for (let i = 0; i < 4; i++) for (const o of openings) {
      const u = (o.u0 + o.u1) / 2, ins = 0.65;
      if (i === 0) spots.push({ x: x0 + (x1 - x0) * u, z: z0 + ins, dir: Math.PI });
      else if (i === 1) spots.push({ x: x0 + (x1 - x0) * u, z: z1 - ins, dir: 0 });
      else if (i === 2) spots.push({ x: x0 + ins, z: z0 + (z1 - z0) * u, dir: -Math.PI / 2 });
      else spots.push({ x: x1 - ins, z: z0 + (z1 - z0) * u, dir: Math.PI / 2 });
    }
    const B: Building = { x0, x1, z0, z1, y0, wallH, roofH, alongX: sx > sz, kind, openings, spots };
    T.buildings.push(B);
    T.addObstacle(OB_BUILD, T.buildings.length - 1, x0, z0, x1, z1);
  };
  const addFence = (x1: number, z1: number, x2: number, z2: number) => {
    const y0 = (T.h(x1, z1) + T.h(x2, z2)) / 2;
    T.fences.push({ x1, z1, x2, z2, y0, h: 1.15 });
    T.addObstacle(OB_FENCE, T.fences.length - 1, Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2));
  };
  const addTree = (x: number, z: number, kind: number) => {
    const y0 = T.h(x, z);
    let tr: Tree;
    if (kind === 0) { const hh = rng.range(14, 21); tr = { x, z, y0, r: rng.range(0.14, 0.24), trunkH: hh * 0.8, crownY: y0 + hh * 0.66, crownR: rng.range(2.0, 2.8), kind }; }
    else if (kind === 1) { const hh = rng.range(11, 17); tr = { x, z, y0, r: rng.range(0.11, 0.18), trunkH: hh * 0.6, crownY: y0 + hh * 0.68, crownR: rng.range(2.4, 3.4), kind }; }
    else if (kind === 2) { tr = { x, z, y0, r: 0.1, trunkH: 1.9, crownY: y0 + 2.7, crownR: rng.range(1.5, 2.1), kind }; }
    else { tr = { x, z, y0, r: 0, trunkH: 0, crownY: y0 + 1.0, crownR: rng.range(1.4, 2.2), kind }; }
    T.trees.push(tr);
    const m = Math.max(tr.r, tr.crownR);
    T.addObstacle(OB_TREE, T.trees.length - 1, x - m, z - m, x + m, z + m);
  };
  const addHay = (x: number, z: number) => {
    const H: Hay = { x, z, y0: T.h(x, z), r: rng.range(1.6, 2.2), h: rng.range(2.6, 3.4) };
    T.hays.push(H);
    T.addObstacle(OB_HAY, T.hays.length - 1, x - H.r, z - H.r, x + H.r, z + H.r);
  };

  return { setGroundRect, addBuilding, addFence, addTree, addHay };
}

export function generateMap(map: string, seed: number): Terrain {
  return map === 'bagr' ? generateBagration(seed) : generateTerrain(seed);
}

export function generateTerrain(seed: number): Terrain {
  const T = new Terrain(seed);
  const rng = new Rng(seed * 7 + 3);

  // korkeudet
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const x = ix * CELL, z = iz * CELL;
    let h = 3.0 * fbm(x / 150, z / 150, seed, 4);
    h += 4.2 * Math.exp(-(((x - 255) ** 2) / (2 * 120 ** 2) + ((z - 185) ** 2) / (2 * 85 ** 2)));
    const gz = gullyZ(x);
    h -= 2.8 * Math.exp(-((z - gz) ** 2) / (2 * 8 ** 2));
    h += 2.6 * Math.exp(-((z - 495) ** 2) / (2 * 22 ** 2)) * (0.7 + 0.3 * Math.sin(x / 60));
    h += 0.38 * fbm(x / 22, z / 22, seed + 5, 3);
    // tien pohja tasaisemmaksi
    const rd = Math.abs(x - roadX(z));
    if (rd < 6) h -= 0.15 * (1 - rd / 6);
    T.heights[iz * NX + ix] = h;
  }

  // maastotyypit
  const forestEdge = (z: number) => 92 + 16 * fbm(z / 60, 3.3, seed + 9, 3);
  for (let iz = 0; iz < NZ - 1; iz++) for (let ix = 0; ix < NX - 1; ix++) {
    const x = ix * CELL + 1, z = iz * CELL + 1;
    let g = Gr.Grass;
    const gz = gullyZ(x);
    if (z > 285 && z < 470 && x > 118 && x < 400) g = Gr.Wheat;
    if (x >= 400 && z > 250 && z < 470) g = Gr.Plowed;
    if (z < 105) g = Gr.Meadow;
    if (z >= 470) g = Gr.Meadow;
    if (Math.abs(z - gz) < 13) g = Gr.Meadow;
    if (x < forestEdge(z) && z > 60 && z < 485) g = Gr.Forest;
    const ex = (x - 392) / 34, ez = (z - 365) / 26;
    if (ex * ex + ez * ez < 1 + 0.25 * fbm(x / 12, z / 12, seed + 2, 2)) g = Gr.Forest;
    if (Math.abs(x - roadX(z)) < 3.2) g = Gr.Road;
    if (z > SIDE_ROAD_Z - 2.6 && z < SIDE_ROAD_Z + 2.6 && x > roadX(z) && x < BARN.x - 10) g = Gr.Road;
    T.ground[iz * (NX - 1) + ix] = g;
  }

  const { setGroundRect, addBuilding, addFence, addTree, addHay } = makeBuilder(T, rng);

  // kylä: talot tien varrella, pihat aitoineen
  for (const side of [-1, 1]) {
    let z = 122 + rng.range(0, 6);
    while (z < 272) {
      const nearSquare = side < 0 && z > 186 && z < 214;
      const nearSide = side > 0 && Math.abs(z - SIDE_ROAD_Z) < 14;
      if (!nearSquare && !nearSide) {
        const rx = roadX(z);
        const hx = rx + side * 14.5;
        addBuilding(hx, z, 7, 9, 2.7, 2.6, 0);
        // piha talon takana
        const yx0 = rx + side * 10.5, yx1 = rx + side * (36 + rng.range(-3, 5));
        const za = z - 11.5, zb = z + 11.5;
        const lo = Math.min(yx0, yx1), hi = Math.max(yx0, yx1);
        setGroundRect(lo + (side > 0 ? 8 : 0), za, hi - (side < 0 ? 8 : 0), zb, Gr.Yard);
        const outer = side > 0 ? hi : lo;
        const segs: [number, number, number, number][] = [
          [lo + (side > 0 ? 7.5 : 0), za, hi - (side < 0 ? 7.5 : 0), za],
          [lo + (side > 0 ? 7.5 : 0), zb, hi - (side < 0 ? 7.5 : 0), zb],
          [outer, za, outer, zb],
        ];
        for (const s of segs) {
          // pätkitään aita, osa puuttuu (portit, rikkinäiset kohdat)
          const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
          const n = Math.ceil(len / 5);
          for (let i = 0; i < n; i++) {
            if (rng.chance(0.18)) continue;
            const t0 = i / n, t1 = (i + 1) / n;
            addFence(s[0] + (s[2] - s[0]) * t0, s[1] + (s[3] - s[1]) * t0, s[0] + (s[2] - s[0]) * t1, s[1] + (s[3] - s[1]) * t1);
          }
        }
        if (rng.chance(0.6)) {
          const nt = rng.int(3, 7);
          for (let i = 0; i < nt; i++) addTree(rng.range(lo + 3, hi - 3) + (side > 0 ? 6 : -6) * 0.4, rng.range(za + 2.5, zb - 2.5), 2);
        }
        if (rng.chance(0.5)) addTree(rx + side * rng.range(5, 7), z + rng.range(-10, 10), 1);
      }
      z += rng.range(24, 30);
    }
  }
  // kolhoosin varasto
  addBuilding(BARN.x, BARN.z, 26, 11, 4.2, 3.2, 1);
  setGroundRect(BARN.x - 22, BARN.z - 16, BARN.x + 22, BARN.z + 16, Gr.Yard);
  // hedelmätarha kylän itälaidalla
  for (let x = 300; x < 345; x += 6.5) for (let z = 200; z < 250; z += 6.5) {
    setGroundRect(x - 3, z - 3, x + 3.5, z + 3.5, Gr.Orchard);
    if (rng.chance(0.85)) addTree(x + rng.range(-1, 1), z + rng.range(-1, 1), 2);
  }

  // metsät
  for (let z = 4; z < MAP_D; z += 5.5) for (let x = 2; x < MAP_W; x += 5.5) {
    const px = x + rng.range(-2.5, 2.5), pz = z + rng.range(-2.5, 2.5);
    if (T.groundAt(px, pz) !== Gr.Forest) continue;
    if (rng.chance(0.78)) addTree(px, pz, rng.chance(0.6) ? 0 : 1);
    else if (rng.chance(0.6)) addTree(px, pz, 3);
  }
  // pensaita notkossa
  for (let x = 100; x < MAP_W; x += rng.range(5, 14)) {
    const z = gullyZ(x) + rng.range(-6, 6);
    if (Math.abs(x - roadX(z)) < 6) continue;
    addTree(x, z, rng.chance(0.85) ? 3 : 1);
  }
  // koivuja tienvarteen kylän ulkopuolelle
  for (let z = 20; z < MAP_D; z += rng.range(14, 30)) {
    if (z > 115 && z < 280) continue;
    addTree(roadX(z) + (rng.chance(0.5) ? 1 : -1) * rng.range(5, 7), z, 1);
  }
  // heinäsuovat
  const hayPts = [[160, 300], [205, 296], [300, 292], [345, 305], [150, 448], [330, 455], [280, 470], [420, 270], [182, 100], [300, 95], [270, 296], [380, 440]];
  for (const [x, z] of hayPts) addHay(x + rng.range(-5, 5), z + rng.range(-4, 4));

  T.buildNav();
  T.buildVehNav();
  return T;
}

// ---------- Bagration: suo, koivikko, Zaborjen kylä ja Korkeus 146,2 ----------
const ROAD2: number[][] = [[0, 314], [60, 320], [140, 328], [200, 334], [260, 342], [330, 352], [400, 361], [480, 367], [560, 371]];
export const roadX2 = (z: number) => {
  for (let i = 1; i < ROAD2.length; i++) if (z <= ROAD2[i][0]) { const [z0, x0] = ROAD2[i - 1], [z1, x1] = ROAD2[i]; return x0 + (x1 - x0) * (z - z0) / (z1 - z0); }
  return ROAD2[ROAD2.length - 1][1];
};
export const LANE_Z = 206; // kylästä kukkulalle vievä kärrytie
function marshMask(x: number, z: number, seed: number) {
  const ex = (x - 178) / 150, ez = (z - 402) / (40 + 8 * Math.sin(x / 40));
  const r = Math.sqrt(ex * ex + ez * ez) + 0.22 * fbm(x / 35, z / 35, seed + 21, 3);
  return clamp((1 - r) * 3, 0, 1);
}
export function generateBagration(seed: number): Terrain {
  const T = new Terrain(seed);
  const rng = new Rng(seed * 11 + 5);
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const x = ix * CELL, z = iz * CELL;
    let h = 1.6 * fbm(x / 140, z / 140, seed + 40, 4);
    h += 5.5 * Math.exp(-(((x - 172) ** 2) / (2 * 72 ** 2) + ((z - 248) ** 2) / (2 * 58 ** 2)));
    h += 2.4 * Math.exp(-(((x - 335) ** 2) / (2 * 85 ** 2) + ((z - 185) ** 2) / (2 * 70 ** 2)));
    h += 2.6 * Math.exp(-((z - 503) ** 2) / (2 * 15 ** 2)) + (z > 503 ? 2.6 * (1 - Math.exp(-((z - 503) ** 2) / (2 * 15 ** 2))) * 0.35 : 0);
    h -= 1.7 * marshMask(x, z, seed);
    h += 0.3 * fbm(x / 20, z / 20, seed + 45, 3);
    const rd = Math.abs(x - roadX2(z));
    if (rd < 6) h -= 0.12 * (1 - rd / 6);
    T.heights[iz * NX + ix] = h;
  }
  const grove = (x: number, z: number) => { const ex = (x - 434) / 44, ez = (z - 346) / 72; return ex * ex + ez * ez < 1 + 0.3 * fbm(x / 14, z / 14, seed + 8, 2); };
  for (let iz = 0; iz < NZ - 1; iz++) for (let ix = 0; ix < NX - 1; ix++) {
    const x = ix * CELL + 1, z = iz * CELL + 1;
    let g = Gr.Grass;
    if (z < 70) g = Gr.Meadow;
    if (x > 205 && x < 320 && z > 316 + 6 * Math.sin(x / 17) && z < 362) g = Gr.Wheat; // ruispelto rinteen edessä
    if (x > 40 && x < 132 && z > 140 && z < 228) g = Gr.Plowed; // perunamaa
    if (x > 395 && z > 150 && z < 250) g = Gr.Meadow;
    if (marshMask(x, z, seed) > 0.2) g = Gr.Marsh;
    if (z > 497 + 10 * fbm(x / 50, 1.7, seed + 3, 3)) g = Gr.Forest;
    if (x < 34 + 14 * fbm(z / 45, 2.9, seed + 4, 3) && z > 70) g = Gr.Forest;
    if (grove(x, z)) g = Gr.Forest;
    if (Math.abs(x - roadX2(z)) < 3.2) g = Gr.Road;
    if (z > LANE_Z - 2.2 && z < LANE_Z + 2.2 && x > 205 && x < roadX2(z)) g = Gr.Road;
    T.ground[iz * (NX - 1) + ix] = g;
  }
  const { setGroundRect, addBuilding, addFence, addTree, addHay } = makeBuilder(T, rng);
  // Zaborje: talot tien molemmin puolin
  for (const side of [-1, 1]) {
    let z = 140 + rng.range(0, 5);
    while (z < 238) {
      if (!(Math.abs(z - LANE_Z) < 12 && side < 0)) {
        const rx = roadX2(z);
        addBuilding(rx + side * 14, z, 7, 9, 2.7, 2.6, 0);
        const lo = Math.min(rx + side * 10.5, rx + side * 34), hi = Math.max(rx + side * 10.5, rx + side * 34);
        setGroundRect(lo + (side > 0 ? 8 : 0), z - 11, hi - (side < 0 ? 8 : 0), z + 11, Gr.Yard);
        const outer = side > 0 ? hi : lo;
        for (const sg of [[lo + (side > 0 ? 7.5 : 0), z - 11, hi - (side < 0 ? 7.5 : 0), z - 11], [lo + (side > 0 ? 7.5 : 0), z + 11, hi - (side < 0 ? 7.5 : 0), z + 11], [outer, z - 11, outer, z + 11]]) {
          const n = Math.ceil(Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) / 5);
          for (let i = 0; i < n; i++) { if (rng.chance(0.25)) continue; const t0 = i / n, t1 = (i + 1) / n; addFence(sg[0] + (sg[2] - sg[0]) * t0, sg[1] + (sg[3] - sg[1]) * t0, sg[0] + (sg[2] - sg[0]) * t1, sg[1] + (sg[3] - sg[1]) * t1); }
        }
        if (rng.chance(0.7)) for (let i = 0; i < rng.int(2, 5); i++) addTree(rng.range(lo + 3, hi - 3), rng.range(z - 8, z + 8), 2);
      }
      z += rng.range(23, 28);
    }
  }
  // kärrytien varren talot ja kolhoosin lato
  addBuilding(292, LANE_Z - 9, 9, 7, 2.6, 2.5, 0);
  addBuilding(262, LANE_Z + 9, 9, 7, 2.6, 2.5, 0);
  addBuilding(392, 168, 24, 10, 4.0, 3.0, 1);
  setGroundRect(372, 150, 412, 186, Gr.Yard);
  // metsät: etelän ja lännen havumetsä, idän koivikko
  for (let z = 4; z < MAP_D; z += 5.5) for (let x = 2; x < MAP_W; x += 5.5) {
    const px = x + rng.range(-2.5, 2.5), pz = z + rng.range(-2.5, 2.5);
    if (T.groundAt(px, pz) !== Gr.Forest) continue;
    const birch = grove(px, pz);
    if (rng.chance(birch ? 0.72 : 0.76)) addTree(px, pz, birch ? (rng.chance(0.85) ? 1 : 0) : (rng.chance(0.65) ? 0 : 1));
    else if (rng.chance(0.6)) addTree(px, pz, 3);
  }
  // pajupensaita ja yksittäisiä koivuja suolla
  for (let i = 0; i < 260; i++) {
    const x = rng.range(25, 340), z = rng.range(350, 455);
    if (T.groundAt(x, z) !== Gr.Marsh) continue;
    addTree(x, z, rng.chance(0.88) ? 3 : 1);
  }
  // pensaita kukkulalla ja peltojen reunoilla
  for (let i = 0; i < 40; i++) {
    const x = rng.range(110, 260), z = rng.range(200, 300);
    if (T.groundAt(x, z) === Gr.Grass && rng.chance(0.5)) addTree(x, z, 3);
  }
  for (let z = 10; z < MAP_D; z += rng.range(16, 34)) {
    if (z > 130 && z < 245) continue;
    const x = roadX2(z) + (rng.chance(0.5) ? 1 : -1) * rng.range(5, 7);
    if (T.groundAt(x, z) !== Gr.Forest) addTree(x, z, 1);
  }
  for (const [x, z] of [[150, 330], [120, 300], [240, 375], [395, 220], [430, 200], [70, 260], [90, 330], [260, 470]]) {
    if (T.groundAt(x, z) !== Gr.Marsh && T.groundAt(x, z) !== Gr.Forest) addHay(x + rng.range(-4, 4), z + rng.range(-4, 4));
  }
  T.buildNav();
  T.buildVehNav();
  return T;
}

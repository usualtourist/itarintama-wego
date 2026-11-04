// Deterministinen satunnaislukugeneraattori (mulberry32) ja arvokohina.

export class Rng {
  s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(a + (b - a + 1) * this.next()); }
  chance(p: number): boolean { return this.next() < p; }
  gauss(): number {
    let u = 0;
    while (u === 0) u = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
  pick<T>(a: T[]): T { return a[Math.floor(this.next() * a.length)]; }
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

export function fbm(x: number, z: number, seed: number, oct = 4): number {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * (valueNoise(x * f, z * f, seed + i * 17) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

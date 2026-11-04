// Simulaatioydin: sotilaat, ryhmät, liike, havainnointi, ammunta, ballistiikka,
// tukahdutus, moraali ja tallennus WeGo-toistoa varten.
import { Rng, clamp } from './rng';
import { Terrain, generateMap, roadX, MAP_W, MAP_D, GROUND_SPEED, HitOut, HIT_NONE, HIT_TERRAIN, HIT_BUILD, HIT_TRUNK, HIT_HAY, HIT_FENCE, HIT_ROOF, distPointSeg2, segAabb, GROUND_NAMES } from './terrain';
import { WEAPONS, Weapon, Side, SCENARIO, nameFor, SquadDef, VEHICLES, VehSpec, nationOf } from './data';
import { findPath } from './pathfind';

export const DT = 0.05;
export const TURN_SECONDS = 60;
export const TICKS = Math.round(TURN_SECONDS / DT);
export const FSTRIDE = 9; // tallennettuja arvoja per sotilas per ruutu
const SUB = 10;           // luodin alivaiheet per tikki
const G = 9.81;
const FOX_DEPTH = 0.75;

export type Mode = 'move' | 'quick' | 'fast' | 'hunt' | 'slow';
export const MODE_SPEED: Record<Mode, number> = { move: 1.45, quick: 3.0, fast: 4.6, hunt: 1.05, slow: 0.42 };
export const MODE_NAMES: Record<Mode, string> = { move: 'Liiku', quick: 'Nopea', fast: 'Ryntäys', hunt: 'Etsi', slow: 'Ryömi' };
// Panssarivaunun nopeudet (m/s) ja maastokertoimet
export const VEH_SPEED: Record<Mode, number> = { move: 3.2, quick: 5.5, fast: 8.0, hunt: 2.4, slow: 1.5 };
const VEH_GROUND = [0.9, 0.85, 0, 1.3, 0.7, 0.8, 0.75, 0.9];
void GROUND_NAMES;

export interface Veh {
  type: string; turret: number; buttoned: boolean; hatchOrder: boolean; immob: boolean; ko: boolean; cmdHit: boolean;
  mgAmmo: number; mgMag: number; mgNext: number; mgBurst: number; mgReload: number; mgTgt: number;
  engineT: number; shells: number; corrTgt: number; corr: number; gunDmg: boolean; crewHits: number; gunPos: number;
}
export interface Gun {
  w: Weapon; ambush: number; frontOk: boolean; scale: number;
  x: number; z: number; heading: number; aim: number; ap: number; he: number; next: number;
  corrTgt: number; corr: number; dead: boolean; seen0: boolean; tgt: number; moveT: number; shots: number;
}

export const ST_OK = 0, ST_WOUNDED = 1, ST_INCAP = 2, ST_DEAD = 3;
export const P_STAND = 0, P_CROUCH = 1, P_PRONE = 2;
export const MSTATE_NAMES = ['Valmis', 'Järkyttynyt', 'Maassa', 'Murtunut', 'Pakenee'];
export const STATE_NAMES = ['Kunnossa', 'Haavoittunut', 'Toimintakyvytön', 'Kaatunut'];

export interface Soldier {
  id: number; side: Side; squad: number; name: string; rank: string; role: string;
  w: Weapon; ammo: number; mag: number; grenades: number;
  x: number; z: number; heading: number; posture: number; state: number; out: boolean;
  supp: number; suppT: number; fatigue: number; exp: number;
  reloadT: number; nextShot: number; burst: number; fired: number; setupT: number;
  moving: boolean; speed: number; tx: number; tz: number; slotLat: number; slotBack: number;
  foxhole: number; vis: number[]; visT: number; postureT: number;
  tgt: number; tgtT: number; tgtLos: boolean; nadeT: number;
  underFireT: number; threatX: number; threatZ: number;
  kills: number; shots: number; hitsTaken: number; wounds: number;
  sndT: number; areaT: number; areaLos: boolean; biasX: number; biasY: number;
  veh: Veh | null; pzf: number; huntTank: number; spot: string | null; spotDir: number;
  aidTarget: number; aidT: number; treated: boolean; homeX: number; homeZ: number;
}
export interface Waypoint { x: number; z: number; mode: Mode; }
export interface PathPt { x: number; z: number; mode: Mode; wp: boolean; }
export type TargetOrder = { kind: 'unit'; id: number } | { kind: 'area'; x: number; z: number } | null;
export interface Squad {
  id: number; side: Side; name: string; short: string; members: number[]; leader: number;
  morale: number; baseMorale: number; mstate: number; exp: number;
  orders: Waypoint[]; path: PathPt[]; gx: number; gz: number; moving: boolean; arrived: boolean;
  face: number | null; hide: boolean; target: TargetOrder; targetUntil: number;
  ai: string; hold: number; freeFire: boolean; lastFireT: number; aiState: string; aiT: number;
  casualties: number; retreating: boolean; veh: boolean; tankFireT: number; gun: Gun | null;
  c2: boolean; holdUntil: number; newOrders: boolean; hq: boolean; leadRole: string; parent: number; child: number; dissolved: boolean; baseName: string; baseShort: string;
  smokeLeft: number; smokeOrder: { x: number; z: number } | null; mortar: { next: number; corrKey: string; corr: number; spotT: number; spotOk: boolean; adjX: number; adjZ: number } | null;
}
export interface Shot { t0: number; x0: number; y0: number; z0: number; t1: number; x1: number; y1: number; z1: number; side: number; tracer: boolean; big: boolean; w: string; }
export interface Msg { t: number; side: number; text: string; kind: number; }
export interface Smoke { id: number; x0: number; z0: number; t0: number; rMax: number; grow: number; dur: number; h: number; }
export interface ArtyMission { kind: 'he' | 'smoke'; x: number; z: number; tReq: number; tSpot: number; tFfe: number; los: boolean; state: string; }
// Savupilven tila ajanhetkellä t (sama laskenta simulaatiossa ja piirrossa).
export function smokeAt(c: Smoke, t: number) {
  const age = t - c.t0;
  if (age < 0 || age > c.dur + 25) return null;
  const r = c.rMax * Math.min(1, 0.25 + age / c.grow) * (1 + Math.max(0, age - c.grow) * 0.006);
  const dens = age < c.dur ? Math.min(1, 0.3 + age / c.grow) : Math.max(0, 1 - (age - c.dur) / 25);
  return { x: c.x0 + SCENARIO.wind.x * age, z: c.z0 + SCENARIO.wind.z * age, r, dens };
}
export interface Contact { x: number; z: number; t: number; kind: string; }

interface Bullet {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  sx: number; sy: number; sz: number; t0: number; age: number;
  shooter: number; side: Side; squad: number; mass: number; drag: number; frag: boolean; tracer: boolean;
  ignore: number; nm: number[]; alive: boolean; he: boolean; ap: boolean; pen?: number; penV?: number; heat?: boolean; shatter?: number; maxAge?: number; indirect?: boolean; aimX?: number; aimZ?: number; key?: string; wid?: string;
}

export class Sim {
  T: Terrain;
  rng: Rng;
  soldiers: Soldier[] = [];
  squads: Squad[] = [];
  bullets: Bullet[] = [];
  grenades: { t: number; x: number; z: number; side: Side; thrower: number; bundle: boolean }[] = [];
  time = 0;
  turn = 1;
  turnStart = 0;
  // havaintotiedot
  seenBySquad: Float32Array[] = [];
  sideSeen: Float32Array[] = [];
  sideFirst: Float32Array[] = [];
  lastPos: Float32Array[] = [];
  sounds: Contact[][] = [[], []];
  // tallenne
  frames: Float32Array = new Float32Array(0);
  frameCount = 0;
  shots: Shot[] = [];
  impacts: number[] = [];
  explosions: number[] = [];
  // äänitapahtumat: [aika, koodi, x, y, z]; 1 heitin laukaisee, 2 tykistökranaatti tulossa, 3 heittimen kranaatti tulossa,
  // 4 savukranaatti, 5 vaunun savuheitin, 6 panssarin läpäisy, 7 vaunun ammukset räjähtävät
  sfx: number[] = [];
  msgs: Msg[] = [];
  allMsgs: Msg[] = [];
  casualties = [0, 0];
  gameOver = false;
  objectives = SCENARIO.objectives.map((o) => ({ ...o, owner: 1 as number }));
  hit: HitOut = { t: 2, kind: HIT_NONE, idx: -1, bkind: -1 };
  spotOcc = new Map<string, number>();
  foxOcc: number[] = [];
  aiHook: ((s: Sim) => void) | null = null;
  guns: Squad[] = [];
  smokes: Smoke[] = [];
  smokeId = 0;
  arty: ArtyMission[] = [];
  artyLeft = SCENARIO.artyMissions;
  incoming: { t: number; x: number; z: number; kind: string }[] = [];

  defs: SquadDef[] = [];
  setupName = '';
  constructor(seed: number, setup = seed) {
    this.T = generateMap(SCENARIO.map, seed);
    this.rng = new Rng(seed * 31 + 7);
    this.defs = this.arrangeDefense(setup);
    for (const o of this.objectives) if (o.onRoad) o.x = roadX(o.z) - 10;
    this.setup();
    this.schedulePrep();
  }

  // Valmisteleva keskitys oletettuun etulinjaan ensimmäisen vuoron aikana.
  private schedulePrep() {
    const P = SCENARIO.prep;
    if (!P) return;
    const r = new Rng(77);
    for (let i = 0; i < P.n; i++) this.incoming.push({ t: 2 + (i / P.n) * P.t1 + r.range(0, 2), x: r.range(P.x0, P.x1), z: r.range(P.z0, P.z1), kind: 'he105' });
    this.msg(0, `Valmisteleva keskitys: ${SCENARIO.arty.name} ampuu vihollisen etulinjaan`, 1);
  }

  // ---------------- alustus ----------------
  // Arpoo puolustajan ryhmityksen. Kartta ja hyökkääjän joukot pysyvät samoina.
  private arrangeDefense(setup: number): SquadDef[] {
    const r = new Rng(setup * 7919 + 13);
    const D = SCENARIO.defense;
    const fr = r.pick(D.front), mg = r.pick(D.mg), gun = r.pick(D.gun), res = r.pick(D.reserve);
    let hq = r.pick(D.hq);
    if (Math.hypot(hq[0] - res[0], hq[1] - res[1]) < 20) hq = D.hq[0][0] === res[0] ? D.hq[1] : D.hq[0];
    this.setupName = `${fr.name} · Maxim ${D.mg.indexOf(mg) + 1} · tykki ${D.gun.indexOf(gun) + 1}`;
    const jit = () => r.range(-6, 6);
    return SCENARIO.squads.map((d) => {
      const c: SquadDef = { ...d };
      if (d.slot === 'front0' || d.slot === 'front1') { const p = fr.pos[d.slot === 'front0' ? 0 : 1]; c.x = p[0] + jit(); c.z = p[1] + jit() * 0.5; c.face = p[2]; }
      else if (d.slot === 'mg') { c.x = mg[0] + jit() * 0.5; c.z = mg[1] + jit() * 0.5; c.face = mg[2]; }
      else if (d.slot === 'gun') { c.x = gun[0]; c.z = gun[1]; c.face = gun[2]; }
      else if (d.slot === 'reserve') { c.x = res[0]; c.z = res[1]; }
      else if (d.slot === 'hq') { c.x = hq[0]; c.z = hq[1]; }
      // kuopat eivät saa osua taloon tai tielle
      if (c.foxholes) for (let k = 0; k < 10 && (this.T.insideBuilding(c.x, c.z, 4) >= 0); k++) c.z += 3;
      return c;
    });
  }
  private setup() {
    const used = [new Set<string>(), new Set<string>()];
    this.defs.forEach((def: SquadDef, si: number) => {
      const side = SCENARIO.squadSide[si];
      const sq: Squad = {
        id: si, side, name: def.name, short: def.short, members: [], leader: -1,
        morale: def.morale, baseMorale: def.morale, mstate: 0, exp: def.exp,
        orders: [], path: [], gx: def.x, gz: def.z, moving: false, arrived: true,
        face: def.face, hide: false, target: null, targetUntil: 1e9,
        ai: def.ai || '', hold: def.hold || 2000, freeFire: side === 0, lastFireT: -999, aiState: 'hold', aiT: 0,
        casualties: 0, retreating: false, veh: !!def.vehicle, tankFireT: -99,
        c2: true, holdUntil: 0, newOrders: false, hq: def.ai === 'hq' || si === 0, leadRole: def.men[0].role, parent: -1, child: -1, dissolved: false, baseName: def.name, baseShort: def.short,
        smokeLeft: def.smoke || 0, smokeOrder: null,
        mortar: def.men.some((m) => WEAPONS[m.weapon].kind === 'mortar') ? { next: 0, corrKey: '', corr: 1, spotT: 0, spotOk: false, adjX: 0, adjZ: 0 } : null,
        gun: def.gun ? { w: WEAPONS[def.gun.w ?? 'pst45'], ambush: def.gun.ambush ?? 260, frontOk: !!def.gun.frontOk, scale: def.gun.w === 'pak40' ? 1.35 : 1, x: def.x, z: def.z, heading: def.face, aim: def.face, ap: def.gun.ap, he: def.gun.he, next: 0, corrTgt: -1, corr: 1, dead: false, seen0: false, tgt: -1, moveT: 0, shots: 0 } : null,
      };
      this.squads.push(sq);
      const n = def.men.length;
      def.men.forEach((m, k) => {
        const w = WEAPONS[m.weapon];
        const lat = (k - (n - 1) / 2) * (def.foxholes ? 4.6 : 3.4);
        const back = (k % 2) * (def.foxholes ? 1.6 : 1.4);
        const fx = Math.sin(def.face), fz = Math.cos(def.face);
        const rx = Math.cos(def.face), rz = -Math.sin(def.face);
        let x = def.x + rx * lat - fx * back + this.rng.range(-0.6, 0.6);
        let z = def.z + rz * lat - fz * back + this.rng.range(-0.6, 0.6);
        if (def.gun) {
          // tykkimiehistö kuopissa kilven takana
          const bk = [1.1, 1.6, 2.6, 3.4][k] ?? 3, lt = [0.55, -0.6, 0.9, -1.2][k] ?? 0;
          x = def.x + rx * lt - fx * bk; z = def.z + rz * lt - fz * bk;
        }
        if (!this.T.walkable(x, z)) { x = def.x; z = def.z; }
        const s: Soldier = {
          id: this.soldiers.length, side, squad: si, name: nameFor(nationOf(side), this.rng, used[side]), rank: m.rank, role: m.role,
          w, ammo: w.ammo - w.mag, mag: w.mag, grenades: m.grenades,
          x, z, heading: def.face, posture: P_CROUCH, state: ST_OK, out: false,
          supp: 0, suppT: -99, fatigue: 0, exp: def.exp,
          reloadT: 0, nextShot: 0, burst: 0, fired: -99, setupT: 99,
          moving: false, speed: 0, tx: x, tz: z, slotLat: lat, slotBack: back,
          foxhole: -1, vis: [], visT: this.rng.range(0, 1.5), postureT: 0,
          tgt: -1, tgtT: 0, tgtLos: false, nadeT: 0, underFireT: -99, threatX: 0, threatZ: 0,
          kills: 0, shots: 0, hitsTaken: 0, wounds: 0, sndT: -99, areaT: 0, areaLos: false, biasX: 0, biasY: 0,
          pzf: m.pzf ?? 0, huntTank: -1, spot: null, spotDir: 0, aidTarget: -1, aidT: 0, treated: false, homeX: 0, homeZ: 0,
          veh: def.vehicle ? { type: def.vehicle, turret: def.face, buttoned: !VEHICLES[def.vehicle].hatch, hatchOrder: VEHICLES[def.vehicle].hatch, immob: false, ko: false, cmdHit: false, mgAmmo: WEAPONS[VEHICLES[def.vehicle].mg].ammo - WEAPONS[VEHICLES[def.vehicle].mg].mag, mgMag: WEAPONS[VEHICLES[def.vehicle].mg].mag, mgNext: 0, mgBurst: 0, mgReload: 0, mgTgt: -1, engineT: 0, shells: 0, corrTgt: -1, corr: 1, gunDmg: false, crewHits: 0, gunPos: -1 } : null,
        };
        if (s.veh) { s.posture = P_STAND; s.ammo = w.ammo; s.mag = 0; s.x = def.x; s.z = def.z; s.tx = s.x; s.tz = s.z; }
        if (def.foxholes) {
          this.T.foxholes.push({ x, z, y0: this.T.h(x, z) });
          this.foxOcc.push(s.id);
          s.foxhole = this.T.foxholes.length - 1;
        }
        this.soldiers.push(s);
        sq.members.push(s.id);
      });
      sq.leader = sq.members[0];
    });
    for (const sq of this.squads) if (sq.gun) this.guns.push(sq);
    // reservi ja johto aloittavat taloista
    this.defs.forEach((def: SquadDef, si: number) => {
      if (!def.occupy) return;
      const bi = this.nearestBuilding(def.x, def.z, 40);
      if (bi < 0) return;
      const sq = this.squads[si];
      const B = this.T.buildings[bi];
      sq.gx = (B.x0 + B.x1) / 2; sq.gz = (B.z0 + B.z1) / 2;
      this.occupyBuilding(sq, bi, def.face);
      for (const id of sq.members) { const s = this.soldiers[id]; s.x = s.tx; s.z = s.tz; s.heading = s.spot ? s.spotDir : def.face; }
    });
    const N = this.soldiers.length;
    for (let i = 0; i < this.squads.length; i++) this.seenBySquad.push(new Float32Array(N).fill(-1e9));
    for (let s = 0; s < 2; s++) {
      this.sideSeen.push(new Float32Array(N).fill(-1e9));
      this.sideFirst.push(new Float32Array(N).fill(1e9));
      this.lastPos.push(new Float32Array(N * 2));
    }
    this.frames = new Float32Array((TICKS + 1) * N * FSTRIDE);
    this.recordFrame(0);
    this.frameCount = 1;
  }

  // ---------------- apufunktiot ----------------
  alive(s: Soldier) { return s.state < ST_INCAP && !s.out; }
  inFox(s: Soldier) { return s.foxhole >= 0 && !s.moving && Math.hypot(s.x - this.T.foxholes[s.foxhole].x, s.z - this.T.foxholes[s.foxhole].z) < 0.5; }
  groundY(s: Soldier) { return this.T.h(s.x, s.z) - (this.inFox(s) ? FOX_DEPTH : 0); }
  eyeH(posture: number) { return posture === P_STAND ? 1.62 : posture === P_CROUCH ? 1.05 : 0.32; }
  eyeY(s: Soldier, posture = s.posture) {
    if (s.veh) return this.T.h(s.x, s.z) + (s.veh.buttoned ? 2.25 : 2.75);
    return this.groundY(s) + this.eyeH(posture);
  }
  spotY(s: Soldier) {
    if (s.veh) return this.T.h(s.x, s.z) + 1.8;
    return this.groundY(s) + (s.posture === P_STAND ? 1.5 : s.posture === P_CROUCH ? 0.95 : 0.26);
  }
  aimY(s: Soldier) {
    if (s.veh) return this.T.h(s.x, s.z) + (s.veh.buttoned ? 1.3 : 2.7);
    if (this.inFox(s)) return this.groundY(s) + (s.posture === P_PRONE ? 0.25 : 0.9);
    return this.groundY(s) + (s.posture === P_STAND ? 1.1 : s.posture === P_CROUCH ? 0.65 : 0.2);
  }
  squadAlive(sq: Squad) { return sq.members.filter((i) => this.alive(this.soldiers[i])); }
  squadCenter(sq: Squad) {
    const m = this.squadAlive(sq);
    if (!m.length) return { x: sq.gx, z: sq.gz };
    let x = 0, z = 0;
    for (const i of m) { x += this.soldiers[i].x; z += this.soldiers[i].z; }
    return { x: x / m.length, z: z / m.length };
  }
  squadKnows(sq: Squad, eid: number) {
    if (this.seenBySquad[sq.id][eid] > this.time - 4) return true;
    return this.sideSeen[sq.side][eid] > this.time - 20 && this.sideFirst[sq.side][eid] < this.time - (sq.c2 ? 8 : 30);
  }
  sideSees(side: number, eid: number) { return this.sideSeen[side][eid] > this.time - 1.7; }
  msg(side: number, text: string, kind = 0) {
    const m = { t: this.time - this.turnStart, side, text, kind };
    this.msgs.push(m);
    this.allMsgs.push({ ...m, t: this.time });
  }
  addSupp(s: Soldier, amount: number) {
    if (!this.alive(s)) return;
    const f = (this.inFox(s) ? 0.55 : 1) * (0.7 + 0.3 * s.exp / 0.85) * (s.posture === P_PRONE ? 0.8 : 1);
    s.supp = Math.min(100, s.supp + amount * f);
    s.suppT = this.time;
  }

  // ---------------- käskyt ----------------
  setOrders(sq: Squad, wps: Waypoint[], player = false) {
    if (player) sq.newOrders = true;
    sq.orders = wps.slice();
    sq.retreating = false;
    this.buildPath(sq);
  }
  buildPath(sq: Squad) {
    sq.path = [];
    if (!sq.orders.length) { sq.moving = false; return; }
    const c = sq.moving ? { x: sq.gx, z: sq.gz } : this.squadCenter(sq);
    sq.gx = c.x; sq.gz = c.z;
    let ax = c.x, az = c.z;
    for (const wp of sq.orders) {
      const pts = findPath(this.T, ax, az, wp.x, wp.z, sq.veh);
      pts.forEach((p, i) => sq.path.push({ x: p.x, z: p.z, mode: wp.mode, wp: i === pts.length - 1 }));
      ax = wp.x; az = wp.z;
    }
    sq.moving = true;
    sq.arrived = false;
    // muodostelma: elossa olevat jäsenet riviin
    const m = this.squadAlive(sq);
    const n = m.length;
    m.forEach((id, k) => {
      const s = this.soldiers[id];
      s.slotLat = (k - (n - 1) / 2) * 3.4;
      s.slotBack = (k % 2) * 1.5 + (id === sq.leader ? -0.5 : 0);
      if (s.foxhole >= 0) { this.foxOcc[s.foxhole] = -1; s.foxhole = -1; }
      this.releaseSpot(s);
    });
  }
  releaseSpot(s: Soldier) { if (s.spot && this.spotOcc.get(s.spot) === s.id) this.spotOcc.delete(s.spot); s.spot = null; }
  nearestBuilding(x: number, z: number, maxD: number) {
    let best = -1, bd = maxD;
    this.T.buildings.forEach((B, i) => {
      const d = Math.hypot(Math.max(B.x0 - x, 0, x - B.x1), Math.max(B.z0 - z, 0, z - B.z1));
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  // Ryhmä asettuu taloon: ikkunat uhan suuntaan ensin, loput sisätiloihin.
  occupyBuilding(sq: Squad, bi: number, tdir: number) {
    const B = this.T.buildings[bi];
    const m = this.squadAlive(sq);
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    const free = B.spots.map((sp, k) => ({ sp, key: bi + ':' + k })).filter((o) => {
      const occ = this.spotOcc.get(o.key);
      return occ === undefined || this.soldiers[occ].squad === sq.id || !this.alive(this.soldiers[occ]);
    });
    free.sort((a, b) => Math.cos(b.sp.dir - tdir) - Math.cos(a.sp.dir - tdir));
    let j = 0;
    m.forEach((id, k) => {
      const s = this.soldiers[id];
      this.releaseSpot(s);
      if (s.foxhole >= 0) { this.foxOcc[s.foxhole] = -1; s.foxhole = -1; }
      if (k < free.length && Math.cos(free[k].sp.dir - tdir) > -0.2) {
        s.spot = free[k].key; s.spotDir = free[k].sp.dir;
        this.spotOcc.set(free[k].key, s.id);
        s.tx = free[k].sp.x; s.tz = free[k].sp.z;
      } else {
        s.tx = cx + ((j % 3) - 1) * 1.4; s.tz = cz + ((Math.floor(j / 3) % 3) - 1) * 1.4;
        j++;
      }
    });
  }
  clearOrders(sq: Squad) { sq.orders = []; sq.path = []; if (sq.moving) { sq.moving = false; this.arrive(sq); } }

  vspec(s: Soldier): VehSpec { return VEHICLES[s.veh!.type]; }
  // maastokerroin: leveä tela (soft > 1) kärsii pehmeästä maasta vähemmän
  vehGround(spec: VehSpec, x: number, z: number) {
    const k = Math.max(0.5, VEH_GROUND[this.T.groundAt(x, z)] ?? 0.5);
    return k >= 1 ? k : 1 - (1 - k) / spec.soft;
  }
  // Onko oma sotilas tulilinjalla tai räjähteen vaara-alueella (splash m) maalin ympärillä?
  friendlyBlock(s: Soldier, tx: number, tz: number, splash: number, lineR = 1.6) {
    const d = Math.hypot(tx - s.x, tz - s.z);
    for (const f of this.soldiers) {
      if (f === s || f.side !== s.side || !this.alive(f) || f.veh) continue;
      if (splash > 0 && Math.hypot(f.x - tx, f.z - tz) < splash) return true;
      const fd = Math.hypot(f.x - s.x, f.z - s.z);
      if (fd > d - 2 || fd < 1) continue;
      if (distPointSeg2(f.x, f.z, s.x, s.z, tx, tz) < lineR + fd * 0.012) return true;
    }
    return false;
  }
  canGo(sq: Squad, x: number, z: number) { return sq.veh ? this.T.walkableVeh(x, z) : this.T.walkable(x, z); }

  // ---------------- vuoron ajo ----------------
  beginTurn() {
    this.turnStart = this.time;
    // käskyviive: yhteydessä johtoon käsky perille nopeasti, muuten lähetti tai huuto vie aikaa
    this.updateC2();
    for (const sq of this.squads) {
      if (!sq.newOrders) continue;
      sq.newOrders = false;
      const L = this.soldiers[sq.leader];
      let d = sq.veh || sq.hq ? this.rng.range(1, 3) : sq.c2 ? this.rng.range(2, 5) : this.rng.range(10, 18);
      if (!L || L.role !== sq.leadRole) d += 6; // varajohtaja johtaa
      sq.holdUntil = this.time + d * (sq.exp / 0.85);
    }
    this.shots = []; this.impacts = []; this.explosions = []; this.sfx = []; this.msgs = [];
    this.frameCount = 0;
    this.recordFrame(0);
    this.frameCount = 1;
  }
  tick() {
    const t = this.time;
    if (this.aiHook && Math.floor((t + DT) / 5) !== Math.floor(t / 5)) this.aiHook(this);
    this.updateSupport();
    for (const sq of this.squads) this.updateSquad(sq);
    for (const s of this.soldiers) this.updateSoldier(s);
    this.updateBullets();
    this.updateGrenades();
    if (Math.floor((t + DT)) !== Math.floor(t)) { for (const sq of this.squads) this.updateMorale(sq); this.decaySounds(); }
    this.time += DT;
    this.recordFrame(this.frameCount);
    this.frameCount++;
  }
  endTurn() {
    // lennossa olevat luodit päätetään
    for (let i = 0; i < 80 && this.bullets.length; i++) this.updateBullets();
    this.bullets = [];
    this.updateObjectives();
    this.turn++;
    const eff = [0, 1].map((side) => this.soldiers.filter((s) => s.side === side && this.alive(s) && this.squads[s.squad].mstate < 3).length);
    if (this.turn > SCENARIO.turns || eff[0] < 4 || eff[1] < 3) this.gameOver = true;
    // Jos toinen puoli romahtaa, sen hallitsemat tavoitteet, joilla ei ole enää taistelukykyisiä puolustajia, siirtyvät voittajalle.
    for (const [loser, winner] of [[1, 0], [0, 1]]) {
      if (eff[loser] >= (loser === 1 ? 3 : 4) || eff[winner] < (winner === 1 ? 3 : 4)) continue;
      for (const o of this.objectives) {
        const held = this.soldiers.some((s) => s.side === loser && this.alive(s) && this.squads[s.squad].mstate < 3 && Math.hypot(s.x - o.x, s.z - o.z) < o.r);
        if (!held && o.owner !== winner) o.owner = winner;
      }
    }
  }

  // ---------------- tallennus ----------------
  recordFrame(f: number) {
    const N = this.soldiers.length;
    const base = f * N * FSTRIDE;
    for (const s of this.soldiers) {
      const o = base + s.id * FSTRIDE;
      this.frames[o] = s.x;
      this.frames[o + 1] = this.T.h(s.x, s.z);
      this.frames[o + 2] = s.z;
      this.frames[o + 3] = s.heading;
      this.frames[o + 4] = s.posture + (this.inFox(s) ? 4 : 0);
      this.frames[o + 5] = s.state;
      let fl = 0;
      if (s.moving && s.speed > 0.2) fl |= 1;
      if (this.sideSees(0, s.id) || (s.state >= ST_INCAP && this.sideSeen[0][s.id] > -1e8)) fl |= 4;
      if (this.sideSees(1, s.id) || (s.state >= ST_INCAP && this.sideSeen[1][s.id] > -1e8)) fl |= 8;
      if (s.out) fl |= 16;
      if (s.veh) { if (s.veh.buttoned) fl |= 32; if (s.veh.immob) fl |= 64; if (s.veh.cmdHit) fl |= 128; }
      const gq = this.squads[s.squad].gun;
      if (gq) { if (gq.seen0) fl |= 256; if (gq.dead) fl |= 512; }
      this.frames[o + 6] = fl;
      this.frames[o + 7] = s.supp;
      this.frames[o + 8] = s.veh ? s.veh.turret : gq ? gq.aim : 0;
    }
  }

  // ---------------- ryhmän liike ----------------
  private updateSquad(sq: Squad) {
    const m = this.squadAlive(sq);
    if (!m.length) { sq.moving = false; return; }
    if (sq.leader < 0 || !this.alive(this.soldiers[sq.leader])) sq.leader = m[0];
    if (!sq.moving || !sq.path.length) return;
    if (this.time < sq.holdUntil && !sq.retreating) return; // käsky ei ole vielä perillä
    if (sq.mstate === 2 && !sq.retreating) return; // painunut maahan
    const p = sq.path[0];
    let mode = p.mode;
    let avgFat = 0;
    for (const id of m) avgFat += this.soldiers[id].fatigue;
    avgFat /= m.length;
    if (mode === 'fast' && avgFat > 70) mode = 'quick';
    if ((mode === 'quick' || mode === 'fast') && avgFat > 92) mode = 'move';
    // koheesio: odotetaan jälkeen jääneitä
    let lag = 0, pinnedCount = 0;
    const dir = Math.atan2(p.x - sq.gx, p.z - sq.gz);
    for (const id of m) {
      const s = this.soldiers[id];
      const slot = this.slotPos(sq, s, dir);
      lag = Math.max(lag, Math.hypot(slot.x - s.x, slot.z - s.z));
      if (s.supp > 72) pinnedCount++;
    }
    let speed: number;
    if (sq.veh) {
      const t = this.soldiers[m[0]];
      if (t.veh!.immob || lag > 7) return;
      const sp0 = this.vspec(t);
      speed = VEH_SPEED[p.mode] * sp0.speed * this.vehGround(sp0, sq.gx, sq.gz);
    } else {
      if (pinnedCount > m.length / 2 && !sq.retreating) return;
      if (lag > 10) return;
      speed = MODE_SPEED[mode] * GROUND_SPEED[this.T.groundAt(sq.gx, sq.gz)];
      if (m.some((id) => this.soldiers[id].state === ST_WOUNDED)) speed *= 0.8;
    }
    const d = Math.hypot(p.x - sq.gx, p.z - sq.gz);
    const slope = (this.T.h(sq.gx + Math.sin(dir), sq.gz + Math.cos(dir)) - this.T.h(sq.gx, sq.gz));
    speed *= clamp(1 - slope * 1.5, 0.6, 1.1);
    const step = speed * DT;
    if (d <= step) {
      sq.gx = p.x; sq.gz = p.z;
      sq.path.shift();
      if (p.wp && sq.orders.length) sq.orders.shift();
      if (!sq.path.length) this.arrive(sq);
    } else {
      sq.gx += ((p.x - sq.gx) / d) * step;
      sq.gz += ((p.z - sq.gz) / d) * step;
    }
  }
  slotPos(sq: Squad, s: Soldier, dir: number) {
    if (s.veh) return { x: sq.gx, z: sq.gz };
    const fx = Math.sin(dir), fz = Math.cos(dir), rx = Math.cos(dir), rz = -Math.sin(dir);
    let x = sq.gx + rx * s.slotLat - fx * s.slotBack;
    let z = sq.gz + rz * s.slotLat - fz * s.slotBack;
    if (!this.T.walkable(x, z)) {
      x = sq.gx + rx * s.slotLat * 0.3 - fx * (s.slotBack + Math.abs(s.slotLat) * 0.5);
      z = sq.gz + rz * s.slotLat * 0.3 - fz * (s.slotBack + Math.abs(s.slotLat) * 0.5);
      if (!this.T.walkable(x, z)) { x = sq.gx; z = sq.gz; }
    }
    return { x, z };
  }
  // Ryhmä saapui: sotilaat hakeutuvat suojaan omien paikkojensa lähelle.
  arrive(sq: Squad) {
    sq.moving = false;
    sq.arrived = true;
    const m = this.squadAlive(sq);
    const n = m.length;
    if (sq.veh) { for (const id of m) { this.soldiers[id].tx = sq.gx; this.soldiers[id].tz = sq.gz; } return; }
    const bi = this.T.insideBuilding(sq.gx, sq.gz, 2.5);
    if (bi >= 0) {
      const th = this.nearestThreat(sq);
      this.occupyBuilding(sq, bi, sq.face ?? (th ? Math.atan2(th.x - sq.gx, th.z - sq.gz) : sq.side === 0 ? Math.PI : 0));
      return;
    }
    let dir = sq.face;
    const threat = this.nearestThreat(sq);
    if (dir === null) dir = threat ? Math.atan2(threat.x - sq.gx, threat.z - sq.gz) : this.soldiers[m[0] ?? sq.leader]?.heading ?? 0;
    const tdir = threat ? Math.atan2(threat.x - sq.gx, threat.z - sq.gz) : dir;
    m.forEach((id, k) => {
      const s = this.soldiers[id];
      s.slotLat = (k - (n - 1) / 2) * 3.4;
      s.slotBack = (k % 2) * 1.0;
      const slot = this.slotPos(sq, s, dir!);
      const best = this.coverSpot(s, slot.x, slot.z, tdir);
      s.tx = best.x; s.tz = best.z;
    });
  }
  nearestThreat(sq: Squad): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (const e of this.soldiers) {
      if (e.side === sq.side || !this.alive(e) || this.sideSeen[sq.side][e.id] < this.time - 60) continue;
      const lx = this.lastPos[sq.side][e.id * 2], lz = this.lastPos[sq.side][e.id * 2 + 1];
      const d = Math.hypot(lx - sq.gx, lz - sq.gz);
      if (d < bd) { bd = d; best = { x: lx, z: lz }; }
    }
    return best;
  }
  // Etsitään lähistöltä paras suojapaikka uhan suuntaan.
  coverSpot(s: Soldier, sx: number, sz: number, tdir: number) {
    const T = this.T;
    let bx = sx, bz = sz, bs = -1e9;
    // vapaa ampumakuoppa lähellä?
    for (let i = 0; i < T.foxholes.length; i++) {
      const f = T.foxholes[i];
      if (Math.hypot(f.x - sx, f.z - sz) < 4.5 && (this.foxOcc[i] === -1 || this.foxOcc[i] === s.id || !this.alive(this.soldiers[this.foxOcc[i]]))) {
        if (s.foxhole >= 0 && this.foxOcc[s.foxhole] === s.id) this.foxOcc[s.foxhole] = -1;
        this.foxOcc[i] = s.id; s.foxhole = i;
        return { x: f.x, z: f.z };
      }
    }
    const fx = Math.sin(tdir), fz = Math.cos(tdir);
    for (let k = 0; k < 14; k++) {
      const a = k === 0 ? 0 : (k / 13) * Math.PI * 2;
      const r = k === 0 ? 0 : 1.5 + (k % 3) * 1.2;
      const x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r;
      if (!T.walkable(x, z)) continue;
      const h0 = T.h(x, z);
      let cover = -0.3;
      for (const dd of [1.2, 2.5, 4, 6]) cover = Math.max(cover, T.h(x + fx * dd, z + fz * dd) - h0);
      let sc = clamp(cover, -0.3, 0.6) * 4 - r * 0.35;
      // esteet edessä (puu, suova, talo, aita)
      const l = T.los(x, h0 + 0.5, z, x + fx * 5, h0 + 0.5, z + fz * 5);
      if (l < 0) sc += 1.4; else sc += l * 1.2;
      const g = T.groundAt(x, z);
      if (g === 1 || g === 2) sc += 0.4;
      if (sc > bs) { bs = sc; bx = x; bz = z; }
    }
    return { x: bx, z: bz };
  }

  // ---------------- sotilas ----------------
  private updateSoldier(s: Soldier) {
    if (s.out) return;
    if (s.state >= ST_INCAP) { s.moving = false; return; }
    const sq = this.squads[s.squad];
    if (s.veh) { this.updateTank(s, sq); return; }
    // tukahdutus vaimenee
    if (this.time - s.suppT > 2.5) s.supp = Math.max(0, s.supp - DT * (s.supp > 50 ? 2.2 : 3.2) * (0.85 / s.exp));
    if (s.reloadT > 0) {
      s.reloadT -= DT;
      if (s.reloadT <= 0) { const take = Math.min(s.w.mag, s.ammo); s.mag = take; s.ammo -= take; }
    }
    // liike
    let goal = { x: s.tx, z: s.tz };
    let mode: Mode = 'move';
    if (sq.moving && sq.path.length) {
      const p = sq.path[0];
      mode = p.mode;
      goal = this.slotPos(sq, s, Math.atan2(p.x - sq.gx, p.z - sq.gz));
      s.tx = goal.x; s.tz = goal.z;
    }
    // ensiapu
    if (s.aidTarget >= 0) {
      const g = this.doAid(s, sq);
      if (g) { goal = g; s.tx = g.x; s.tz = g.z; }
    }
    // panssarintorjuja hiipii vaunun lähelle heittoetäisyydelle
    if (s.huntTank >= 0) {
      const tk = this.soldiers[s.huntTank];
      if (!this.alive(tk) || (s.grenades <= 0 && s.pzf <= 0) || sq.mstate >= 3) s.huntTank = -1;
      else {
        if (s.foxhole >= 0) { this.foxOcc[s.foxhole] = -1; s.foxhole = -1; }
        const d = Math.hypot(tk.x - s.x, tk.z - s.z);
        // kierretään tornin katveeseen: kylkeen tai taakse, poispäin tornin suunnasta
        const away = tk.veh!.turret + Math.PI;
        const side = angDiff(Math.atan2(s.x - tk.x, s.z - tk.z), away) > 0 ? 1 : -1;
        const a = away + side * 0.9;
        const ax = tk.x + Math.sin(a) * 12, az = tk.z + Math.cos(a) * 12;
        const R = s.pzf > 0 ? 22 : 12;
        goal = d > R + 2 ? (d > 40 ? { x: ax, z: az } : { x: tk.x + ((s.x - tk.x) / d) * R, z: tk.z + ((s.z - tk.z) / d) * R }) : { x: s.x, z: s.z };
        s.tx = goal.x; s.tz = goal.z;
      }
    }
    const pinned = s.huntTank >= 0 ? s.supp > 88 : (s.supp > 72 || sq.mstate === 2 || (sq.moving && mode !== 'fast' && s.supp > 30)) && !sq.retreating;
    const dx = goal.x - s.x, dz = goal.z - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.25 && !pinned) {
      let sp = (sq.moving ? MODE_SPEED[mode] * 1.2 : 2.2) * GROUND_SPEED[this.T.groundAt(s.x, s.z)];
      if (s.state === ST_WOUNDED) sp *= 0.75;
      if (s.fatigue > 92 && sp > 1.6) sp = 1.6;
      else if (s.fatigue > 70 && sp > 3.2) sp = 3.2;
      if (sq.retreating) sp = Math.max(sp, 3);
      if (this.T.nearWall(s.x, s.z)) sp = Math.min(sp, 0.7); // ikkunasta tai ovesta
      if (s.huntTank >= 0) { const tk = this.soldiers[s.huntTank]; sp = Math.hypot(tk.x - s.x, tk.z - s.z) > 42 ? 2.4 : 0.6; }
      if (s.posture === P_PRONE && !(sq.moving && mode === 'slow') && s.huntTank < 0) sp = Math.min(sp, 0.5); // nouseminen
      const step = Math.min(dist, sp * DT);
      let nx = s.x + (dx / dist) * step, nz = s.z + (dz / dist) * step;
      if (!this.T.walkable(nx, nz)) {
        if (this.T.walkable(nx, s.z)) nz = s.z; else if (this.T.walkable(s.x, nz)) nx = s.x; else { nx = s.x; nz = s.z; }
      }
      s.speed = Math.hypot(nx - s.x, nz - s.z) / DT;
      s.x = nx; s.z = nz;
      s.moving = s.speed > 0.05;
      if (s.moving) s.heading = turnTo(s.heading, Math.atan2(dx, dz), 6 * DT);
      const fatigueRate = sp > 4 ? 0.9 : sp > 2.5 ? 0.25 : -0.35;
      s.fatigue = clamp(s.fatigue + fatigueRate * DT, 0, 100);
    } else {
      s.moving = false; s.speed = 0;
      s.fatigue = Math.max(0, s.fatigue - 0.6 * DT);
    }
    if (s.moving) s.setupT = 0; else s.setupT += DT;

    // havainnointi
    if (this.time >= s.visT) { s.visT = this.time + 1.4 + this.rng.next() * 0.2; this.observe(s); }
    // asento
    if (this.time >= s.postureT || (s.supp > 55 && s.posture !== P_PRONE)) { s.postureT = this.time + 1.6 + this.rng.next(); this.choosePosture(s, mode); }
    // tuli
    if (sq.gun && !sq.gun.dead && s.id === this.gunner(sq)) this.gunFire(s, sq);
    else if (s.w.kind === 'mortar') this.mortarFire(s, sq);
    else this.fireLogic(s, sq, mode);
    // katse
    if (!s.moving) {
      let fd: number | null = null;
      if (s.tgt >= 0) fd = Math.atan2(this.soldiers[s.tgt].x - s.x, this.soldiers[s.tgt].z - s.z);
      else if (sq.target && sq.target.kind === 'area') fd = Math.atan2(sq.target.x - s.x, sq.target.z - s.z);
      else if (this.time - s.underFireT < 10) fd = Math.atan2(s.threatX - s.x, s.threatZ - s.z);
      else if (s.spot) fd = s.spotDir;
      else if (sq.face !== null) fd = sq.face;
      if (fd !== null) s.heading = turnTo(s.heading, fd, 3 * DT);
    }
  }

  private choosePosture(s: Soldier, mode: Mode) {
    const sq = this.squads[s.squad];
    if (s.moving) {
      if (s.huntTank >= 0) { const tk = this.soldiers[s.huntTank]; s.posture = Math.hypot(tk.x - s.x, tk.z - s.z) > 42 ? P_CROUCH : P_PRONE; return; }
      s.posture = mode === 'slow' ? P_PRONE : mode === 'hunt' ? P_CROUCH : P_STAND;
      if (sq.retreating) s.posture = P_STAND;
      return;
    }
    // piiloutuneen puolustajaryhmän johtaja jää tähystämään
    if (sq.hide && sq.side === 1 && s.id === sq.leader && this.inFox(s) && s.supp < 55) { s.posture = P_CROUCH; return; }
    if (s.supp > 55 || sq.hide || sq.mstate >= 3) { s.posture = P_PRONE; return; }
    // tähtäyspiste
    let tx = 0, ty = 0, tz = 0, has = false;
    if (s.tgt >= 0) { const e = this.soldiers[s.tgt]; tx = e.x; ty = this.aimY(e); tz = e.z; has = true; }
    else if (sq.target && sq.target.kind === 'area') { tx = sq.target.x; tz = sq.target.z; ty = this.T.h(tx, tz) + 0.5; has = true; }
    const hmgCrouch = s.w.kind === 'hmg';
    if (has) {
      const order = s.w.kind === 'lmg' ? [P_PRONE, P_CROUCH, P_STAND] : hmgCrouch ? [P_CROUCH, P_STAND] : [P_PRONE, P_CROUCH, P_STAND];
      for (const p of order) {
        if (p === P_STAND && (s.supp > 30 || this.inFox(s))) continue;
        if (this.T.los(s.x, this.eyeY(s, p), s.z, tx, ty, tz) >= 0) { s.posture = p; return; }
      }
      s.posture = this.inFox(s) ? P_CROUCH : P_CROUCH;
      return;
    }
    const enemiesNear = s.vis.length > 0 || this.time - s.underFireT < 20;
    s.posture = enemiesNear && s.supp > 12 && !this.inFox(s) ? P_PRONE : P_CROUCH;
  }

  // ---------------- havainnointi ----------------
  private observe(s: Soldier) {
    const T = this.T;
    const ey = this.eyeY(s);
    const prevVis = s.vis;
    const vis: number[] = [];
    let newContact = false;
    let obsF = (1 - s.supp / 130) * (s.posture === P_PRONE ? 0.75 : 1) * (0.85 / s.exp) * (s.state === ST_WOUNDED ? 0.7 : 1);
    if (s.veh) obsF = (s.veh.buttoned ? 0.4 : 1.1) * (s.moving ? 0.7 : 1) * (s.veh.cmdHit ? 0.8 : 1);
    for (const e of this.soldiers) {
      if (e.side === s.side || e.out || e.state === ST_DEAD) continue;
      const d = Math.hypot(e.x - s.x, e.z - s.z);
      if (d > 900) continue;
      const known = prevVis.indexOf(e.id) >= 0;
      if (!known && e.state >= ST_INCAP) continue;
      const conc = T.los(s.x, ey, s.z, e.x, this.spotY(e), e.z);
      if (conc < 0) continue;
      let size = e.posture === P_STAND ? 1 : e.posture === P_CROUCH ? 0.55 : 0.28;
      if (this.inFox(e)) size *= 0.38;
      if (e.veh) size = 3.2;
      else if (this.T.insideBuilding(e.x, e.z) >= 0) size *= 0.55;
      const mv = e.moving ? (e.speed > 2.5 ? 2.2 : e.speed > 0.8 ? 1.5 : 1.1) : 1;
      const fire = this.time - e.fired < 3 ? (this.squads[e.squad].gun && this.squads[e.squad].gun!.next > this.time - 4 ? 8 : e.w.kind === 'lmg' || e.w.kind === 'hmg' || e.w.kind === 'gun' ? 6 : 3.5) : 1;
      const df = 1 / (1 + (d / 115) ** 2);
      let p = 0.85 * size * mv * fire * df * (1 - conc) * obsF;
      if (d < 25) p = Math.max(p, 0.5 * (1 - conc));
      if (known) p = Math.max(p * 3, 0.65 * (1 - conc));
      if (this.rng.next() < clamp(p, 0, 0.96)) {
        vis.push(e.id);
        if (this.seenBySquad[s.squad][e.id] < this.time - 30 && e.state < ST_INCAP) newContact = true;
        const side = s.side;
        if (this.sideFirst[side][e.id] > this.time || this.sideSeen[side][e.id] < this.time - 30) {
          this.sideFirst[side][e.id] = this.time;
          if (side === 0 && this.sideSeen[side][e.id] < -1e8 && this.squads[e.squad].members[0] === e.id) {
            this.msg(0, `${this.squads[s.squad].short}: vihollinen havaittu (${Math.round(d)} m)`, 1);
          }
        }
        this.sideSeen[side][e.id] = this.time;
        this.seenBySquad[s.squad][e.id] = this.time;
        const eg = this.squads[e.squad].gun;
        if (eg && side === 0 && !eg.seen0) { eg.seen0 = true; this.msg(0, `${this.squads[s.squad].short}: panssarintorjuntatykki havaittu! (${Math.round(d)} m)`, 3); }
        this.lastPos[side][e.id * 2] = e.x;
        this.lastPos[side][e.id * 2 + 1] = e.z;
      }
    }
    s.vis = vis;
    // Etsi-tilassa ryhmä pysähtyy uuden kontaktin nähdessään
    const sq = this.squads[s.squad];
    if (newContact && sq.moving && sq.path.length && sq.path[0].mode === 'hunt') {
      sq.orders = []; sq.path = []; this.arrive(sq);
      if (sq.side === 0) this.msg(0, `${sq.short}: kontakti, pysähdytään`, 1);
    }
  }

  // ---------------- tuli ----------------
  private engageRange(s: Soldier) {
    if (s.w.range) return s.w.range;
    switch (s.w.kind) {
      case 'rifle': return 520; case 'semi': return 420; case 'smg': return 150;
      case 'lmg': return 800; case 'hmg': return 1100; default: return 40;
    }
  }
  private pickTarget(s: Soldier, sq: Squad) {
    if (sq.target && sq.target.kind === 'unit') {
      const e = this.soldiers[sq.target.id];
      if (e && this.alive(e) && this.squadKnows(sq, e.id)) {
        const ok = this.T.los(s.x, this.eyeY(s, s.posture === P_PRONE ? P_CROUCH : s.posture), s.z, e.x, this.aimY(e), e.z) >= 0;
        if (ok) { s.tgt = e.id; s.tgtLos = true; return; }
      } else if (e && !this.alive(e)) sq.target = null;
    }
    const range = this.engageRange(s);
    const cands: { id: number; d: number }[] = [];
    for (const e of this.soldiers) {
      if (e.side === s.side || !this.alive(e)) continue;
      if (!this.squadKnows(sq, e.id) && s.vis.indexOf(e.id) < 0) continue;
      const d = Math.hypot(e.x - s.x, e.z - s.z);
      if (d > range) continue;
      // panssariin ei ammuta turhaan, mutta avoimesta luukusta näkyvä johtaja on maali
      if (e.veh && (e.veh.buttoned || d > 200 || s.w.kind === 'hmg')) continue;
      // tulikuri: pieniä maaleja ei ammuta kaukaa, ja vähillä ammuksilla säästellään
      const small = e.posture === P_PRONE || this.inFox(e);
      const rifle = s.w.kind === 'rifle' || s.w.kind === 'semi';
      if (rifle && small && d > 320 && this.time - e.fired > 4) continue;
      if ((s.ammo + s.mag) / s.w.ammo < 0.3 && d > 200) continue;
      cands.push({ id: e.id, d });
    }
    cands.sort((a, b) => a.d - b.d);
    let best = -1, bs = -1e9;
    const eyeP = s.moving ? s.posture : s.posture === P_PRONE ? P_CROUCH : s.posture;
    for (let i = 0; i < Math.min(5, cands.length); i++) {
      const e = this.soldiers[cands[i].id];
      const seen = s.vis.indexOf(e.id) >= 0;
      if (!seen && this.T.los(s.x, this.eyeY(s, eyeP), s.z, e.x, this.aimY(e), e.z) < 0) continue;
      let sc = -cands[i].d;
      if (e.veh) sc -= 120;
      if (this.time - e.fired < 4) sc += 60 * (e.w.kind === 'lmg' || e.w.kind === 'hmg' ? 2 : 1);
      if (e.moving) sc += 30;
      if (s.tgt === e.id) sc += 40;
      if (sc > bs) { bs = sc; best = e.id; }
    }
    if (best !== s.tgt && best >= 0) s.nextShot = Math.max(s.nextShot, this.time + (s.w.kind === 'rifle' ? 1.2 : 0.5) * s.exp);
    s.tgt = best; s.tgtLos = best >= 0;
  }

  private fireLogic(s: Soldier, sq: Squad, mode: Mode) {
    if (this.time >= s.tgtT) {
      s.tgtT = this.time + 0.9 + this.rng.next() * 0.4;
      if (s.tgt >= 0 && !this.alive(this.soldiers[s.tgt])) s.tgt = -1;
      this.pickTarget(s, sq);
    }
    // kranaatti
    if ((s.grenades > 0 || s.pzf > 0) && this.time > s.nadeT && (!s.moving || s.huntTank >= 0) && s.supp < 70) {
      s.nadeT = this.time + 1;
      this.considerGrenade(s, sq);
    }
    if (s.aidTarget >= 0) return;
    if (s.reloadT > 0 || this.time < s.nextShot) return;
    if (s.mag <= 0) {
      if (s.ammo > 0) s.reloadT = s.w.reload * (s.state === ST_WOUNDED ? 1.5 : 1);
      return;
    }
    if ((s.w.kind === 'lmg' || s.w.kind === 'hmg') && s.setupT < s.w.setup) return;

    let tx: number, ty: number, tz: number, d: number;
    let area = false;
    if (s.tgt >= 0) {
      const e = this.soldiers[s.tgt];
      tx = e.x; tz = e.z; ty = this.aimY(e);
      d = Math.hypot(tx - s.x, tz - s.z);
    } else if (sq.target && sq.target.kind === 'area' && this.time < sq.targetUntil) {
      area = true;
      tx = sq.target.x + this.rng.gauss() * 3; tz = sq.target.z + this.rng.gauss() * 3;
      ty = this.T.h(tx, tz) + 0.4;
      d = Math.hypot(tx - s.x, tz - s.z);
      if (d > this.engageRange(s) * 1.3 || s.w.kind === 'pistol') return;
      if (this.time > s.areaT) {
        s.areaT = this.time + 2;
        s.areaLos = this.T.los(s.x, this.eyeY(s), s.z, sq.target.x, this.T.h(sq.target.x, sq.target.z) + 0.7, sq.target.z) >= 0;
      }
      if (!s.areaLos) { s.nextShot = this.time + 1; return; }
    } else return;

    // tulenkäyttöluvat
    if (sq.mstate >= 3 && d > 35) return;
    if (sq.hide && d > 40) return;
    if (!sq.freeFire) { if (d > sq.hold) return; sq.freeFire = true; }
    if (s.moving) {
      if (mode === 'fast' || mode === 'slow') return;
      if (mode === 'quick' && !(s.w.kind === 'smg' || s.w.kind === 'pistol') ) return;
      if (s.w.kind === 'hmg') return;
    }
    if (s.supp > 75 && d > 25) return;
    if (s.w.kind === 'rifle' && s.ammo + s.mag < 15 && d > 150) return;
    if (area && s.ammo + s.mag < s.w.mag * 3) return;

    // ei ammuta omien läpi
    for (const f of this.soldiers) {
      if (f === s || f.side !== s.side || !this.alive(f)) continue;
      const fd = Math.hypot(f.x - s.x, f.z - s.z);
      if (fd > d - 3 || fd < 0.5) continue;
      if (distPointSeg2(f.x, f.z, s.x, s.z, tx, tz) < 1.3 + fd * 0.01) { s.nextShot = this.time + 0.8; s.postureT = Math.min(s.postureT, this.time + 0.3); return; }
    }
    this.fireShot(s, tx, ty, tz, d, area);
    // tahti
    if (s.burst <= 0) s.burst = this.rng.int(s.w.burst[0], s.w.burst[1]) - 1; else s.burst--;
    let next: number;
    if (s.burst > 0) next = 60 / s.w.rpm;
    else {
      const rangeF = clamp(d / 300, 0, 1);
      switch (s.w.kind) {
        case 'rifle': case 'semi': next = s.w.aim * (0.45 + 0.55 * rangeF); break;
        case 'smg': next = this.rng.range(1.0, 2.4); break;
        case 'lmg': next = this.rng.range(1.4, 3.2); break;
        case 'hmg': next = this.rng.range(0.9, 2.2); break;
        default: next = 1.2;
      }
      next *= this.rng.range(0.8, 1.25) * s.exp / 0.85;
      if (s.supp > 45) next *= 2;
      if (s.moving) next *= 1.8;
      if (area) next *= 1.6;
    }
    s.nextShot = this.time + next;
    if (s.mag <= 0) s.burst = 0;
  }

  private fireShot(s: Soldier, tx: number, ty: number, tz: number, d: number, area: boolean) {
    const w = s.w;
    if (!area) {
      // Taistelun stressi: ampuja ei tiedä tarkalleen missä kohde on. Virhe on sama koko sarjan ajan.
      if (s.burst <= 0) {
        const tg = s.tgt >= 0 ? this.soldiers[s.tgt] : null;
        let bs = (0.45 + d * 0.006) * s.exp / 0.85 * (1 + s.supp / 60);
        if (tg && tg.moving) bs *= 1.3;
        if (tg && (tg.posture === P_PRONE || this.inFox(tg))) bs *= 0.8;
        if (s.w.kind === 'hmg') bs *= 0.75;
        s.biasX = this.rng.gauss() * bs;
        s.biasY = this.rng.gauss() * bs * 0.45;
      }
      const ang = Math.atan2(tx - s.x, tz - s.z);
      tx += Math.cos(ang) * s.biasX;
      tz -= Math.sin(ang) * s.biasX;
      ty += s.biasY;
    }
    const ex = s.x + Math.sin(s.heading) * 0.4, ez = s.z + Math.cos(s.heading) * 0.4;
    const ey = this.eyeY(s) - 0.05;
    const dx = tx - ex, dy = ty - ey, dz = tz - ez;
    const horiz = Math.hypot(dx, dz);
    // etäisyyden arviointivirhe ja kaaren kompensointi
    const est = horiz * (1 + this.rng.gauss() * 0.12 * s.exp);
    const tof = (Math.exp(w.drag * est) - 1) / (w.drag * w.v0);
    const drop = 0.5 * G * tof * tof;
    let yaw = Math.atan2(dx, dz);
    let pitch = Math.atan2(dy + drop, horiz);
    // hajonta
    let sig = (w.mrad / 1000) * (s.posture === P_PRONE ? 0.65 : s.posture === P_CROUCH ? 0.85 : 1.25) * s.exp / 0.85;
    sig *= 1 + s.supp / 30;
    if (s.moving) sig *= 2.6;
    if (s.state === ST_WOUNDED) sig *= 1.4;
    if (s.fatigue > 60) sig *= 1 + (s.fatigue - 60) / 80;
    if (w.burst[1] > 1) sig *= 1 + Math.max(0, (w.burst[1] - s.burst)) * 0.08; // rekyyli sarjassa
    if (s.tgt >= 0 && this.soldiers[s.tgt].moving) sig += 0.004;
    if (w.kind === 'hmg') sig *= 0.8;
    yaw += this.rng.gauss() * sig;
    pitch += this.rng.gauss() * sig;
    const v0 = w.v0 * (1 + this.rng.gauss() * 0.01);
    const cp = Math.cos(pitch);
    s.mag--;
    s.shots++;
    s.fired = this.time;
    const sq = this.squads[s.squad];
    sq.lastFireT = this.time;
    sq.freeFire = true;
    const tracer = w.tracer > 0 && s.shots % w.tracer === 0;
    this.bullets.push({
      x: ex, y: ey, z: ez, vx: Math.sin(yaw) * cp * v0, vy: Math.sin(pitch) * v0, vz: Math.cos(yaw) * cp * v0,
      sx: ex, sy: ey, sz: ez, t0: this.time, age: 0,
      shooter: s.id, side: s.side, squad: s.squad, mass: w.mass, drag: w.drag, frag: false, tracer,
      ignore: -1, nm: [], alive: true, he: false, ap: false, wid: w.id,
    });
    // ääni paljastaa ampujan suunnan
    if (this.time - s.sndT > 3) {
      s.sndT = this.time;
      const other = 1 - s.side;
      if (!this.sideSees(other, s.id)) {
        const err = 6 + d * 0.06;
        const cx = s.x + this.rng.gauss() * err, cz = s.z + this.rng.gauss() * err;
        const list = this.sounds[other];
        const ex2 = list.find((c) => Math.hypot(c.x - cx, c.z - cz) < 25);
        const kind = s.veh ? 'Panssarivaunu' : w.kind === 'lmg' || w.kind === 'hmg' ? 'Konekivääri' : w.kind === 'smg' ? 'Konepistooli' : 'Kivääri';
        if (ex2) { ex2.x = (ex2.x + cx) / 2; ex2.z = (ex2.z + cz) / 2; ex2.t = this.time; if (kind === 'Konekivääri') ex2.kind = kind; }
        else list.push({ x: cx, z: cz, t: this.time, kind });
      }
    }
  }

  private considerGrenade(s: Soldier, sq: Squad) {
    let best: Soldier | null = null, bd = 1e9;
    for (const e of this.soldiers) {
      if (e.side === s.side || !this.alive(e) || !this.squadKnows(sq, e.id)) continue;
      const d = Math.hypot(e.x - s.x, e.z - s.z);
      if (e.veh) {
        // lähitorjunta: kasapanos tai pullo vaunun kylkeen
        if (s.pzf > 0 && d > 6 && d < 32 && s.supp < 65 && this.rng.chance(s.huntTank >= 0 ? 0.55 : 0.3)) {
          // Panzerfaust: johto ennakoi liikkeen, stressi heikentää tähtäystä
          const tof = d / WEAPONS.pzf.v0;
          const lead = e.moving ? e.speed * tof * this.rng.range(0.6, 1.3) : 0;
          const err = (0.3 + d * 0.025) * (1 + s.supp / 50) * s.exp / 0.85;
          const tx = e.x + Math.sin(e.heading) * lead + this.rng.gauss() * err, tz = e.z + Math.cos(e.heading) * lead + this.rng.gauss() * err;
          s.pzf--;
          s.fired = this.time;
          s.nextShot = this.time + 3;
          s.posture = P_CROUCH;
          this.launchFrom(s, WEAPONS.pzf, s.x, this.eyeY(s, P_CROUCH) - 0.1, s.z, tx, this.T.h(tx, tz) + 1.1 + this.rng.gauss() * err * 0.3, tz, false, true);
          if (e.side === 0) this.msg(0, `${this.squads[e.squad].short}: Panzerfaust! (${Math.round(d)} m)`, 3);
          return;
        }
        if (s.side === 1 && nationOf(s.side) === 'sov' && s.grenades > 0 && d > 3 && d < 22 && s.supp < (s.huntTank >= 0 ? 70 : 50) && this.rng.chance(s.huntTank >= 0 ? 0.45 : e.veh.buttoned ? 0.22 : 0.14)) {
          s.grenades--;
          s.fired = this.time;
          s.nextShot = this.time + 3;
          const err = 0.8 + d * 0.05 * s.exp;
          this.grenades.push({ t: this.time + 1.0 + d / 14 + 1.5, x: e.x + this.rng.gauss() * err, z: e.z + this.rng.gauss() * err, side: s.side, thrower: s.id, bundle: true });
          this.msg(0, `${this.squads[e.squad].short}: vihollinen heittää kasapanoksen! (${Math.round(d)} m)`, 3);
          return;
        }
        continue;
      }
      if (d < 7 || d > 28) continue;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best || s.grenades <= 0) return;
    // ei omia lähellä kohdetta
    for (const f of this.soldiers) if (f.side === s.side && this.alive(f) && Math.hypot(f.x - best.x, f.z - best.z) < 9) return;
    const covered = this.inFox(best) || this.T.los(s.x, this.eyeY(s), s.z, best.x, this.aimY(best), best.z) < 0;
    if (!this.rng.chance(covered ? 0.3 : 0.1)) return;
    // heittolinja: talo ei saa olla välissä
    const tb = this.T.insideBuilding(best.x, best.z), sb = this.T.insideBuilding(s.x, s.z);
    if (tb >= 0 && bd > 20) return; // ikkunaan heitetään vain läheltä
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const ib = this.T.insideBuilding(s.x + (best.x - s.x) * t, s.z + (best.z - s.z) * t);
      if (ib >= 0 && ib !== tb && ib !== sb) return;
    }
    s.grenades--;
    s.fired = this.time;
    s.nextShot = this.time + 2.5;
    const err = 1.2 + bd * 0.07 * s.exp;
    const lx = best.x + this.rng.gauss() * err, lz = best.z + this.rng.gauss() * err;
    this.grenades.push({ t: this.time + 1.1 + bd / 16 + 1.8, x: lx, z: lz, side: s.side, thrower: s.id, bundle: false });
    if (s.side === 0) this.msg(0, `${s.rank} ${s.name} heittää käsikranaatin`, 0);
  }

  private updateGrenades() {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      if (this.time < g.t) continue;
      this.grenades.splice(i, 1);
      this.explodeAt(g.x, this.T.h(g.x, g.z) + 0.15, g.z, g.side, g.thrower, g.bundle ? 110 : 70, g.bundle ? 3.2 : 2.2, g.bundle);
    }
  }
  // Räjähdys: sirpaleet lentävät ballistisesti, paineaalto lähellä, tukahdutus laajalla alueella.
  explodeAt(x: number, y: number, z: number, side: Side, thrower: number, nFrag: number, blast: number, bundle: boolean, size = 1, suppR = 22) {
    this.explosions.push(this.time - this.turnStart, x, y, z, size);
    const thr = this.soldiers[thrower];
    for (let k = 0; k < nFrag; k++) {
      const a = this.rng.next() * Math.PI * 2;
      const el = Math.asin(this.rng.range(-0.15, 1));
      const v = this.rng.range(700, 1200);
      this.bullets.push({
        x, y, z, vx: Math.cos(a) * Math.cos(el) * v, vy: Math.sin(el) * v, vz: Math.sin(a) * Math.cos(el) * v,
        sx: x, sy: y, sz: z, t0: this.time, age: 0, shooter: thrower, side, squad: thr.squad,
        mass: 0.0006, drag: 0.035, frag: true, tracer: false, ignore: -1, nm: [], alive: true, he: false, ap: false,
      });
    }
    for (const gq of this.guns) {
      const g = gq.gun!;
      const d = Math.hypot(g.x - x, g.z - z);
      if (!g.dead && d < 1.4 * size && this.rng.chance(0.55)) { g.dead = true; if (g.seen0 || thr.side === 0) this.msg(0, 'Panssarintorjuntatykki tuhottu!', 1); }
    }
    for (const s of this.soldiers) {
      if (s.out || s.state === ST_DEAD) continue;
      const d = Math.hypot(s.x - x, s.z - z, (s.veh ? 0 : (this.T.h(s.x, s.z) - y) * 0.5));
      if (s.veh) {
        if (s.state < ST_INCAP) this.tankBlast(s, d, bundle, thr);
        if (s.state < ST_INCAP && size > 2 && d < 2.2 && this.rng.chance(0.35)) {
          // 10,5 cm suora osuma ohueen kattoon tai moottoritilaan
          if (this.rng.chance(0.4)) { s.veh!.ko = true; s.state = ST_DEAD; this.onCasualty(s, thr); } else if (!s.veh!.immob) { s.veh!.immob = true; this.msg(0, `${this.squads[s.squad].short}: kranaatti osui, vaunu liikuntakyvytön`, 3); }
        }
        continue;
      }
      const sameRoom = this.T.insideBuilding(s.x, s.z) === this.T.insideBuilding(x, z);
      if (d < blast && sameRoom && !(this.inFox(s) && d > blast * 0.45)) this.wound(s, d < blast * 0.55 ? 'torso' : 'legs', 900 * (1 - d / (blast * 1.15)), thr);
      if (d < suppR) { this.addSupp(s, 60 * (1 - d / suppR)); s.underFireT = this.time; s.threatX = x; s.threatZ = z; if (thr.veh) this.squads[s.squad].tankFireT = this.time; }
    }
  }
  private tankBlast(t: Soldier, d: number, bundle: boolean, by: Soldier) {
    const v = t.veh!;
    if (!v.buttoned && !v.cmdHit && d < 7 && this.rng.chance(0.55 * (1 - d / 7))) {
      v.cmdHit = true; v.buttoned = true;
      this.msg(0, `${this.squads[t.squad].short}: vaununjohtaja ${t.name} haavoittui sirpaleista`, 3);
    }
    if (d < 12) { t.supp = Math.min(100, t.supp + 30 * (1 - d / 12)); t.suppT = this.time; }
    if (!bundle) return;
    const r = this.rng.next();
    const ko = d < 1.6 ? 0.38 : d < 3.2 ? 0.1 : 0;
    const im = d < 1.6 ? 0.45 : d < 3.2 ? 0.4 : 0;
    if (r < ko) {
      v.ko = true; t.state = ST_DEAD;
      this.onCasualty(t, by);
    } else if (r < ko + im && !v.immob) {
      v.immob = true;
      this.msg(0, `${this.squads[t.squad].short}: tela poikki, vaunu liikuntakyvytön!`, 3);
    } else if (d < 3.2) this.msg(0, `${this.squads[t.squad].short}: kasapanos räjähti vierellä, ei vaurioita`, 2);
  }

  // ---------------- tukitoiminnot: savu, tykistö ----------------
  sfxPush(code: number, x: number, y: number, z: number) { this.sfx.push(this.time - this.turnStart, code, x, y, z); }
  addSmoke(x: number, z: number, rMax: number, dur: number) {
    this.smokes.push({ id: this.smokeId++, x0: x, z0: z, t0: this.time, rMax, grow: 9, dur, h: rMax * 0.7 + 2 });
  }
  // Tykistön tulipyyntö joukkueenjohtajalta. Palauttaa virheen tai null.
  requestArty(kind: 'he' | 'smoke', x: number, z: number): string | null {
    if (this.artyLeft <= 0) return 'Tulitehtävät on käytetty';
    const hq = this.squads.find((q) => q.side === 0 && !q.veh && !q.mortar && q.id === 0)!;
    const L = this.soldiers[hq.leader];
    if (!L || !this.alive(L) || hq.mstate >= 3) return 'Joukkueenjohtaja ei voi pyytää tulta';
    const los = this.T.los(L.x, this.eyeY(L, P_STAND), L.z, x, this.T.h(x, z) + 1, z) >= 0;
    const tReq = this.time;
    const tSpot = tReq + (los ? 80 : 140) + this.rng.range(0, 25);
    this.arty.push({ kind, x, z, tReq, tSpot, tFfe: tSpot + 25, los, state: 'pending' });
    this.artyLeft--;
    // kohdistuslaukaus
    const e1 = los ? 45 : 90;
    this.incoming.push({ t: tSpot, x: x + this.rng.gauss() * e1, z: z + this.rng.gauss() * e1, kind: kind === 'he' ? 'he105' : 'smoke105' });
    // tehoammunta: 4 tykkiä × 4 yhteislaukausta (savu: 2 × 4)
    const ce = los ? 12 : 30;
    const cx = x + this.rng.gauss() * ce, cz = z + this.rng.gauss() * ce;
    const salvos = kind === 'he' ? SCENARIO.arty.salvos : 2;
    const dir = Math.atan2(x - L.x, z - L.z);
    for (let v = 0; v < salvos; v++) for (let g = 0; g < 4; g++) {
      let px: number, pz: number;
      if (kind === 'smoke') { const o = (g - 1.5) * 16 + this.rng.gauss() * 6; px = cx + Math.cos(dir) * o; pz = cz - Math.sin(dir) * o; }
      else { px = cx + this.rng.gauss() * 18; pz = cz + this.rng.gauss() * 18; }
      this.incoming.push({ t: tSpot + 30 + v * 11 + g * 0.7 + this.rng.range(0, 2), x: px, z: pz, kind: kind === 'he' ? 'he105' : 'smoke105' });
    }
    return null;
  }
  private updateSupport() {
    // savukranaattikäskyt toteutetaan vuoron alussa
    for (const sq of this.squads) {
      if (!sq.smokeOrder || this.time < this.turnStart + 1) continue;
      const o = sq.smokeOrder;
      sq.smokeOrder = null;
      if (sq.smokeLeft <= 0) continue;
      const L = this.soldiers[sq.leader];
      if (!L || !this.alive(L)) continue;
      sq.smokeLeft--;
      if (sq.veh) { this.sfxPush(5, L.x, this.T.h(L.x, L.z) + 2, L.z); this.addSmoke(o.x, o.z, 10, 95); this.msg(0, `${sq.short} laukaisee savuheittimet`, 1); }
      else { this.incoming.push({ t: this.time + 2, x: o.x + this.rng.gauss() * 1.5, z: o.z + this.rng.gauss() * 1.5, kind: 'smokegren' }); this.msg(0, `${sq.short}: savukranaatti`, 1); }
    }
    for (let i = this.incoming.length - 1; i >= 0; i--) {
      const s = this.incoming[i];
      if (this.time < s.t) continue;
      this.incoming.splice(i, 1);
      const y = this.T.h(s.x, s.z);
      if (s.kind === 'smokegren') { this.sfxPush(4, s.x, y, s.z); this.addSmoke(s.x, s.z, 8, 80); }
      else if (s.kind === 'smoke105') { this.sfxPush(2, s.x, y, s.z); this.addSmoke(s.x, s.z, 12, 120); this.explosions.push(this.time - this.turnStart, s.x, y, s.z, 0.6); }
      else {
        const hq = this.squads[0];
        this.sfxPush(2, s.x, y, s.z);
        const A = SCENARIO.arty;
        this.explodeAt(s.x, y + 0.2, s.z, 0, hq.members[0], A.frag, 4 * A.size / 3, false, A.size, 48 * A.size / 3);
      }
    }
    for (const m of this.arty) {
      if (m.state === 'pending' && this.time >= m.tSpot) { m.state = 'spot'; this.msg(0, `Tykistö: kohdistuslaukaus ${m.los ? '' : '(kartalta, ei näköyhteyttä) '}`, 1); }
      if (m.state === 'spot' && this.time >= m.tFfe) { m.state = 'ffe'; this.msg(0, m.kind === 'he' ? 'Tykistö: tehoammunta alkaa' : 'Tykistö: savuverho tulossa', 1); }
      if (m.state === 'ffe' && this.time >= m.tFfe + 50) m.state = 'done';
    }
    // päivitetään savupilvet näkölinjoja varten
    this.T.smokes.length = 0;
    this.smokes = this.smokes.filter((c) => this.time - c.t0 < c.dur + 25);
    for (const c of this.smokes) {
      const st = smokeAt(c, this.time);
      if (st) this.T.smokes.push({ x: st.x, z: st.z, r: st.r, h: c.h, y0: this.T.h(st.x, st.z) - 1, dens: st.dens });
    }
  }

  // ---------------- kranaatinheitin ----------------
  // Korkean kaaren korotuskulma numeerisesti (ilmanvastus ja korkeusero mukana).
  // Pienin panos, jolla kohde saavutetaan korkeintaan 80° korotuksella (lyhyempi lentoaika).
  chooseCharge(w: Weapon, R: number, dy: number) {
    for (const v of w.charges ?? [w.v0]) {
      const el = this.solveHighAngle(w, R, dy, v);
      if (el < 1.4 || v === (w.charges ?? [w.v0]).slice(-1)[0]) return { el, v0: v };
    }
    return { el: this.solveHighAngle(w, R, dy, w.v0), v0: w.v0 };
  }
  solveHighAngle(w: Weapon, R: number, dy: number, v0 = w.v0) {
    const fly = (el: number) => {
      let x = 0, y = 0, vx = Math.cos(el) * v0, vy = Math.sin(el) * v0;
      const h = 0.05;
      for (let i = 0; i < 1200; i++) {
        const v = Math.hypot(vx, vy);
        vx -= w.drag * v * vx * h; vy -= (G + w.drag * v * vy) * h;
        x += vx * h; y += vy * h;
        if (vy < 0 && y <= dy) return x;
      }
      return x;
    };
    let lo = Math.PI / 4, hi = 1.53; // kantama pienenee kulman kasvaessa
    for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (fly(m) > R) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // Tähystäjä: heitintiimi itse tai joukkueenjohtaja (alle 150 m päässä heittimestä).
  mortarSpotter(sq: Squad, x: number, z: number) {
    const ty = this.T.h(x, z) + 0.8;
    for (const id of sq.members) {
      const s = this.soldiers[id];
      if (this.alive(s) && this.T.los(s.x, this.eyeY(s, P_STAND), s.z, x, ty, z) >= 0) return true;
    }
    const hq = this.squads[0];
    const L = this.soldiers[hq.leader];
    const c = this.squadCenter(sq);
    if (L && this.alive(L) && Math.hypot(L.x - c.x, L.z - c.z) < 150 && this.T.los(L.x, this.eyeY(L, P_STAND), L.z, x, ty, z) >= 0) return true;
    return false;
  }
  private mortarFire(s: Soldier, sq: Squad) {
    const m = sq.mortar!;
    if (s.moving || s.setupT < s.w.setup || this.time < m.next || s.ammo + s.mag <= 0 || s.supp > 70) return;
    let tx: number, tz: number, key: string;
    if (sq.target && sq.target.kind === 'area') { tx = sq.target.x; tz = sq.target.z; key = 'a' + Math.round(tx) + ',' + Math.round(tz); }
    else if (sq.target && sq.target.kind === 'unit' && this.squadKnows(sq, sq.target.id) && this.alive(this.soldiers[sq.target.id])) {
      const id = sq.target.id; tx = this.lastPos[sq.side][id * 2]; tz = this.lastPos[sq.side][id * 2 + 1]; key = 'u' + id;
    } else {
      // omatoiminen tuli: konekivääri- ja kuoppakeskittymät
      let best = -1, bs = 2.9;
      for (const e of this.soldiers) {
        if (e.side === s.side || !this.alive(e) || e.veh || !this.squadKnows(sq, e.id)) continue;
        const ex = this.lastPos[sq.side][e.id * 2], ez = this.lastPos[sq.side][e.id * 2 + 1];
        const d = Math.hypot(ex - s.x, ez - s.z);
        if (d < 50 || d > 520) continue;
        let near = 0;
        for (const o of this.soldiers) if (o !== e && o.side === e.side && this.alive(o) && Math.hypot(o.x - e.x, o.z - e.z) < 8) near++;
        const v = (e.w.kind === 'lmg' || e.w.kind === 'hmg' || this.squads[e.squad].gun ? 3 : 1) + near * 0.8;
        if (v > bs) { bs = v; best = e.id; }
      }
      if (best < 0) return;
      tx = this.lastPos[sq.side][best * 2]; tz = this.lastPos[sq.side][best * 2 + 1]; key = 'u' + best;
    }
    const R = Math.hypot(tx - s.x, tz - s.z);
    if (R < (s.w.minR ?? 50) || R > s.w.max) { m.next = this.time + 2; return; }
    if (this.time > m.spotT) { m.spotT = this.time + 3; m.spotOk = this.mortarSpotter(sq, tx, tz) && !this.friendlyBlock(s, tx, tz, 30 * Math.pow(s.w.mass, 0.33), 0); }
    if (!m.spotOk) { m.next = this.time + 1; return; }
    // haarukointi: uusi maali → korjaukset nollataan; tähystäjä siirtää tulta iskemien perusteella
    if (key !== m.corrKey) { m.corrKey = key; m.corr = 1; m.adjX = 0; m.adjZ = 0; } else m.corr = Math.max(0.3, m.corr * 0.65);
    const err = (5 + R * 0.04) * m.corr * s.exp / 0.85;
    const ax = tx + m.adjX + this.rng.gauss() * err, az = tz + m.adjZ + this.rng.gauss() * err;
    const oy = this.T.h(s.x, s.z) + 0.5;
    const { el, v0 } = this.chooseCharge(s.w, Math.hypot(ax - s.x, az - s.z), this.T.h(ax, az) - oy);
    const yaw = Math.atan2(ax - s.x, az - s.z) + this.rng.gauss() * 0.004;
    this.sfxPush(1, s.x, oy, s.z);
    this.bullets.push({
      x: s.x, y: oy, z: s.z, vx: Math.sin(yaw) * Math.cos(el) * v0, vy: Math.sin(el) * v0, vz: Math.cos(yaw) * Math.cos(el) * v0,
      sx: s.x, sy: oy, sz: s.z, t0: this.time, age: 0, shooter: s.id, side: s.side, squad: s.squad,
      mass: s.w.mass, drag: s.w.drag, frag: false, tracer: false, ignore: -1, nm: [], alive: true, he: true, ap: false, maxAge: 30, indirect: true,
      aimX: tx, aimZ: tz, key,
    });
    if (s.mag > 0) s.mag--; else s.ammo--;
    s.fired = this.time;
    s.shots++;
    m.next = this.time + this.rng.range(4.5, 6.5);
  }

  // ---------------- panssarivaunu ----------------
  private updateTank(s: Soldier, sq: Squad) {
    const v = s.veh!;
    if (this.time - s.suppT > 2.5) s.supp = Math.max(0, s.supp - DT * 6);
    // luukut
    if (v.cmdHit || !v.hatchOrder || s.supp > 25) v.buttoned = true;
    else if (this.time - s.suppT > 12) v.buttoned = false;
    // liike: vaunu kääntyy ja ajaa runkonsa suuntaan
    let mode: Mode = 'move';
    if (sq.moving && sq.path.length) { mode = sq.path[0].mode; s.tx = sq.gx; s.tz = sq.gz; }
    const dx = s.tx - s.x, dz = s.tz - s.z;
    const dist = Math.hypot(dx, dz);
    s.speed = 0;
    if (dist > 0.8 && !v.immob) {
      const want = Math.atan2(dx, dz);
      s.heading = turnTo(s.heading, want, 0.6 * DT);
      const align = Math.cos(angDiff(want, s.heading));
      const spec = this.vspec(s);
      let sp = (sq.moving ? VEH_SPEED[mode] * spec.speed : 2.2) * this.vehGround(spec, s.x, s.z);
      sp *= align > 0.95 ? 1 : align > 0.7 ? 0.45 : 0.04;
      const step = Math.min(dist, sp * DT);
      const nx = s.x + Math.sin(s.heading) * step, nz = s.z + Math.cos(s.heading) * step;
      if (this.T.walkableVeh(nx, nz)) { s.x = nx; s.z = nz; s.speed = step / DT; }
    } else if (!sq.moving && sq.face !== null && !v.immob) s.heading = turnTo(s.heading, sq.face, 0.5 * DT);
    s.moving = s.speed > 0.2;
    if (s.moving) s.setupT = 0; else s.setupT += DT;
    // moottorin ääni kantaa kauas
    if (s.moving && this.time > v.engineT) {
      v.engineT = this.time + 4;
      if (!this.sideSees(1, s.id)) {
        const cx = s.x + this.rng.gauss() * 20, cz = s.z + this.rng.gauss() * 20;
        const list = this.sounds[1];
        const ex = list.find((c) => c.kind === 'Panssarivaunu');
        if (ex) { ex.x = cx; ex.z = cz; ex.t = this.time; } else list.push({ x: cx, z: cz, t: this.time, kind: 'Panssarivaunu' });
      }
    }
    if (this.time >= s.visT) { s.visT = this.time + 1.4 + this.rng.next() * 0.2; this.observe(s); }
    this.tankFire(s, sq);
  }

  private tankFire(s: Soldier, sq: Squad) {
    const v = s.veh!;
    const spec = this.vspec(s), GUN = WEAPONS[spec.gun], MG = WEAPONS[spec.mg];
    const gy = this.T.h(s.x, s.z) + spec.gunY;
    if (this.time >= s.tgtT) {
      s.tgtT = this.time + 1.1 + this.rng.next() * 0.3;
      let gunBest = -1, gs = -1e9, mgBest = -1, ms = -1e9;
      const ordered = sq.target && sq.target.kind === 'unit' ? sq.target.id : -1;
      for (const e of this.soldiers) {
        if (e.side === s.side || !this.alive(e) || e.veh) continue;
        if (!this.squadKnows(sq, e.id) && s.vis.indexOf(e.id) < 0) continue;
        const d = Math.hypot(e.x - s.x, e.z - s.z);
        if (d > 1300 || d < 4) continue;
        if (this.T.los(s.x, gy, s.z, e.x, this.aimY(e), e.z) < 0) continue;
        let near = 0;
        for (const o of this.soldiers) if (o !== e && o.side === e.side && this.alive(o) && Math.hypot(o.x - e.x, o.z - e.z) < 7) near++;
        let value = (e.w.kind === 'lmg' || e.w.kind === 'hmg' ? 3 : 1) * (this.inFox(e) ? 1.5 : 1) + near * 0.7 + (this.time - e.fired < 4 ? 0.8 : 0);
        const eg = this.squads[e.squad].gun;
        if (eg && !eg.dead) value += 8;
        if (e.id === s.tgt) value += 1.5; // pysytään maalissa, jotta tulta voi korjata
        if (e.id === ordered) value += 50;
        const gscore = value - d / 350;
        if (value >= 1.6 && gscore > gs) { gs = gscore; gunBest = e.id; }
        const mscore = (e.id === ordered ? 50 : 0) - d / 60 + (e.moving ? 1 : 0) + (this.time - e.fired < 4 ? 1.5 : 0);
        if (d < 750 && mscore > ms) { ms = mscore; mgBest = e.id; }
      }
      s.tgt = gunBest;
      v.mgTgt = mgBest;
      // havaittu tykkiasema on maali, vaikka miehistö olisi hetken näkymättömissä
      v.gunPos = -1;
      if (gunBest < 0 || this.squads[this.soldiers[gunBest].squad].gun === null) {
        for (const gq of this.guns) {
          const g = gq.gun!;
          if (g.dead || !g.seen0 || gq.side === s.side || this.gunner(gq) < 0) continue;
          if (Math.hypot(g.x - s.x, g.z - s.z) > 1300) continue;
          if (this.T.los(s.x, gy, s.z, g.x, this.T.h(g.x, g.z) + 0.8, g.z) < 0) continue;
          v.gunPos = gq.id; s.tgt = -1; break;
        }
      }
    }
    // tähtäyskohta: tykin maali, sitten kk:n maali, sitten aluetulikohde
    let ax: number | null = null, az = 0, ay = 0, area = false;
    const gT = s.tgt >= 0 ? this.soldiers[s.tgt] : null;
    if (v.gunPos >= 0) { const g = this.squads[v.gunPos].gun!; ax = g.x; az = g.z; ay = this.T.h(g.x, g.z) + 0.6; }
    else if (gT && this.alive(gT)) { ax = gT.x; az = gT.z; ay = this.aimY(gT); }
    else if (v.mgTgt >= 0 && this.alive(this.soldiers[v.mgTgt])) { const e = this.soldiers[v.mgTgt]; ax = e.x; az = e.z; ay = this.aimY(e); }
    else if (sq.target && sq.target.kind === 'area') { area = true; ax = sq.target.x; az = sq.target.z; ay = this.T.h(ax, az) + 0.5; }
    let want = ax !== null ? Math.atan2(ax - s.x, az - s.z) : (sq.face ?? s.heading);
    v.turret = turnTo(v.turret, want, 0.42 * DT);
    if (ax === null) return;
    const d = Math.hypot(ax - s.x, az - s.z);
    const aligned = Math.abs(angDiff(want, v.turret)) < 0.012;
    // tykki: vain pysähdyksistä (ei vakaajaa)
    const gunTarget = (gT && this.alive(gT) && s.tgt >= 0) || area || v.gunPos >= 0;
    if (gunTarget && aligned && !s.moving && s.setupT > 1.2 && this.time >= s.nextShot && s.ammo > 0 && !v.gunDmg && !this.friendlyBlock(s, ax, az, 14 + GUN.mass)) {
      if (!area || this.time > v.shells) {
        // haarukointi: ensimmäinen laukaus on arvio, seuraavat korjataan iskemän perusteella
        const key = v.gunPos >= 0 ? -10 - v.gunPos : area ? -2 : s.tgt;
        if (key !== v.corrTgt) { v.corrTgt = key; v.corr = 1; } else v.corr = Math.max(0.3, v.corr * 0.62);
        const bias = (0.5 + d * 0.0065) * v.corr * (v.cmdHit ? 1.3 : 1) * (v.buttoned ? 1.2 : 1);
        const spread = area && v.gunPos < 0 ? 4 : 1;
        const tx = ax + this.rng.gauss() * bias * spread, tz = az + this.rng.gauss() * bias * spread;
        this.launch(s, GUN, gy, tx, ay + this.rng.gauss() * bias * 0.3, tz, true);
        s.ammo--;
        s.nextShot = this.time + GUN.reload * this.rng.range(0.9, 1.35) * (1 + v.crewHits * 0.5);
        if (area) v.shells = this.time + 7;
        return;
      }
    }
    // konekiväärit (koaksiaali + rungon kk)
    if (v.mgReload > 0) { v.mgReload -= DT; if (v.mgReload <= 0) { const take = Math.min(MG.mag, v.mgAmmo); v.mgMag = take; v.mgAmmo -= take; } return; }
    if (this.time < v.mgNext) return;
    if (v.mgMag <= 0) { if (v.mgAmmo > 0) v.mgReload = 5; return; }
    const mgE = v.mgTgt >= 0 ? this.soldiers[v.mgTgt] : null;
    if (mgE && this.friendlyBlock(s, mgE.x, mgE.z, 0)) { v.mgNext = this.time + 1; return; }
    let mx: number, mz: number, my: number;
    if (mgE && this.alive(mgE)) { mx = mgE.x; mz = mgE.z; my = this.aimY(mgE); }
    else if (area) { mx = ax + this.rng.gauss() * 3; mz = az + this.rng.gauss() * 3; my = this.T.h(mx, mz) + 0.4; }
    else return;
    const md = Math.atan2(mx - s.x, mz - s.z);
    if (Math.abs(angDiff(md, v.turret)) > 0.08 && Math.abs(angDiff(md, s.heading)) > 0.4) return;
    if (v.mgBurst <= 0) {
      v.mgBurst = this.rng.int(5, 10);
      const bs = (0.45 + Math.hypot(mx - s.x, mz - s.z) * 0.0055) * (s.moving ? 2.2 : 1) * (v.buttoned ? 1.3 : 1);
      s.biasX = this.rng.gauss() * bs; s.biasY = this.rng.gauss() * bs * 0.4;
    }
    const ang = md;
    this.launch(s, MG, this.T.h(s.x, s.z) + 1.7, mx + Math.cos(ang) * s.biasX, my + s.biasY, mz - Math.sin(ang) * s.biasX, false);
    v.mgMag--;
    v.mgBurst--;
    v.mgNext = this.time + (v.mgBurst > 0 ? 60 / MG.rpm : this.rng.range(1.3, 2.8));
  }
  // Ammus vaunusta: hajonta + kaaren kompensointi.
  private launch(s: Soldier, w: Weapon, oy: number, tx: number, ty: number, tz: number, he: boolean) {
    const v = s.veh!;
    const dir = he ? v.turret : Math.atan2(tx - s.x, tz - s.z);
    const ox = s.x + Math.sin(dir) * (he ? 3.4 : 2.4), oz = s.z + Math.cos(dir) * (he ? 3.4 : 2.4);
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const horiz = Math.hypot(dx, dz);
    const est = horiz * (1 + this.rng.gauss() * (he ? 0.05 : 0.08) * (v.buttoned ? 1.4 : 1));
    const tof = (Math.exp(w.drag * est) - 1) / (w.drag * w.v0);
    let yaw = Math.atan2(dx, dz);
    let pitch = Math.atan2(dy + 0.5 * G * tof * tof, horiz);
    const sig = (w.mrad / 1000) * (s.moving ? 2.5 : 1);
    yaw += this.rng.gauss() * sig; pitch += this.rng.gauss() * sig;
    const cp = Math.cos(pitch);
    s.shots++;
    s.fired = this.time;
    this.squads[s.squad].lastFireT = this.time;
    this.bullets.push({
      x: ox, y: oy, z: oz, vx: Math.sin(yaw) * cp * w.v0, vy: Math.sin(pitch) * w.v0, vz: Math.cos(yaw) * cp * w.v0,
      sx: ox, sy: oy, sz: oz, t0: this.time, age: 0, shooter: s.id, side: s.side, squad: s.squad,
      mass: w.mass, drag: w.drag, frag: false, tracer: he || s.shots % 4 === 0, ignore: -1, nm: [], alive: true, he, ap: false, wid: w.id,
    });
    if (this.time - s.sndT > 3) {
      s.sndT = this.time;
      if (!this.sideSees(1, s.id)) {
        const cx = s.x + this.rng.gauss() * 15, cz = s.z + this.rng.gauss() * 15;
        const list = this.sounds[1];
        const ex = list.find((c) => c.kind === 'Panssarivaunu');
        if (ex) { ex.x = cx; ex.z = cz; ex.t = this.time; } else list.push({ x: cx, z: cz, t: this.time, kind: 'Panssarivaunu' });
      }
    }
  }
  // Osuuko jana vaunuun? t = janan parametri (2 = ei osu); cmd = avoimen luukun johtaja;
  // box/face = osuttu levy, cosN = osumakulman kosini levyn normaaliin nähden, low = alarunko/telasto.
  vehHit(t: Soldier, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const h = t.heading, g = this.T.h(t.x, t.z);
    const c = Math.cos(h), sn = Math.sin(h);
    const lx = (px: number, pz: number) => (px - t.x) * c - (pz - t.z) * sn;
    const lz = (px: number, pz: number) => (px - t.x) * sn + (pz - t.z) * c;
    const a = [lx(ax, az), ay - g, lz(ax, az)], b = [lx(bx, bz), by - g, lz(bx, bz)];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const spec = this.vspec(t);
    const HULL = spec.hull, TUR = spec.tur;
    const th = segAabb(a[0], a[1], a[2], d[0], d[1], d[2], HULL[0], HULL[1], HULL[2], HULL[3], HULL[4], HULL[5]);
    const tt = segAabb(a[0], a[1], a[2], d[0], d[1], d[2], TUR[0], TUR[1], TUR[2], TUR[3], TUR[4], TUR[5]);
    let best = Math.min(th, tt), box = tt < th ? 'turret' : 'hull';
    let cmd = false;
    const v = t.veh!;
    if (!v.buttoned && !v.ko) {
      const tr = v.turret;
      const cx = t.x + Math.sin(h) * 0.25 - Math.sin(tr) * 0.55, cz = t.z + Math.cos(h) * 0.25 - Math.cos(tr) * 0.55;
      const r = segSeg(ax, ay, az, bx, by, bz, cx, g + spec.cmdY, cz, cx, g + spec.cmdY + 0.5, cz);
      if (r.d < 0.24 && r.s < best) { best = r.s; cmd = true; }
    }
    let face = 'front', cosN = 1, low = false;
    if (best <= 1 && !cmd) {
      const B = box === 'hull' ? HULL : TUR;
      const p = [a[0] + d[0] * best, a[1] + d[1] * best, a[2] + d[2] * best];
      const rel = [0, 1, 2].map((k) => (p[k] - (B[k] + B[k + 3]) / 2) / ((B[k + 3] - B[k]) / 2));
      const ax3 = Math.abs(rel[0]) > Math.abs(rel[1]) && Math.abs(rel[0]) > Math.abs(rel[2]) ? 0 : Math.abs(rel[1]) > Math.abs(rel[2]) ? 1 : 2;
      face = ax3 === 0 ? 'side' : ax3 === 1 ? (rel[1] > 0 ? 'top' : 'bottom') : (rel[2] > 0 ? 'front' : 'rear');
      // tornin levyt kääntyvät tornin mukana: kulma lasketaan tornin suunnasta
      let nx = 0, ny = 0, nz = 0;
      const ang = box === 'turret' ? v.turret : h;
      if (face === 'top' || face === 'bottom') ny = 1;
      else if (face === 'side') { nx = Math.cos(ang); nz = -Math.sin(ang); }
      else { nx = Math.sin(ang); nz = Math.cos(ang); }
      if (box === 'turret' && face === 'side') {
        // osuma tornin sivuun vai etu-/takalevyyn riippuu tornin kulmasta
        const dirAng = Math.atan2(bx - ax, bz - az);
        const rel2 = Math.abs(angDiff(dirAng + Math.PI, ang));
        if (rel2 < 0.6) { face = 'front'; nx = Math.sin(ang); nz = Math.cos(ang); } else if (rel2 > Math.PI - 0.6) { face = 'rear'; nx = Math.sin(ang); nz = Math.cos(ang); }
      }
      low = box === 'hull' && face === 'side' && p[1] < 0.9;
      // levyn kaltevuus: normaali kallistuu ylöspäin (alarungon kylki on pystysuora)
      if (face !== 'top' && face !== 'bottom') {
        const sl = (low ? 0 : (spec.armor as any)[box][face][1]) * Math.PI / 180;
        let sx = 1;
        if (face === 'side') sx = rel[0] >= 0 ? 1 : -1;
        else if (face === 'rear') sx = -1;
        else sx = rel[2] >= 0 ? 1 : -1;
        nx *= sx * Math.cos(sl); nz *= sx * Math.cos(sl); ny = Math.sin(sl);
      }
      const L = Math.hypot(bx - ax, by - ay, bz - az) || 1;
      cosN = Math.abs(((bx - ax) * nx + (by - ay) * ny + (bz - az) * nz) / L);
    }
    return { t: best, cmd, box, face, cosN, low };
  }

  // Panssarintorjuntaosuma: läpäisy = ammuksen nopeus osumahetkellä, levyn paksuus ja kulma.
  private armorHit(t: Soldier, hit: { box: string; face: string; cosN: number; low: boolean }, v: number, by: Soldier, b: Bullet) {
    const V = t.veh!;
    if (V.ko) return;
    const vn = this.squads[t.squad].short;
    const plate = (this.vspec(t).armor as any)[hit.box][hit.face][0] as number;
    const where = (hit.box === 'turret' ? 'torniin' : 'runkoon') + ' (' + ({ front: 'edestä', side: 'sivusta', rear: 'takaa', top: 'ylhäältä', bottom: 'alhaalta' } as any)[hit.face] + ')';
    if (hit.cosN < (b.heat ? 0.17 : 0.34)) {
      this.msg(0, `${vn}: kimmoke ${where}`, 2);
      t.supp = Math.min(100, t.supp + 35); t.suppT = this.time;
      return;
    }
    // BR-240: noin 44 mm suoraan 760 m/s:ssa; vuoden 1941 ammuksista moni hajosi osuessaan
    const shatter = !b.heat && this.rng.chance(b.shatter ?? 0);
    const pen = (b.heat ? (b.pen ?? 100) : (b.pen ?? 44) * Math.pow(v / (b.penV ?? 760), 1.43)) * this.rng.range(0.92, 1.08) * (shatter ? 0.6 : 1);
    const eff = plate / Math.max(hit.cosN, 0.2);
    t.supp = Math.min(100, t.supp + 50); t.suppT = this.time;
    V.buttoned = true;
    // tykin suuliekki paljastuu vaunun miehistölle
    if (by && this.rng.chance(0.6)) { this.sideSeen[0][by.id] = this.time; this.seenBySquad[t.squad][by.id] = this.time; this.lastPos[0][by.id * 2] = by.x; this.lastPos[0][by.id * 2 + 1] = by.z; if (this.sideFirst[0][by.id] > this.time) this.sideFirst[0][by.id] = this.time - 10; }
    if (pen < eff) {
      if (hit.low && this.rng.chance(0.5) && !V.immob) { V.immob = true; this.msg(0, `${vn}: osuma telastoon, vaunu liikuntakyvytön!`, 3); }
      else this.msg(0, `${vn}: osuma ${where}, ei läpäisyä${shatter ? ', ammus hajosi' : ''} (${Math.round(eff)} mm)`, 2);
      return;
    }
    this.sfxPush(6, t.x, this.T.h(t.x, t.z) + 1.5, t.z);
    const r = this.rng.next();
    let res: string;
    if (hit.face === 'rear' && hit.box === 'hull') res = r < 0.35 ? 'ko' : r < 0.8 ? 'immob' : 'crew';
    else if (hit.box === 'turret') res = r < 0.4 ? 'ko' : r < 0.65 ? 'gun' : 'crew';
    else res = r < 0.5 ? 'ko' : r < 0.7 ? 'immob' : 'crew';
    if (res === 'crew' && V.crewHits >= 1 && this.rng.chance(0.5)) res = 'ko';
    if (res === 'ko') {
      this.msg(0, `${vn}: läpäisy ${where}!`, 3);
      V.ko = true; t.state = ST_DEAD;
      this.sfxPush(7, t.x, this.T.h(t.x, t.z) + 1.5, t.z);
      this.onCasualty(t, by);
    } else if (res === 'immob') {
      V.immob = true;
      this.msg(0, `${vn}: läpäisy ${where}, moottori/voimansiirto vaurioitui, vaunu liikuntakyvytön`, 3);
    } else if (res === 'gun') {
      V.gunDmg = true;
      this.msg(0, `${vn}: läpäisy ${where}, kanuuna vaurioitui (vain konekiväärit)`, 3);
    } else {
      V.crewHits++; V.cmdHit = true;
      this.msg(0, `${vn}: läpäisy ${where}, miehistöä haavoittui`, 3);
    }
  }

  // ---------------- panssarintorjuntatykki ----------------
  gunner(sq: Squad) {
    const g = sq.gun!;
    let best = -1, bd = 1e9;
    for (const id of sq.members) {
      const s = this.soldiers[id];
      if (!this.alive(s) || s.huntTank >= 0) continue;
      const d = Math.hypot(s.x - g.x, s.z - g.z);
      if (d < bd) { bd = d; best = id; }
    }
    return bd < 6 ? best : -1;
  }
  private gunFire(s: Soldier, sq: Squad) {
    const g = sq.gun!;
    const crew = this.squadAlive(sq).filter((id) => Math.hypot(this.soldiers[id].x - g.x, this.soldiers[id].z - g.z) < 8).length;
    const gy = this.T.h(g.x, g.z) + 0.85;
    if (this.time >= s.tgtT) {
      s.tgtT = this.time + 1 + this.rng.next() * 0.4;
      let best = -1, bs = -1e9;
      for (const e of this.soldiers) {
        if (e.side === s.side || !this.alive(e)) continue;
        if (!this.squadKnows(sq, e.id) && s.vis.indexOf(e.id) < 0) continue;
        const d = Math.hypot(e.x - g.x, e.z - g.z);
        if (d > 1000) continue;
        let sc: number;
        if (e.veh) {
          // väijytys: ammutaan vasta kun vaunu on lähellä tai se jo tulittaa meitä
          if (g.shots === 0 && d > g.ambush && this.time - sq.tankFireT > 10) continue; // väijytys avataan läheltä
          // oppi: keulaan ei ammuta kaukaa, odotetaan kylkeä tai lyhyttä matkaa
          const aspect = Math.abs(angDiff(Math.atan2(g.x - e.x, g.z - e.z), e.heading));
          if (!g.frontOk && aspect < 0.6 && d > 200 && this.time - sq.tankFireT > 10 && !e.veh.immob) continue;
          sc = 100 - d / 20 + aspect * 10;
        } else {
          if (g.he <= 0 || g.shots === 0 || d > 350) continue;
          let near = 0;
          for (const o of this.soldiers) if (o !== e && o.side === e.side && this.alive(o) && !o.veh && Math.hypot(o.x - e.x, o.z - e.z) < 7) near++;
          if (near < 3 && e.w.kind !== 'lmg') continue;
          sc = near * 3 + (e.w.kind === 'lmg' ? 6 : 0) - d / 50;
        }
        if (this.T.los(g.x, gy, g.z, e.x, e.veh ? this.T.h(e.x, e.z) + 1.3 : this.aimY(e), e.z) < 0) continue;
        if (sc > bs) { bs = sc; best = e.id; }
      }
      g.tgt = best;
      s.tgt = best;
    }
    if (g.tgt < 0 || !this.alive(this.soldiers[g.tgt])) { g.aim = turnTo(g.aim, g.heading, 0.3 * DT); return; }
    const e = this.soldiers[g.tgt];
    const want = Math.atan2(e.x - g.x, e.z - g.z);
    // suuntauskenttä ±30°; muuten koko tykki käännetään käsivoimin
    if (Math.abs(angDiff(want, g.heading)) > 0.5) {
      g.heading = turnTo(g.heading, want, 0.07 * DT);
      g.aim = turnTo(g.aim, g.heading, 0.3 * DT);
      g.moveT = this.time;
      return;
    }
    g.aim = turnTo(g.aim, want, 0.35 * DT);
    if (Math.abs(angDiff(want, g.aim)) > 0.008 || this.time < g.next || this.time - g.moveT < 3 || s.supp > 65 || crew < 1) return;
    const useAP = !!e.veh;
    if (useAP ? g.ap <= 0 : g.he <= 0) return;
    if (!useAP && this.friendlyBlock(s, e.x, e.z, 12)) { g.next = this.time + 2; return; }
    const d = Math.hypot(e.x - g.x, e.z - g.z);
    if (g.tgt !== g.corrTgt) { g.corrTgt = g.tgt; g.corr = 1; } else g.corr = Math.max(0.28, g.corr * 0.6);
    const bias = (0.35 + d * 0.0045) * g.corr * s.exp / 0.85 * (1 + s.supp / 80);
    const tx = e.x + this.rng.gauss() * bias, tz = e.z + this.rng.gauss() * bias;
    const ty = (useAP ? this.T.h(e.x, e.z) + 1.25 : this.aimY(e)) + this.rng.gauss() * bias * 0.35;
    const ox = g.x + Math.sin(g.aim) * 1.6, oz = g.z + Math.cos(g.aim) * 1.6;
    this.launchFrom(s, g.w, ox, gy, oz, tx, ty, tz, !useAP, useAP);
    if (useAP) g.ap--; else g.he--;
    g.shots++;
    g.next = this.time + g.w.reload * (crew >= 3 ? 1 : crew === 2 ? 1.6 : 2.6) * this.rng.range(0.9, 1.3) * (useAP ? 1 : 2.2);
    sq.freeFire = true;
  }
  // Yleinen laukaisu annetusta suupisteestä.
  private launchFrom(s: Soldier, w: Weapon, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, he: boolean, ap: boolean) {
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const horiz = Math.hypot(dx, dz);
    const est = horiz * (1 + this.rng.gauss() * 0.05);
    const tof = (Math.exp(w.drag * est) - 1) / (w.drag * w.v0);
    let yaw = Math.atan2(dx, dz);
    let pitch = Math.atan2(dy + 0.5 * G * tof * tof, horiz);
    const sig = w.mrad / 1000;
    yaw += this.rng.gauss() * sig; pitch += this.rng.gauss() * sig;
    const cp = Math.cos(pitch);
    s.shots++;
    s.fired = this.time;
    this.squads[s.squad].lastFireT = this.time;
    this.bullets.push({
      x: ox, y: oy, z: oz, vx: Math.sin(yaw) * cp * w.v0, vy: Math.sin(pitch) * w.v0, vz: Math.cos(yaw) * cp * w.v0,
      sx: ox, sy: oy, sz: oz, t0: this.time, age: 0, shooter: s.id, side: s.side, squad: s.squad,
      mass: w.mass, drag: w.drag, frag: false, tracer: true, ignore: -1, nm: [], alive: true, he, ap, wid: w.id, pen: w.pen, penV: w.penV, heat: w.heat, shatter: w.shatter,
    });
  }
  // Tykin suojakilpi (6 mm) pysäyttää luodit ja sirpaleet edestä.
  private shieldHit(sq: Squad, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const g = sq.gun!;
    const h = g.aim, y0 = this.T.h(g.x, g.z);
    const c = Math.cos(h), sn = Math.sin(h);
    const L = (px: number, pz: number) => [(px - g.x) * c - (pz - g.z) * sn, (px - g.x) * sn + (pz - g.z) * c];
    const A = L(ax, az), B = L(bx, bz);
    const k = g.scale;
    return segAabb(A[0], ay - y0, A[1], B[0] - A[0], by - ay, B[1] - A[1], -0.8 * k, 0.3, 0.15, 0.8 * k, 1.25 * k, 0.3);
  }


  // ---------------- ballistiikka ----------------
  private updateBullets() {
    const h = DT / SUB;
    const T = this.T;
    const hit = this.hit;
    for (const b of this.bullets) {
      if (!b.alive) continue;
      for (let k = 0; k < SUB && b.alive; k++) {
        const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        const kv = b.drag * v;
        b.vx -= kv * b.vx * h; b.vy -= (G + kv * b.vy) * h; b.vz -= kv * b.vz * h;
        const nx = b.x + b.vx * h, ny = b.y + b.vy * h, nz = b.z + b.vz * h;
        b.age += h;
        T.bulletHit(b.x, b.y, b.z, nx, ny, nz, b.ignore, hit);
        let tMin = hit.t, kind = hit.kind, oid = hit.idx;
        // sotilaat
        let victim: Soldier | null = null, part = '';
        const mx = (b.x + nx) / 2, mz = (b.z + nz) / 2;
        const half = v * h * 0.5 + 3;
        let vehVictim: Soldier | null = null, vehCmd = false, vehInfo: any = null;
        for (const s of this.soldiers) {
          if (s.id === b.shooter || s.out || b.indirect) continue;
          if (s.veh) {
            if (Math.abs(s.x - mx) > half + 3 || Math.abs(s.z - mz) > half + 3) continue;
            const vh = this.vehHit(s, b.x, b.y, b.z, nx, ny, nz);
            if (vh.t < tMin) { tMin = vh.t; kind = 98; vehVictim = s; vehCmd = vh.cmd; vehInfo = vh; victim = null; }
            continue;
          }
          if (s.state === ST_DEAD) continue;
          if (Math.abs(s.x - mx) > half || Math.abs(s.z - mz) > half) continue;
          const body = this.bodyCapsule(s);
          const r = segSeg(b.x, b.y, b.z, nx, ny, nz, body.ax, body.ay, body.az, body.bx, body.by, body.bz);
          if (r.d < body.r && r.s < tMin) {
            vehVictim = null;
            const hy = b.y + (ny - b.y) * r.s;
            if (this.inFox(s)) {
              // kuopan reunavalli suojaa: alle reunan osuva luoti jää multaan
              const surf = this.T.h(s.x, s.z);
              if (hy < surf + 0.1) { tMin = r.s; kind = HIT_TERRAIN; victim = null; continue; }
              tMin = r.s; victim = s; kind = 99;
              part = hy > surf + 0.18 ? 'head' : 'torso';
              continue;
            }
            tMin = r.s; victim = s; kind = 99;
            part = r.t > 0.86 ? 'head' : r.t > 0.42 ? 'torso' : 'legs';
            if (body.prone && r.t < 0.25) part = 'legs';
          } else if (s.side !== b.side && this.alive(s) && b.nm.indexOf(s.id) < 0) {
            // ohilento: tukahdutus
            const cy = (body.ay + body.by) / 2;
            const dd = pointSeg3(s.x, cy, s.z, b.x, b.y, b.z, nx, ny, nz);
            if (dd < 4) {
              b.nm.push(s.id);
              const e = 0.5 * b.mass * v * v;
              const base = b.frag ? 4 : e > 1500 ? 8 : 5;
              this.addSupp(s, (base * (1 - dd / 4) + 1.5) * (s.moving ? 1.4 : 1));
              s.underFireT = this.time;
              const sh = this.soldiers[b.shooter];
              s.threatX = sh.x; s.threatZ = sh.z;
              if (sh.veh) this.squads[s.squad].tankFireT = this.time;
            }
          }
        }
        // tykkien suojakilvet
        let shield = false;
        for (const gq of this.guns) {
          if (gq.gun!.dead || b.squad === gq.id || b.indirect) continue;
          if (Math.abs(gq.gun!.x - mx) > half + 2 || Math.abs(gq.gun!.z - mz) > half + 2) continue;
          const st = this.shieldHit(gq, b.x, b.y, b.z, nx, ny, nz);
          if (st < tMin) { tMin = st; kind = 97; shield = true; victim = null; vehVictim = null; }
        }
        if (tMin <= 1) {
          const px = b.x + (nx - b.x) * tMin, py = b.y + (ny - b.y) * tMin, pz = b.z + (nz - b.z) * tMin;
          const E = 0.5 * b.mass * v * v;
          if (b.he) {
            this.endBullet(b, px, py, pz, -1);
            if (b.indirect) {
              this.sfxPush(3, px, py, pz);
              const ms = 1.15 * Math.pow(b.mass / 0.91, 0.33); // 5 cm ≈ 1,15 · 82 mm ≈ 1,8
              this.explodeAt(px, py + 0.1, pz, b.side, b.shooter, Math.round(28 * ms), 1.0 * ms, false, ms, 22 * ms);
              const mq = this.squads[b.squad].mortar;
              if (mq && b.key === mq.corrKey && b.aimX !== undefined && this.mortarSpotter(this.squads[b.squad], px, pz)) {
                mq.adjX = clamp(mq.adjX + (b.aimX - px) * 0.3, -40, 40); mq.adjZ = clamp(mq.adjZ + (b.aimZ! - pz) * 0.3, -40, 40);
              }
            }
            else {
              // räjähteen koko kranaatin massan mukaan (45 mm ≈ 0,9 · 5 cm ≈ 1 · 85 mm ≈ 1,7)
              const sz = 0.9 * Math.pow(b.mass / 1.43, 0.33);
              this.explodeAt(px, py + 0.1, pz, b.side, b.shooter, Math.round(22 * sz * sz), 0.9 * sz + 0.1, false, sz);
            }
          } else if (kind === 97 && shield) {
            this.endBullet(b, px, py, pz, b.frag ? -1 : 3);
          } else if (kind === 98 && vehVictim && b.ap) {
            this.endBullet(b, px, py, pz, 3);
            if (vehCmd) { vehVictim.veh!.cmdHit = true; vehVictim.veh!.buttoned = true; this.msg(0, `${this.squads[vehVictim.squad].short}: vaununjohtaja ${vehVictim.name} kaatui`, 3); }
            else this.armorHit(vehVictim, vehInfo, v, this.soldiers[b.shooter], b);
          } else if (kind === 98 && vehVictim) {
            // panssari pysäyttää; avoimen luukun johtaja voi saada osuman
            const tv = vehVictim.veh!;
            if (vehCmd && !b.frag) {
              tv.cmdHit = true; tv.buttoned = true;
              this.msg(0, `${this.squads[vehVictim.squad].short}: vaununjohtaja ${vehVictim.name} osui, luukut suljetaan`, 3);
            }
            if (vehVictim.state < ST_INCAP) { vehVictim.supp = Math.min(100, vehVictim.supp + (b.frag ? 0.5 : 2)); vehVictim.suppT = this.time; }
            this.endBullet(b, px, py, pz, b.frag ? -1 : 3);
          } else if (kind === 99 && victim) {
            this.wound(victim, part, E, this.soldiers[b.shooter]);
            this.endBullet(b, px, py, pz, 2);
          } else if ((kind === HIT_BUILD || kind === HIT_ROOF) && this.penetrates(b, kind, hit.bkind, E)) {
            // seinän tai katon läpi: nopeus putoaa, jatketaan seinän toiselta puolelta
            const vv = Math.hypot(b.vx, b.vy, b.vz) || 1;
            b.x = px + (b.vx / vv) * 0.35; b.y = py + (b.vy / vv) * 0.35; b.z = pz + (b.vz / vv) * 0.35;
            continue;
          } else if ((kind === HIT_FENCE && (this.rng.chance(0.5) || (E > 1500 && this.rng.chance(0.85)))) ||
            (kind === HIT_HAY && E > 1200 && this.rng.chance(0.6))) {
            // läpäisy
            const f = kind === HIT_FENCE ? 0.8 : 0.6;
            b.vx *= f; b.vy *= f; b.vz *= f;
            b.x = px + b.vx * 1e-4; b.y = py + b.vy * 1e-4; b.z = pz + b.vz * 1e-4;
            b.ignore = oid;
            continue;
          } else {
            this.endBullet(b, px, py, pz, kind === HIT_TERRAIN ? 0 : 1);
          }
          break;
        }
        b.x = nx; b.y = ny; b.z = nz;
        if (b.ignore >= 0 && b.age > 0.05) b.ignore = -1;
        if (b.age > (b.maxAge ?? 3.5) || (v < 90 && !b.indirect && b.mass < 0.5) || !T.inMap(b.x, b.z) || b.y > 1500) this.endBullet(b, b.x, b.y, b.z, -1);
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }
  // Hirsiseinä (talo) pysäyttää pistoolin luodit ja sirpaleet; kivääri läpäisee osittain. Ladon lautaseinä on ohut.
  penetrates(b: Bullet, kind: number, bkind: number, E: number) {
    let p = 0, f = 1;
    if (b.ap) { p = 1; f = 0.85; }
    else if (kind === HIT_ROOF) { if (!b.frag && E > 300) { p = 0.85; f = 0.75; } }
    else if (bkind === 1) { if (b.frag) { p = 0.35; f = 0.6; } else if (E > 300) { p = 0.9; f = 0.8; } }
    else if (!b.frag && E > 1800) { p = 0.45; f = 0.45; }
    if (!this.rng.chance(p)) return false;
    b.vx *= f; b.vy *= f; b.vz *= f;
    return true;
  }
  private endBullet(b: Bullet, x: number, y: number, z: number, impact: number) {
    b.alive = false;
    const rel = this.turnStart;
    if (!b.frag && !b.indirect) {
      this.shots.push({ t0: b.t0 - rel, x0: b.sx, y0: b.sy, z0: b.sz, t1: b.t0 + b.age - rel, x1: x, y1: y, z1: z, side: b.side, tracer: b.tracer, big: b.he, w: b.wid ?? '' });
    }
    if (impact >= 0 && (!b.frag || this.rng.chance(0.15))) this.impacts.push(b.t0 + b.age - rel, x, y, z, impact);
  }
  bodyCapsule(s: Soldier) {
    const g = this.groundY(s);
    if (s.posture === P_PRONE || s.state >= ST_INCAP) {
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      return { ax: s.x - fx * 0.85, ay: g + 0.16, az: s.z - fz * 0.85, bx: s.x + fx * 0.8, by: g + 0.24, bz: s.z + fz * 0.8, r: 0.17, prone: true };
    }
    if (s.posture === P_CROUCH) {
      if (this.inFox(s)) return { ax: s.x, ay: g + 0.25, az: s.z, bx: s.x, by: g + FOX_DEPTH + 0.2, bz: s.z, r: 0.19, prone: false };
      return { ax: s.x, ay: g + 0.25, az: s.z, bx: s.x, by: g + 1.0, bz: s.z, r: 0.24, prone: false };
    }
    return { ax: s.x, ay: g + 0.3, az: s.z, bx: s.x, by: g + 1.55, bz: s.z, r: 0.2, prone: false };
  }

  wound(s: Soldier, part: string, E: number, by: Soldier | null) {
    if (s.out || s.state === ST_DEAD || s.veh) return;
    const L = clamp(E / 1200, 0.05, 1);
    const r = this.rng.next();
    let res = ST_WOUNDED;
    if (s.state === ST_INCAP) res = r < 0.5 ? ST_DEAD : ST_INCAP;
    else if (part === 'head') res = r < 0.6 + 0.35 * L ? ST_DEAD : ST_INCAP;
    else if (part === 'torso') res = r < 0.12 + 0.35 * L ? ST_DEAD : r < 0.5 + 0.3 * L ? ST_INCAP : ST_WOUNDED;
    else res = r < 0.08 + 0.35 * L ? ST_INCAP : ST_WOUNDED;
    if (res === ST_WOUNDED && s.state === ST_WOUNDED) res = ST_INCAP;
    s.hitsTaken++;
    const prev = s.state;
    s.state = Math.max(s.state, res);
    this.addSupp(s, 40);
    if (prev < ST_INCAP && s.state >= ST_INCAP) this.onCasualty(s, by);
    else if (prev === ST_OK && s.state === ST_WOUNDED && s.side === 0) this.msg(0, `${s.rank} ${s.name} (${this.squads[s.squad].short}) haavoittui lievästi`, 2);
  }
  private onCasualty(s: Soldier, by: Soldier | null) {
    s.moving = false;
    s.tgt = -1;
    if (by && by.side !== s.side) by.kills++;
    this.casualties[s.side]++;
    const sq = this.squads[s.squad];
    sq.casualties++;
    if (s.veh) {
      this.casualties[s.side] += this.vspec(s).crew - 1; // miehistö
      sq.morale = 0;
      sq.orders = []; sq.path = []; sq.moving = false; sq.target = null;
      for (const o of this.squads) if (o.side === s.side && !o.veh) o.morale -= 6;
      this.msg(0, `${sq.short} tuhottu! Miehistö hylkää palavan vaunun`, 3);
      return;
    }
    const leader = sq.leader === s.id;
    sq.morale -= leader ? 18 : 9;
    if (leader && sq.hq) {
      for (const o of this.squads) if (o.side === s.side && o !== sq && !o.veh) o.morale -= 8;
      if (s.side === 0) this.msg(0, 'Joukkueenjohtaja on kaatunut! Ryhmät ilman johtoa', 3);
    }
    if (leader) {
      const m = this.squadAlive(sq);
      if (m.length) sq.leader = m[0];
    }
    for (const id of sq.members) {
      const f = this.soldiers[id];
      if (f !== s && this.alive(f)) { const dd = Math.hypot(f.x - s.x, f.z - s.z); if (dd < 30) this.addSupp(f, 22 * (1 - dd / 40)); }
    }
    const what = s.state === ST_DEAD ? 'kaatui' : 'haavoittui vakavasti';
    if (s.side === 0) this.msg(0, `${s.rank} ${s.name} (${sq.short}) ${what}`, 3);
    else if (this.sideSees(0, s.id) || (by && by.side === 0)) this.msg(1, `Vihollinen ${s.state === ST_DEAD ? 'kaatui' : 'osui'} (${by ? this.squads[by.squad].short : '?'})`, 4);
  }

  // ---------------- tiimit ----------------
  canSplit(sq: Squad) {
    if (sq.side !== 0 || sq.veh || sq.gun || sq.mortar || sq.hq || sq.dissolved || sq.parent >= 0 || sq.child >= 0 || sq.mstate >= 3) return false;
    const m = this.squadAlive(sq);
    return m.length >= 4 && m.some((id) => this.soldiers[id].w.kind === 'lmg');
  }
  canMerge(sq: Squad) {
    const other = sq.child >= 0 ? this.squads[sq.child] : sq.parent >= 0 ? this.squads[sq.parent] : null;
    if (!other || other.dissolved) return false;
    const a = this.squadAlive(sq), b = this.squadAlive(other);
    if (!a.length || !b.length) return true; // toinen tiimi on menetetty: jäljelle jääneet kootaan
    if (sq.moving || other.moving || sq.mstate >= 3 || other.mstate >= 3) return false;
    const ca = this.squadCenter(sq), cb = this.squadCenter(other);
    return Math.hypot(ca.x - cb.x, ca.z - cb.z) < 30;
  }
  // Ryhmä jaetaan konekivääritiimiin (varajohtaja + kk-miehet) ja kivääritiimiin (ryhmänjohtaja + kiväärit).
  splitSquad(sq: Squad): Squad | null {
    if (!this.canSplit(sq)) return null;
    const kkRoles = ['Konekivääriampuja', 'Apulaisampuja', 'Patruunankantaja', 'Varajohtaja'];
    const alive = this.squadAlive(sq);
    let team = alive.filter((id) => kkRoles.includes(this.soldiers[id].role));
    if (!team.some((id) => this.soldiers[id].role === 'Varajohtaja')) {
      const extra = alive.find((id) => !team.includes(id) && id !== sq.leader);
      if (extra !== undefined) team.push(extra);
    }
    if (team.length < 2 || alive.length - team.length < 2) return null;
    team = team.filter((id) => id !== sq.leader);
    const id = this.squads.length;
    const lead = team.find((i) => this.soldiers[i].role === 'Varajohtaja') ?? team[0];
    const t: Squad = {
      ...sq, id, name: sq.baseName + ' – kk-tiimi', short: sq.baseShort + ' kk', members: team.slice(), leader: lead,
      orders: [], path: [], moving: false, arrived: true, target: null, face: sq.face, hide: false, casualties: 0,
      leadRole: this.soldiers[lead].role, parent: sq.id, child: -1, dissolved: false, newOrders: false, holdUntil: 0,
      smokeLeft: Math.floor(sq.smokeLeft / 2), smokeOrder: null, retreating: false, aiState: 'hold',
    };
    sq.smokeLeft -= t.smokeLeft;
    sq.members = sq.members.filter((i) => !team.includes(i));
    // kaatuneet jäävät emoryhmään; kk-tiimin jäsenet siirtyvät
    for (const i of team) { const s = this.soldiers[i]; s.squad = id; s.tx = s.x; s.tz = s.z; }
    for (const i of sq.members) { const s = this.soldiers[i]; if (this.alive(s)) { s.tx = s.x; s.tz = s.z; } }
    sq.name = sq.baseName + ' – kivääritiimi'; sq.short = sq.baseShort + ' kiv';
    sq.child = id;
    sq.orders = []; sq.path = []; sq.moving = false;
    const c = this.squadCenter(t); t.gx = c.x; t.gz = c.z;
    const c2 = this.squadCenter(sq); sq.gx = c2.x; sq.gz = c2.z;
    this.squads.push(t);
    this.seenBySquad.push(Float32Array.from(this.seenBySquad[sq.id]));
    this.updateC2();
    return t;
  }
  mergeTeams(sq: Squad) {
    if (!this.canMerge(sq)) return false;
    const P = sq.parent >= 0 ? this.squads[sq.parent] : sq;
    const C = this.squads[P.child];
    const na = this.squadAlive(P).length, nb = this.squadAlive(C).length;
    P.morale = (P.morale * na + C.morale * nb) / Math.max(1, na + nb);
    P.casualties += C.casualties;
    P.smokeLeft += C.smokeLeft;
    for (const i of C.members) this.soldiers[i].squad = P.id;
    P.members = P.members.concat(C.members);
    C.members = []; C.dissolved = true; C.orders = []; C.path = []; C.moving = false;
    P.child = -1;
    P.name = P.baseName; P.short = P.baseShort;
    if (!this.alive(this.soldiers[P.leader])) P.leader = this.squadAlive(P)[0] ?? P.leader;
    for (let i = 0; i < this.seenBySquad[P.id].length; i++) this.seenBySquad[P.id][i] = Math.max(this.seenBySquad[P.id][i], this.seenBySquad[C.id][i]);
    P.orders = []; P.path = []; P.moving = false;
    const c = this.squadCenter(P); P.gx = c.x; P.gz = c.z;
    this.arrive(P);
    this.updateC2();
    return true;
  }

  // ---------------- komentoketju ----------------
  hqLeader(side: number): Soldier | null {
    const hq = this.squads.find((q) => q.side === side && q.hq && !q.veh && !q.mortar);
    if (!hq) return null;
    const L = this.soldiers[hq.leader];
    return L && this.alive(L) && hq.mstate < 3 ? L : null;
  }
  updateC2() {
    for (const sq of this.squads) {
      if (sq.veh || sq.hq) { sq.c2 = sq.veh ? true : !!this.hqLeader(sq.side); continue; }
      const H = this.hqLeader(sq.side);
      const L = this.soldiers[sq.leader];
      if (!H || !L || !this.alive(L)) { sq.c2 = false; continue; }
      const d = Math.hypot(H.x - L.x, H.z - L.z);
      sq.c2 = d < 60 || (d < 120 && this.T.los(H.x, this.eyeY(H, P_STAND), H.z, L.x, this.eyeY(L, P_STAND), L.z) >= 0);
    }
    // tiimi saa käskyt sisartiiminsa kautta, jos tämä on yhteydessä ja huutoetäisyydellä
    for (const sq of this.squads) {
      if (sq.c2 || sq.dissolved) continue;
      const sis = sq.child >= 0 ? this.squads[sq.child] : sq.parent >= 0 ? this.squads[sq.parent] : null;
      if (!sis || !sis.c2 || sis.dissolved) continue;
      const a = this.soldiers[sq.leader], b = this.soldiers[sis.leader];
      if (a && b && this.alive(a) && this.alive(b) && Math.hypot(a.x - b.x, a.z - b.z) < 40) sq.c2 = true;
    }
  }

  // ---------------- lääkintä ----------------
  private medical(sq: Squad) {
    // verenvuoto: hoitamaton vakavasti haavoittunut voi kuolla
    for (const id of sq.members) {
      const s = this.soldiers[id];
      if (s.state === ST_INCAP && !s.treated && !s.out && this.rng.chance(0.00066)) {
        s.state = ST_DEAD;
        if (s.side === 0) this.msg(0, `${s.rank} ${s.name} (${sq.short}) kuoli haavoihinsa`, 3);
      }
    }
    if (sq.veh || sq.gun || sq.retreating || sq.mstate >= 3) return;
    const m = this.squadAlive(sq);
    if (m.length < 2) return;
    let avgS = 0;
    for (const id of m) avgS += this.soldiers[id].supp;
    if (avgS / m.length > 35) return;
    if (m.some((id) => this.soldiers[id].aidTarget >= 0)) return; // yksi auttaja kerrallaan
    const c = this.squadCenter(sq);
    let cas: Soldier | null = null, cd = 30;
    for (const id of sq.members) {
      const s = this.soldiers[id];
      if (s.state !== ST_INCAP || s.treated || s.out) continue;
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      if (d < cd) { cd = d; cas = s; }
    }
    if (!cas) return;
    let helper: Soldier | null = null, hd = 1e9;
    for (const id of m) {
      const s = this.soldiers[id];
      if (id === sq.leader || s.w.kind === 'lmg' || s.w.kind === 'hmg' || s.w.kind === 'mortar' || s.huntTank >= 0 || s.supp > 30) continue;
      const d = Math.hypot(s.x - cas.x, s.z - cas.z);
      if (d < hd) { hd = d; helper = s; }
    }
    if (!helper) return;
    helper.aidTarget = cas.id; helper.aidT = 0; helper.homeX = helper.tx; helper.homeZ = helper.tz;
    this.releaseSpot(helper);
    if (helper.foxhole >= 0) { this.foxOcc[helper.foxhole] = -1; helper.foxhole = -1; }
  }
  // Auttaja menee haavoittuneen luo, hoitaa 25 s ja ottaa tämän ammukset.
  private doAid(s: Soldier, sq: Squad): { x: number; z: number } | null {
    const c = this.soldiers[s.aidTarget];
    if (s.state >= ST_INCAP || c.state === ST_DEAD || c.treated || sq.retreating || sq.moving) { s.aidTarget = -1; return null; }
    const d = Math.hypot(c.x - s.x, c.z - s.z);
    if (d > 1.1) return { x: c.x + (s.x - c.x) / d * 0.8, z: c.z + (s.z - c.z) / d * 0.8 };
    if (s.supp < 60) s.aidT += DT;
    if (s.aidT >= 25) {
      c.treated = true;
      s.aidTarget = -1;
      // ammukset ja kranaatit talteen
      if (c.w.id === s.w.id || ((c.w.kind === 'rifle') === (s.w.kind === 'rifle') && c.w.v0 === s.w.v0)) { s.ammo += c.ammo + c.mag; c.ammo = 0; c.mag = 0; }
      s.grenades += c.grenades; c.grenades = 0;
      if (s.side === 0) this.msg(0, `${s.rank} ${s.name} sitoi ${c.rank} ${genitive(c.name)} haavat`, 1);
      return { x: s.homeX, z: s.homeZ };
    }
    return { x: s.x, z: s.z };
  }

  // ---------------- moraali ----------------
  private updateMorale(sq: Squad) {
    if (sq.dissolved) return;
    this.medical(sq);
    if (Math.floor(this.time) % 3 === 0 && sq.id === 0) this.updateC2();
    const m = this.squadAlive(sq);
    if (!m.length) { sq.mstate = 4; return; }
    if (sq.veh) { sq.mstate = 0; return; }
    // panssarikauhu: kokematon jalkaväki hermostuu vaunun lähellä
    for (const t of this.soldiers) {
      if (!t.veh || t.side === sq.side || !this.alive(t) || !this.sideSees(sq.side, t.id)) continue;
      const c = this.squadCenter(sq);
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d < 160) sq.morale -= 0.07 * (1 - d / 160) * sq.exp;
    }
    let avgS = 0, pinned = 0;
    for (const id of m) { const s = this.soldiers[id]; avgS += s.supp; if (s.supp > 72) pinned++; }
    avgS /= m.length;
    const leaderOk = sq.leader >= 0 && this.alive(this.soldiers[sq.leader]);
    const cap = sq.baseMorale - (leaderOk ? 0 : 12) - sq.casualties * 2;
    if (avgS < 20) sq.morale = Math.min(cap, sq.morale + 0.12 * (leaderOk ? 1.3 : 0.8) * (sq.c2 ? 1.3 : 0.6));
    else if (avgS > 60) sq.morale -= 0.25;
    if (m.length / sq.members.length < 0.35) sq.morale = Math.min(sq.morale, 32);
    const prev = sq.mstate;
    let st = 0;
    if (sq.morale < 12) st = 4;
    else if (sq.morale < 28) st = 3;
    else if (avgS > 58 || pinned > m.length / 2) st = 2;
    else if (sq.morale < 55 || avgS > 30) st = 1;
    if (prev >= 3 && st < 3 && (sq.morale < 38 || this.enemyWithin(sq, 50))) st = prev;
    sq.mstate = st;
    if (st >= 3 && !sq.retreating) this.retreat(sq, st === 4);
    if (st < 3 && prev >= 3) { sq.retreating = false; sq.path = []; sq.orders = []; this.arrive(sq); if (sq.side === 0) this.msg(0, `${sq.short} on koonnut itsensä`, 1); }
    if (st !== prev && sq.side === 0 && st >= 2) this.msg(0, `${sq.short}: ${MSTATE_NAMES[st].toLowerCase()}`, st >= 3 ? 3 : 2);
    if (st !== prev && sq.side === 1 && st >= 3) this.msg(1, `Vihollisryhmä vetäytyy`, 4);
    // pakenijat poistuvat kartan reunalta
    if (st === 4) for (const id of m) {
      const s = this.soldiers[id];
      if ((s.side === 0 && s.z > MAP_D - 6) || (s.side === 1 && s.z < 6)) { s.out = true; this.casualties[s.side]++; }
    }
  }
  enemyWithin(sq: Squad, r: number) {
    const c = this.squadCenter(sq);
    return this.soldiers.some((e) => e.side !== sq.side && this.alive(e) && Math.hypot(e.x - c.x, e.z - c.z) < r && this.sideSeen[sq.side][e.id] > this.time - 15);
  }
  retreat(sq: Squad, rout: boolean) {
    const c = this.squadCenter(sq);
    const th = this.nearestThreat(sq);
    let dx = 0, dz = sq.side === 0 ? 1 : -1;
    if (th && !rout) {
      const ax = c.x - th.x, az = c.z - th.z, l = Math.hypot(ax, az) || 1;
      dx = ax / l * 0.6; dz = az / l * 0.6 + (sq.side === 0 ? 0.4 : -0.4);
    }
    const l = Math.hypot(dx, dz);
    const dist = rout ? 800 : 70;
    let gx = clamp(c.x + (dx / l) * dist, 4, MAP_W - 4), gz = clamp(c.z + (dz / l) * dist, 3, MAP_D - 3);
    if (rout) gz = sq.side === 0 ? MAP_D - 2 : 2;
    sq.target = null;
    sq.face = null;
    this.setOrders(sq, [{ x: gx, z: gz, mode: rout ? 'fast' : 'quick' }]);
    sq.retreating = true;
  }

  decaySounds() {
    for (let i = 0; i < 2; i++) this.sounds[i] = this.sounds[i].filter((c) => this.time - c.t < 45);
  }

  updateObjectives() {
    for (const o of this.objectives) {
      const cnt = [0, 0];
      for (const s of this.soldiers) {
        if (!this.alive(s) || this.squads[s.squad].mstate >= 3) continue;
        if (Math.hypot(s.x - o.x, s.z - o.z) < o.r) cnt[s.side]++;
      }
      if (cnt[0] > 0 && cnt[1] === 0) o.owner = 0;
      else if (cnt[1] > 0 && cnt[0] === 0) o.owner = 1;
      else if (cnt[0] > 0 && cnt[1] > 0) o.owner = -1;
      else if (o.owner === -1) o.owner = 1; // oletuksena puolustajan
    }
  }
  score() {
    const pts = [0, 0];
    for (const o of this.objectives) if (o.owner >= 0) pts[o.owner] += o.pts;
    // tappiot: kaatunut tai paennut 15, hoitamaton vakavasti haavoittunut 15, hoidettu 8, tuhottu vaunu +60
    for (const s of this.soldiers) {
      const other = 1 - s.side;
      if (s.out || s.state === ST_DEAD) pts[other] += 15;
      else if (s.state === ST_INCAP) pts[other] += s.treated ? 8 : 15;
      if (s.veh && s.veh.ko) pts[other] += 60;
    }
    return pts;
  }

  // Simuloi koko minuutin kerralla (käytetään testeissä)
  runTurn() {
    this.beginTurn();
    for (let i = 0; i < TICKS; i++) this.tick();
    this.endTurn();
  }
}

// ---------------- matematiikka ----------------
export function turnTo(a: number, b: number, max: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -max, max);
}

function pointSeg3(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t, pz - az - dz * t);
}

// Lähimmät pisteet kahden janan välillä (Ericson). s = param luodin janalla, t = param ruumiin akselilla.
const segRes = { d: 0, s: 0, t: 0 };
function segSeg(p1x: number, p1y: number, p1z: number, q1x: number, q1y: number, q1z: number,
  p2x: number, p2y: number, p2z: number, q2x: number, q2y: number, q2z: number) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  const c = d1x * rx + d1y * ry + d1z * rz;
  const b = d1x * d2x + d1y * d2y + d1z * d2z;
  const den = a * e - b * b;
  s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
  else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  const cx = p1x + d1x * s - (p2x + d2x * t), cy = p1y + d1y * s - (p2y + d2y * t), cz = p1z + d1z * s - (p2z + d2z * t);
  segRes.d = Math.sqrt(cx * cx + cy * cy + cz * cz); segRes.s = s; segRes.t = t;
  return segRes;
}

export function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Suomen genetiivi vieraille sukunimille: Müller → Müllerin, Lange → Langen.
export function genitive(n: string) { return /[aeiouyäö]$/i.test(n) ? n + 'n' : n + 'in'; }

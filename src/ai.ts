// Puolustajan (puna-armeija) tekoäly. Kutsutaan 5 sekunnin välein simulaation aikana.
import { Sim, Squad } from './sim';
import { nationOf } from './data';
import { MAP_D } from './terrain';
import { clamp } from './rng';

export function sovietAI(sim: Sim) {
  const t = sim.time;
  tankHunters(sim);
  const germans = sim.soldiers.filter((e) => e.side === 0 && sim.alive(e) && sim.sideSeen[1][e.id] > t - 25);
  const known = germans.map((e) => ({ id: e.id, x: sim.lastPos[1][e.id * 2], z: sim.lastPos[1][e.id * 2 + 1] }));
  for (const sq of sim.squads) {
    if (sq.side !== 1) continue;
    const alive = sim.squadAlive(sq);
    if (!alive.length || sq.mstate >= 3 || sq.retreating) continue;
    const c = sim.squadCenter(sq);
    const strength = alive.length / sq.members.length;
    let nd = 1e9, nx = 0, nz = 0;
    for (const k of known) {
      const d = Math.hypot(k.x - c.x, k.z - c.z);
      if (d < nd) { nd = d; nx = k.x; nz = k.z; }
    }
    // tulen alla → vapaa tuli
    if (alive.some((id) => t - sim.soldiers[id].underFireT < 6)) sq.freeFire = true;

    // panssarivaunun tulen alla painutaan kuoppiin, kunnes jalkaväki tulee lähelle
    const tank = sim.soldiers.find((e) => e.veh && e.side === 0 && sim.alive(e) && sim.sideSeen[1][e.id] > t - 20);
    if (tank && sq.ai !== 'atgun') {
      const dT = Math.hypot(tank.x - c.x, tank.z - c.z);
      const infNear = known.some((k) => !sim.soldiers[k.id].veh && Math.hypot(k.x - c.x, k.z - c.z) < 130);
      const wasHidden = sq.hide;
      sq.hide = !sq.moving && dT > 35 && dT < 500 && !infNear && t - sq.tankFireT < (wasHidden ? 35 : 10);
      if (sq.hide && !wasHidden) sim.msg(1, 'Vihollinen painuu suojaan vaunun tulen alla', 4);
    } else sq.hide = false;

    if (sq.ai === 'front' && sq.aiState === 'hold') {
      if ((strength < 0.45 && nd < 110) || (nd < 35 && strength < 0.7 && sq.mstate === 2)) {
        fallBack(sim, sq, c.x, c.z - 70, 'quick');
        sq.aiState = 'fallback';
      }
    } else if (sq.ai === 'reserve') {
      const threatObj = sim.objectives.some((o) => known.some((k) => Math.hypot(k.x - o.x, k.z - o.z) < 75));
      if (sq.aiState === 'hold' && threatObj && strength > 0.6 && sq.morale > 50 && nd < 140) {
        const d = Math.max(1, nd);
        const gx = nx + ((c.x - nx) / d) * 28, gz = nz + ((c.z - nz) / d) * 28;
        sim.setOrders(sq, [{ x: gx, z: gz, mode: 'quick' }]);
        sq.face = Math.atan2(nx - gx, nz - gz);
        sq.aiState = 'counter';
        sim.msg(1, 'Vihollisen reservi liikkeellä', 4);
      } else if (sq.aiState === 'counter' && !sq.moving && nd < 45 && strength > 0.5 && sq.mstate < 2) {
        sim.setOrders(sq, [{ x: nx, z: nz, mode: 'fast' }]);
        sq.aiState = 'assault';
      } else if ((sq.aiState === 'counter' || sq.aiState === 'assault') && strength < 0.4) {
        fallBack(sim, sq, c.x, c.z - 50, 'quick');
        sq.aiState = 'fallback';
      }
    } else if (sq.ai === 'hq') {
      if (sq.aiState === 'hold' && nd < 50) { fallBack(sim, sq, c.x + 20, c.z - 70, 'quick'); sq.aiState = 'fallback'; }
    } else if (sq.ai === 'mg') {
      if (sq.aiState === 'hold' && nd < 40 && strength < 0.7) { fallBack(sim, sq, c.x, c.z - 60, 'quick'); sq.aiState = 'fallback'; }
    }

    // aluetuli äänikontakteihin, jos ketään ei nähdä
    const anyTarget = alive.some((id) => sim.soldiers[id].tgt >= 0);
    if (!anyTarget && sq.freeFire && !sq.moving && (sq.ai === 'mg' || sq.ai === 'front')) {
      const snd = sim.sounds[1].filter((s) => t - s.t < 12 && Math.hypot(s.x - c.x, s.z - c.z) < (sq.ai === 'mg' ? 700 : 350));
      if (snd.length) {
        snd.sort((a, b) => (b.kind === 'Konekivääri' ? 1 : 0) - (a.kind === 'Konekivääri' ? 1 : 0) || b.t - a.t);
        sq.target = { kind: 'area', x: snd[0].x, z: snd[0].z };
        sq.targetUntil = t + 12;
      }
    } else if (sq.target && sq.target.kind === 'area' && t > sq.targetUntil) sq.target = null;
  }
}

function fallBack(sim: Sim, sq: Squad, x: number, z: number, mode: 'quick' | 'move') {
  let gx = clamp(x, 10, 470), gz = clamp(z, 10, MAP_D - 10);
  // vetäydytään mieluiten taloon
  const bi = sim.nearestBuilding(gx, gz, 45);
  if (bi >= 0) { const B = sim.T.buildings[bi]; gx = (B.x0 + B.x1) / 2; gz = (B.z0 + B.z1) / 2; }
  for (let i = 0; i < 8 && !sim.T.walkable(gx, gz); i++) { gx += 5; gz -= 3; }
  sq.face = 0;
  sq.target = null;
  sim.setOrders(sq, [{ x: gx, z: gz, mode }]);
  sim.msg(1, 'Vihollinen siirtyy taaemmas', 4);
}

// Lähitorjunta: 1–2 miestä kasapanoksineen hiipii vaunun kimppuun, jos se on lähellä ilman jalkaväen saattoa.
function tankHunters(sim: Sim) {
  const t = sim.time;
  for (const tk of sim.soldiers) {
    if (!tk.veh || tk.side !== 0 || !sim.alive(tk) || sim.sideSeen[1][tk.id] < t - 10) continue;
    const hunters = sim.soldiers.filter((s) => s.huntTank === tk.id && sim.alive(s));
    if (hunters.length >= 2) continue;
    const escort = sim.soldiers.filter((g) => g.side === 0 && !g.veh && sim.alive(g) && Math.hypot(g.x - tk.x, g.z - tk.z) < 30).length;
    if (escort >= 4 || (escort >= 2 && sim.rng.chance(0.6))) continue;
    const cands = sim.soldiers
      .filter((s) => s.side === 1 && sim.alive(s) && s.huntTank < 0 && !sim.squads[s.squad].gun && (s.pzf > 0 || (nationOf(1) === 'sov' && s.grenades > 0)) && s.supp < 45 && sim.squads[s.squad].mstate < 3
        && (s.w.kind === 'rifle' || s.w.kind === 'semi' || s.w.kind === 'smg') && Math.hypot(s.x - tk.x, s.z - tk.z) < 75)
      .sort((a, b) => Math.hypot(a.x - tk.x, a.z - tk.z) - Math.hypot(b.x - tk.x, b.z - tk.z));
    if (!cands.length) continue;
    cands[0].huntTank = tk.id;
    if (hunters.length === 0) sim.msg(1, 'Vihollisen panssarintorjujia liikkeellä', 4);
  }
}

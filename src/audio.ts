// Äänimoottori. Kaikki äänet syntetisoidaan Web Audio -rajapinnalla; äänitiedostoja ei ole.
// Äänet kytkeytyvät simulaatioon: laukaus kuuluu vasta kun ääni on ehtinyt kuulijalle (343 m/s),
// etäisyys vaimentaa ja tummentaa sitä, ja kaukaiset äänet saavat enemmän kaikua.
import { Shot } from './sim';

const C_SOUND = 343;

interface Prof { cf: number; cq: number; cdec: number; bf: number; bdec: number; boom: number; boomDec: number; gain: number; crack: boolean; }
const P = (o: Prof) => o;
const PROFILES: Record<string, Prof> = {
  rifle: P({ cf: 2600, cq: 0.9, cdec: 0.018, bf: 1800, bdec: 0.07, boom: 110, boomDec: 0.12, gain: 0.55, crack: true }),
  svt: P({ cf: 2900, cq: 0.9, cdec: 0.015, bf: 1900, bdec: 0.06, boom: 115, boomDec: 0.1, gain: 0.5, crack: true }),
  smg: P({ cf: 1600, cq: 1.2, cdec: 0.012, bf: 1200, bdec: 0.05, boom: 140, boomDec: 0.07, gain: 0.36, crack: false }),
  ppd: P({ cf: 1800, cq: 1.2, cdec: 0.011, bf: 1300, bdec: 0.045, boom: 150, boomDec: 0.06, gain: 0.34, crack: true }),
  pistol: P({ cf: 1900, cq: 1.3, cdec: 0.01, bf: 1300, bdec: 0.04, boom: 160, boomDec: 0.05, gain: 0.26, crack: false }),
  lmg: P({ cf: 2300, cq: 0.9, cdec: 0.014, bf: 1600, bdec: 0.05, boom: 100, boomDec: 0.08, gain: 0.5, crack: true }),
  hmg: P({ cf: 2000, cq: 0.8, cdec: 0.016, bf: 1400, bdec: 0.06, boom: 90, boomDec: 0.09, gain: 0.55, crack: true }),
  kwk: P({ cf: 1200, cq: 0.6, cdec: 0.03, bf: 900, bdec: 0.35, boom: 60, boomDec: 0.45, gain: 1.5, crack: true }),
  mg42: P({ cf: 2600, cq: 1.0, cdec: 0.01, bf: 1900, bdec: 0.035, boom: 115, boomDec: 0.05, gain: 0.48, crack: true }),
  pak: P({ cf: 1500, cq: 0.6, cdec: 0.03, bf: 1000, bdec: 0.4, boom: 55, boomDec: 0.5, gain: 1.7, crack: true }),
  pzf: P({ cf: 700, cq: 0.7, cdec: 0.06, bf: 500, bdec: 0.25, boom: 80, boomDec: 0.15, gain: 0.7, crack: false }),
  pst: P({ cf: 1700, cq: 0.6, cdec: 0.025, bf: 1100, bdec: 0.3, boom: 70, boomDec: 0.38, gain: 1.35, crack: true }),
};
const WEAPON_PROF: Record<string, string> = {
  k98: 'rifle', mosin: 'rifle', svt: 'svt', mp40: 'smg', ppd: 'ppd', p08: 'pistol', tt: 'pistol',
  mg34: 'lmg', dp: 'lmg', tankmg: 'lmg', maxim: 'hmg', kwk38: 'kwk', pst45: 'pst',
  ppsh: 'ppd', mosinpu: 'rifle', dt_t: 'lmg', zis53: 'kwk', mg42: 'mg42', mg42l: 'mg42', g43: 'svt', p38: 'pistol', pak40: 'pak', pzf: 'pzf',
};

export class Audio {
  ctx: BaseAudioContext | null = null;
  enabled = true;
  private bus!: GainNode;      // kuivat äänet
  private verb!: ConvolverNode; // yhteinen kaiku
  private master!: GainNode;
  private noise!: AudioBuffer;
  private ends: number[] = [];
  L = { x: 0, y: 0, z: 0, rx: 1, rz: 0 }; // kuuntelija ja oikea suunta
  lastCombat = -999;
  private nextBird = 3;
  private nextRumble = 25;
  private eng: { in: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode; o1: OscillatorNode; o2: OscillatorNode; ng: GainNode; wet: GainNode } | null = null;
  count = 0; // laukaistut äänet (testejä varten)

  init(ctx?: BaseAudioContext) {
    if (this.ctx) { if ((this.ctx as AudioContext).resume) (this.ctx as AudioContext).resume().catch(() => {}); return; }
    try {
      this.ctx = ctx ?? new AudioContext();
    } catch { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -9; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25; comp.knee.value = 8;
    comp.connect(this.master).connect(c.destination);
    this.bus = c.createGain();
    this.bus.connect(comp);
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(2.4);
    const vg = c.createGain(); vg.gain.value = 0.55;
    this.verb.connect(vg).connect(comp);
    // valkoinen kohina
    const n = c.sampleRate * 2;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.buildEngine();
    this.buildWind();
  }
  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  // Ulkotilan kaiku: harvat varhaiset heijastukset (metsänreuna, talot) ja tumma, hiipuva jälkikaiku.
  private impulse(sec: number) {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / c.sampleRate;
        lp += 0.12 * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-t / 0.55) * (t < 0.03 ? t / 0.03 : 1) * 1.6;
      }
      for (const [t, g] of [[0.06, 0.5], [0.13, 0.35], [0.24, 0.28], [0.41, 0.2]]) {
        const i0 = Math.floor((t + ch * 0.011) * c.sampleRate);
        for (let k = 0; k < 220; k++) d[i0 + k] += (Math.random() * 2 - 1) * g * Math.exp(-k / 60);
      }
    }
    return b;
  }

  setListener(x: number, y: number, z: number, yaw: number) {
    this.L.x = x; this.L.y = y; this.L.z = z;
    this.L.rx = Math.cos(yaw); this.L.rz = -Math.sin(yaw);
  }
  dist(x: number, y: number, z: number) { return Math.hypot(x - this.L.x, (y - this.L.y) * 0.6, z - this.L.z); }

  // Äänen ketju: tulo → etäisyyssuodin → panorointi → kuiva + kaiku.
  private voice(x: number, y: number, z: number, base: number, when: number, dur: number) {
    const c = this.ctx!;
    const d = this.dist(x, y, z);
    const g = base / (1 + d / 18);
    if (g < 0.004) return null;
    const now = c.currentTime;
    this.ends = this.ends.filter((e) => e > now);
    if (this.ends.length > 52 || (this.ends.length > 30 && g < 0.05)) return null;
    this.ends.push(when + dur);
    this.count++;
    const inp = c.createGain(); inp.gain.value = g;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.value = Math.max(450, 17000 * Math.exp(-d / 210));
    const pan = c.createStereoPanner();
    const dx = x - this.L.x, dz = z - this.L.z, dl = Math.hypot(dx, dz) || 1;
    pan.pan.value = Math.max(-0.85, Math.min(0.85, (dx * this.L.rx + dz * this.L.rz) / dl * 0.85 * Math.min(1, dl / 6)));
    const wetA = 0.12 + 0.55 * Math.min(1, d / 450);
    const dry = c.createGain(); dry.gain.value = 1 - wetA * 0.55;
    const wet = c.createGain(); wet.gain.value = wetA;
    inp.connect(lp).connect(pan);
    pan.connect(dry).connect(this.bus);
    pan.connect(wet).connect(this.verb);
    return { inp, d };
  }

  // ---------- rakennuspalikat ----------
  private burst(dest: AudioNode, t: number, type: BiquadFilterType, f: number, dec: number, g: number, o: { q?: number; f1?: number; a?: number; rate?: number } = {}) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true; src.playbackRate.value = o.rate ?? 1;
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = o.q ?? 0.7;
    flt.frequency.setValueAtTime(f, t);
    if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, t + dec * 3);
    const env = c.createGain();
    const a = o.a ?? 0.0015;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + a);
    env.gain.setTargetAtTime(0, t + a, dec);
    src.connect(flt).connect(env).connect(dest);
    src.start(t, Math.random() * 1.8);
    src.stop(t + a + dec * 7);
    return a + dec * 7;
  }
  private tone(dest: AudioNode, t: number, f0: number, f1: number, dur: number, g: number, type: OscillatorType = 'sine', a = 0.003) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + a);
    env.gain.setTargetAtTime(0, t + a, dur / 3);
    o.connect(env).connect(dest);
    o.start(t); o.stop(t + a + dur * 2.2);
    return dur * 2.2;
  }

  // ---------- äänet ----------
  gunshot(wid: string, x: number, y: number, z: number, when: number) {
    const p = PROFILES[WEAPON_PROF[wid] ?? 'rifle'];
    const v = this.voice(x, y, z, p.gain, when, 2.5);
    if (!v) return;
    const r = 1 + (Math.random() - 0.5) * 0.1;
    const t = when;
    this.burst(v.inp, t, 'bandpass', p.cf * r, p.cdec, 1.0, { q: p.cq });
    this.burst(v.inp, t, 'lowpass', p.bf * r, p.bdec, 0.75, { f1: p.bf * 0.35 });
    this.tone(v.inp, t, p.boom * r, p.boom * 0.45, p.boomDec, 0.9);
    if (p.gain > 1) this.burst(v.inp, t + 0.02, 'lowpass', 300, 0.6, 0.6); // tykin pitkä jyrähdys
    if (wid === 'pzf') this.burst(v.inp, t + 0.03, 'bandpass', 1400, 0.35, 0.7, { q: 0.8, f1: 500 }); // ajopanoksen sihahdus
    if (v.d < 450) this.lastCombat = this.ctx!.currentTime;
  }
  // Yliääninen luoti ohittaa kuulijan: terävä N-aallon napsahdus.
  crack(x: number, y: number, z: number, when: number, big: boolean) {
    const v = this.voice(x, y, z, big ? 1.1 : 0.42, when, 0.3);
    if (!v) return;
    this.burst(v.inp, when, 'highpass', 1800, 0.0035, 1.0, { a: 0.0005 });
    this.tone(v.inp, when, 3200, 1900, 0.012, 0.5, 'triangle', 0.0005);
    if (big) this.burst(v.inp, when, 'bandpass', 700, 0.05, 0.8, { q: 0.8 });
  }
  explosion(x: number, y: number, z: number, size: number, when: number) {
    const c = this.ctx!;
    if (size < 0.7) {
      // savukranaatin vaimea pamahdus ja sihinä
      const v = this.voice(x, y, z, 0.55, when, 3);
      if (!v) return;
      this.burst(v.inp, when, 'lowpass', 900, 0.04, 0.9);
      this.burst(v.inp, when + 0.06, 'highpass', 3500, 0.7, 0.18, { a: 0.08 });
      return;
    }
    const s = size;
    const v = this.voice(x, y, z, 0.95 * Math.pow(s, 0.85), when, 4 + s);
    if (!v) return;
    this.burst(v.inp, when, 'lowpass', 2600 / Math.pow(s, 0.4), 0.12 * Math.pow(s, 0.6) + 0.06, 1.0, { f1: 250 });
    this.burst(v.inp, when + 0.01, 'lowpass', 650 / Math.pow(s, 0.3), 0.45 * Math.pow(s, 0.5), 0.8);
    this.tone(v.inp, when, 75 / Math.pow(s, 0.25), 26, 0.25 + 0.22 * s, 1.0);
    // lähellä: multaa ja sirpaleita sataa
    if (v.d < 90) for (let k = 0; k < 8 + s * 4; k++) this.burst(v.inp, when + 0.35 + Math.random() * (0.8 + s * 0.4), 'highpass', 2200 + Math.random() * 2000, 0.006, 0.12 * (1 - v.d / 90));
    if (v.d < 600) this.lastCombat = c.currentTime;
  }
  impact(kind: number, x: number, y: number, z: number, when: number) {
    if (kind === 3) {
      // luoti tai ammus panssariin: metallinen kalahdus
      const v = this.voice(x, y, z, 0.6, when, 1.5);
      if (!v) return;
      const r = 1 + (Math.random() - 0.5) * 0.15;
      for (const [f, g, dd] of [[523, 0.5, 0.5], [1247, 0.35, 0.35], [1985, 0.25, 0.25], [2870, 0.18, 0.15]]) this.tone(v.inp, when, f * r, f * r * 0.98, dd, g, 'triangle', 0.0008);
      this.burst(v.inp, when, 'highpass', 2500, 0.006, 0.8);
      return;
    }
    if (this.dist(x, y, z) > 40) return;
    const v = this.voice(x, y, z, kind === 1 ? 0.3 : 0.22, when, 0.3);
    if (!v) return;
    if (kind === 1) this.burst(v.inp, when, 'bandpass', 950, 0.025, 1, { q: 2.2 }); // puu
    else this.burst(v.inp, when, 'lowpass', 750, 0.02, 1); // multa
  }
  sfx(code: number, x: number, y: number, z: number, when: number) {
    if (code === 1) {
      // heitin: ontto tömähdys
      const v = this.voice(x, y, z, 0.6, when, 1);
      if (!v) return;
      this.tone(v.inp, when, 190, 85, 0.12, 1);
      this.burst(v.inp, when, 'bandpass', 420, 0.05, 0.7, { q: 1.6 });
    } else if (code === 2 || code === 3) {
      // tulevan kranaatin vihellys: alkaa ennen iskemää, korkeus laskee
      const dur = code === 2 ? 2.0 : 1.1;
      if (this.dist(x, y, z) > (code === 2 ? 320 : 120)) return;
      const v = this.voice(x, y, z, code === 2 ? 1.6 : 0.8, when - dur, dur + 0.2);
      if (!v) return;
      const c = this.ctx!;
      const t0 = Math.max(c.currentTime, when - dur);
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(code === 2 ? 1500 : 1900, t0);
      o.frequency.exponentialRampToValueAtTime(code === 2 ? 520 : 800, when);
      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(0.35, when - 0.03);
      env.gain.linearRampToValueAtTime(0, when);
      o.connect(env).connect(v.inp);
      o.start(t0); o.stop(when + 0.02);
    } else if (code === 4 || code === 5) {
      const v = this.voice(x, y, z, code === 5 ? 0.7 : 0.45, when, 3);
      if (!v) return;
      for (let k = 0; k < (code === 5 ? 3 : 1); k++) {
        this.burst(v.inp, when + k * 0.12, 'lowpass', 1100, 0.03, 0.9);
        this.burst(v.inp, when + k * 0.12 + 0.05, 'highpass', 3800, 0.6, 0.15, { a: 0.06 });
      }
    } else if (code === 6) {
      // läpäisy: kumea metallinen rysähdys
      const v = this.voice(x, y, z, 1.0, when, 2);
      if (!v) return;
      this.tone(v.inp, when, 240, 120, 0.4, 0.8, 'triangle');
      this.burst(v.inp, when, 'lowpass', 1200, 0.15, 0.9);
    } else if (code === 7) {
      // vaunun ammukset räjähtävät sisällä
      for (let k = 0; k < 6; k++) this.explosion(x, y, z, k === 0 ? 2 : 0.8 + Math.random() * 0.6, when + 0.4 + k * (0.3 + Math.random() * 1.2));
    }
  }

  // ---------- toisto ----------
  // Käy vuoron tapahtumat läpi: ääni laukaistaan, kun se ehtii kuulijalle toistoajan ikkunassa (prev, cur].
  playback(shots: Shot[], impacts: number[], explos: number[], sfx: number[], prev: number, cur: number, speed: number) {
    if (!this.ctx || !this.enabled) return;
    if (cur <= prev || cur - prev > 0.5 * Math.max(1, speed)) return;
    const now = this.ctx.currentTime + 0.03;
    const at = (ta: number) => now + (ta - prev) / speed;
    const L = this.L;
    for (const s of shots) {
      if (s.t0 > cur || s.t0 < prev - 4) continue;
      const d = this.dist(s.x0, s.y0, s.z0);
      const ta = s.t0 + d / C_SOUND;
      if (ta > prev && ta <= cur) this.gunshot(s.w, s.x0, s.y0, s.z0, at(ta));
      // ohilento lähellä kuulijaa
      const p = PROFILES[WEAPON_PROF[s.w] ?? 'rifle'];
      if (!p.crack) continue;
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0, dz = s.z1 - s.z0;
      const l2 = dx * dx + dy * dy + dz * dz;
      if (l2 < 1) continue;
      const u = Math.max(0, Math.min(1, ((L.x - s.x0) * dx + (L.y - s.y0) * dy + (L.z - s.z0) * dz) / l2));
      if (u <= 0.02 || u >= 0.99) continue;
      const px = s.x0 + dx * u, py = s.y0 + dy * u, pz = s.z0 + dz * u;
      const dm = Math.hypot(px - L.x, py - L.y, pz - L.z);
      if (dm > 22) continue;
      const tc = s.t0 + u * (s.t1 - s.t0) + dm / C_SOUND;
      if (tc > prev && tc <= cur) this.crack(px, py, pz, at(tc), p.gain > 1);
    }
    for (let i = 0; i < impacts.length; i += 5) {
      const t = impacts[i];
      if (t > cur || t < prev - 3) continue;
      const ta = t + this.dist(impacts[i + 1], impacts[i + 2], impacts[i + 3]) / C_SOUND;
      if (ta > prev && ta <= cur) this.impact(impacts[i + 4], impacts[i + 1], impacts[i + 2], impacts[i + 3], at(ta));
    }
    for (let i = 0; i < explos.length; i += 5) {
      const t = explos[i];
      if (t > cur || t < prev - 4) continue;
      const ta = t + this.dist(explos[i + 1], explos[i + 2], explos[i + 3]) / C_SOUND;
      if (ta > prev && ta <= cur) this.explosion(explos[i + 1], explos[i + 2], explos[i + 3], explos[i + 4] || 1, at(ta));
    }
    for (let i = 0; i < sfx.length; i += 5) {
      const code = sfx[i + 1];
      // vihellys alkaa ennen iskemää: laukaistaan etukäteen
      const lead = code === 2 ? 2.0 * speed : code === 3 ? 1.1 * speed : 0;
      const t = sfx[i] - lead;
      if (t > cur || t < prev - 4) continue;
      const ta = t + (lead ? 0 : this.dist(sfx[i + 2], sfx[i + 3], sfx[i + 4]) / C_SOUND);
      if (ta > prev && ta <= cur) this.sfx(code, sfx[i + 2], sfx[i + 3], sfx[i + 4], at(ta) + lead / speed);
    }
  }

  // ---------- jatkuvat äänet ----------
  private buildEngine() {
    const c = this.ctx!;
    const inp = c.createGain(); inp.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.3;
    const pan = c.createStereoPanner();
    const mix = c.createGain(); mix.gain.value = 1;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 30;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 45;
    const g1 = c.createGain(); g1.gain.value = 0.5;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    // sylinterien tykytys
    const lfo = c.createOscillator(); lfo.frequency.value = 11;
    const lfoG = c.createGain(); lfoG.gain.value = 0.22;
    lfo.connect(lfoG).connect(mix.gain);
    const nsrc = c.createBufferSource(); nsrc.buffer = this.noise; nsrc.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 420; nf.Q.value = 0.4;
    const ng = c.createGain(); ng.gain.value = 0.05;
    o1.connect(g1).connect(mix); o2.connect(g2).connect(mix);
    nsrc.connect(nf).connect(ng).connect(mix);
    mix.connect(inp).connect(lp).connect(pan).connect(this.bus);
    const wet = c.createGain(); wet.gain.value = 0.2;
    pan.connect(wet).connect(this.verb);
    o1.start(); o2.start(); lfo.start(); nsrc.start();
    this.eng = { in: inp, lp, pan, o1, o2, ng, wet };
  }
  // Panssarivaunun moottori ja telat: kuuluu kauas, voimistuu liikkeessä.
  engine(x: number, y: number, z: number, alive: boolean, moving: boolean) {
    if (!this.ctx || !this.eng) return;
    const e = this.eng, t = this.ctx.currentTime;
    const d = this.dist(x, y, z);
    const base = !alive ? 0 : moving ? 0.5 : 0.1;
    e.in.gain.setTargetAtTime(this.enabled ? base / (1 + d / 25) : 0, t, 0.25);
    e.o1.frequency.setTargetAtTime(moving ? 41 : 28, t, 0.6);
    e.o2.frequency.setTargetAtTime(moving ? 62 : 42, t, 0.6);
    e.ng.gain.setTargetAtTime(moving ? 0.2 : 0.015, t, 0.4); // telojen kolina
    e.lp.frequency.setTargetAtTime(Math.max(120, (moving ? 520 : 260) * Math.exp(-d / 260)), t, 0.2);
    const dx = x - this.L.x, dz = z - this.L.z, dl = Math.hypot(dx, dz) || 1;
    e.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, (dx * this.L.rx + dz * this.L.rz) / dl * 0.8)), t, 0.1);
  }
  private wind: GainNode | null = null;
  private buildWind() {
    const c = this.ctx!;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.5;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.3;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 400; f2.Q.value = 0.3;
    const g = c.createGain(); g.gain.value = 0.014;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.09;
    const lg = c.createGain(); lg.gain.value = 0.008;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(f2).connect(g).connect(this.bus);
    src.start(); lfo.start();
    this.wind = g;
  }
  // Kesäaamu: linnut laulavat kunnes taistelu alkaa; kaukaa kuuluu rintaman jylinää.
  ambient(dt: number) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, now = c.currentTime;
    this.nextBird -= dt; this.nextRumble -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 4 + Math.random() * 9;
      if (now - this.lastCombat > 45) this.bird(now + 0.05);
    }
    if (this.nextRumble <= 0) {
      this.nextRumble = 18 + Math.random() * 35;
      const pan = c.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.4;
      const g = c.createGain(); g.gain.value = 0.22;
      g.connect(pan); pan.connect(this.verb);
      const p2 = c.createGain(); p2.gain.value = 0.4; pan.connect(p2).connect(this.bus);
      const n = 1 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        const t = now + k * (0.6 + Math.random() * 1.8);
        this.burst(g, t, 'lowpass', 140, 0.9, 0.9);
        this.tone(g, t, 45, 24, 1.2, 0.6);
      }
    }
  }
  private bird(t: number) {
    const c = this.ctx!;
    const pan = c.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.6;
    const g = c.createGain(); g.gain.value = 0.008 + Math.random() * 0.007;
    const soft = c.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 3200; soft.Q.value = 0.3;
    g.connect(soft).connect(pan);
    const dry = c.createGain(); dry.gain.value = 0.5; pan.connect(dry).connect(this.bus);
    const wet = c.createGain(); wet.gain.value = 0.9; pan.connect(wet).connect(this.verb); // kaukana metsässä
    const notes = 3 + Math.floor(Math.random() * 5);
    const f0 = 1900 + Math.random() * 1100;
    for (let k = 0; k < notes; k++) {
      const tt = t + k * (0.09 + Math.random() * 0.07);
      const o = c.createOscillator();
      o.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.25), tt);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.15 + Math.random() * 0.3), tt + 0.03);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.85, tt + 0.07);
      const e = c.createGain();
      e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(1, tt + 0.02); e.gain.linearRampToValueAtTime(0, tt + 0.075);
      o.connect(e).connect(g);
      o.start(tt); o.stop(tt + 0.08);
    }
  }
}

// Pelin kulku (WeGo), syöte, kamera ja HUD.
import { Sim, Squad, Soldier, Mode, MODE_NAMES, MSTATE_NAMES, STATE_NAMES, DT, TICKS, FSTRIDE, ST_INCAP, ST_DEAD, ST_WOUNDED, P_PRONE } from './sim';
import { Renderer, MODE_COLORS } from './render';
import { SCENARIO, sideName, VEHICLES, WEAPONS } from './data';
import { sovietAI } from './ai';
import { Audio } from './audio';
import { clamp } from './rng';
import { GROUND_NAMES, MAP_W, MAP_D } from './terrain';

type Phase = 'briefing' | 'orders' | 'computing' | 'playback' | 'end';
type OMode = Mode | 'target' | 'face' | 'smoke' | 'arty' | 'artysmoke' | null;

const $ = (id: string) => document.getElementById(id)!;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const MS_CLASS = ['ok', 'warn', 'warn', 'bad', 'bad'];

export class Game {
  sim: Sim;
  R: Renderer;
  phase: Phase = 'briefing';
  sel = -1;
  omode: OMode = null;
  playT = 0;
  playing = true;
  speed = 1;
  replay = false;
  canvas: HTMLCanvasElement;
  keys = new Set<string>();
  mouse = { x: 0, y: 0, down: -1, sx: 0, sy: 0, moved: false };
  touches = new Map<number, { x: number; y: number }>();
  pinch = { d: 0, a: 0 };
  hover = -1;
  labels: HTMLElement[] = [];
  objLabels: HTMLElement[] = [];
  lastT = performance.now();
  logShown = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // kartta on aina sama, puolustajan ryhmitys arvotaan joka pelissä
    this.sim = new Sim(1941, Math.floor(Math.random() * 1e6));
    this.sim.aiHook = sovietAI;
    this.R = new Renderer(canvas, this.sim);
    this.buildHud();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.showBriefing();
    this.refreshPaths();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------- HUD ----------------
  private buildHud() {
    $('scn-title').textContent = SCENARIO.title;
    $('scn-date').textContent = SCENARIO.date;
    // joukkoluettelo
    $('oob-list').innerHTML = '';
    this.syncSquadUI();
    const layer = $('labels');
    for (const o of this.sim.objectives) {
      const el = document.createElement('div');
      el.className = 'obj-label';
      el.textContent = o.name;
      layer.appendChild(el);
      this.objLabels.push(el);
    }
    // käskynapit
    const ob = $('order-buttons');
    const groups: [string, [string, string, string][]][] = [
      ['Liike', [['move', 'Liiku', '1'], ['quick', 'Nopea', '2'], ['fast', 'Ryntäys', '3'], ['hunt', 'Etsi', '4'], ['slow', 'Ryömi', '5']]],
      ['Tuli', [['target', 'Tuli', 'T'], ['cease', 'Lopeta tuli', 'G']]],
      ['Tuki', [['smoke', 'Savu', 'V'], ['arty', 'Tykistö', 'B'], ['artysmoke', 'Tykistösavu', 'N']]],
      ['Muut', [['face', 'Suunta', 'Y'], ['hide', 'Piiloudu', 'H'], ['hatch', 'Luukut auki', 'L'], ['split', 'Jaa tiimeihin', 'J'], ['clear', 'Poista käskyt', '⌫']]],
    ];
    ob.innerHTML = '';
    for (const [title, btns] of groups) {
      const g = document.createElement('div');
      g.className = 'ogroup';
      g.innerHTML = `<span class="olabel">${title}</span>`;
      for (const [id, name, key] of btns) {
        const b = document.createElement('button');
        b.className = 'obtn';
        b.id = 'ob-' + id;
        const c = MODE_COLORS[id];
        b.innerHTML = `${c !== undefined ? `<i style="background:${hex(c)}"></i>` : ''}<span>${name}</span><kbd>${key}</kbd>`;
        b.addEventListener('click', () => this.orderButton(id));
        g.appendChild(b);
      }
      ob.appendChild(g);
    }
    $('btn-go').addEventListener('click', () => this.mainAction());
    $('btn-replay').addEventListener('click', () => this.startReplay());
    try { if (localStorage.getItem('bobr-sound') === '0') this.audio.enabled = false; } catch { /* oletus päällä */ }
    $('btn-sound').addEventListener('click', () => this.toggleSound());
    $('btn-start').addEventListener('click', () => { this.startAudio(); $('brief').hidden = true; this.phase = 'orders'; this.select(1); this.updateHud(); });
    $('pb-play').addEventListener('click', () => { this.playing = !this.playing; this.updatePlayback(); });
    $('pb-skip').addEventListener('click', () => { this.playT = 60; });
    for (const sp of [0.5, 1, 2, 4]) {
      const b = document.createElement('button');
      b.className = 'spd';
      b.textContent = sp + '×';
      b.addEventListener('click', () => { this.speed = sp; this.updatePlayback(); });
      $('pb-speeds').appendChild(b);
    }
    const slider = $('pb-slider') as HTMLInputElement;
    slider.addEventListener('input', () => { this.playT = parseFloat(slider.value); this.audioT = this.playT; this.playing = false; this.updatePlayback(); });
    $('btn-again').addEventListener('click', () => location.reload());
    $('btn-pick').addEventListener('click', () => { try { history.replaceState(null, '', location.pathname + location.search); } catch { location.hash = ''; } location.reload(); });
    $('btn-showmap').addEventListener('click', () => { $('end').hidden = true; });
    $('tog-oob').addEventListener('click', () => document.body.classList.toggle('show-oob'));
    $('tog-log').addEventListener('click', () => document.body.classList.toggle('show-log'));
    $('btn-help').addEventListener('click', () => { $('help').hidden = !$('help').hidden; });
    $('btn-roofs').addEventListener('click', () => this.toggleRoofs());
    $('help-close').addEventListener('click', () => { $('help').hidden = true; });
  }

  private showBriefing() {
    $('brief-title').textContent = SCENARIO.title;
    $('brief-meta').textContent = `${SCENARIO.date} · ${SCENARIO.place}`;
    $('brief-text').innerHTML = SCENARIO.briefing.map((p) => `<p>${p}</p>`).join('');
    $('force-own').innerHTML = `<b>Omat joukot</b>${SCENARIO.forces[0]}`;
    $('force-enemy').innerHTML = `<b>Vihollinen (arvio)</b>${SCENARIO.forces[1]}`;
    $('help-tank').innerHTML = SCENARIO.helpTank;
    $('help-armor').innerHTML = SCENARIO.helpArmor;
    $('oob-title').textContent = 'Oma joukkue · ' + sideName(0);
    $('brief').hidden = false;
  }

  clock() {
    const m = SCENARIO.startMinute + Math.floor((this.sim.time - (this.phase === 'playback' ? 60 - this.playT : 0)) / 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
  }

  updateHud() {
    const sim = this.sim;
    const turnShown = this.phase === 'playback' ? sim.turn - (this.replay ? 1 : 1) : sim.turn;
    $('turn').textContent = `Vuoro ${Math.min(turnShown, SCENARIO.turns)}/${SCENARIO.turns}`;
    $('clock').textContent = 'klo ' + this.clock();
    $('objs').innerHTML = sim.objectives.map((o) => `<span class="chip ${o.owner === 0 ? 'ger' : o.owner === 1 ? 'sov' : 'neu'}">${o.name}<b>${o.owner === 0 ? 'Oma' : o.owner === 1 ? 'Vihollinen' : 'Kiistanalainen'}</b></span>`).join('');
    const go = $('btn-go');
    go.textContent = this.phase === 'orders' ? 'Valmis ▶' : this.phase === 'playback' ? (this.replay ? 'Takaisin käskyihin' : 'Käskyvaihe ▶') : this.phase === 'computing' ? 'Lasketaan…' : '—';
    (go as HTMLButtonElement).disabled = this.phase === 'computing' || this.phase === 'briefing';
    $('btn-replay').hidden = !(this.phase === 'orders' && sim.turn > 1);
    document.body.dataset.phase = this.phase;
    // joukkoluettelo
    for (const sq of sim.squads) {
      if (sq.side !== 0 || sq.dissolved) continue;
      const el = $('oob-' + sq.id);
      const alive = sim.squadAlive(sq).length;
      el.className = 'oob-item' + (this.sel === sq.id ? ' sel' : '') + (sq.parent >= 0 ? ' team' : '');
      const ammo = this.squadAmmo(sq);
      el.innerHTML = `<span class="oob-name">${sq.short}</span><span class="oob-men">${alive}/${sq.members.length}</span>
        ${sq.veh ? (() => { const v = sim.soldiers[sq.members[0]].veh!; const dmg = v.gunDmg || v.crewHits > 0; return `<span class="pill ${v.ko ? 'bad' : v.immob || dmg ? 'warn' : 'ok'}">${v.ko ? 'Tuhottu' : v.immob ? 'Liikuntakyvytön' : dmg ? 'Vaurioitunut' : 'Valmis'}</span>`; })() : `<span class="pill ${MS_CLASS[sq.mstate]}">${MSTATE_NAMES[sq.mstate]}</span>`}
        <span class="oob-sub">${sq.veh ? 'Radio · ' : sq.hq ? '' : sq.c2 ? 'Yhteys johtoon · ' : '<b class="noc2">Ei yhteyttä johtoon</b> · '}${sq.id === 0 ? `Tykistö: ${sim.artyLeft} tulitehtävää · ` : ''}${sq.smokeLeft && !sq.veh ? sq.smokeLeft + ' savukr. · ' : ''}${sq.orders.length ? MODE_NAMES[sq.orders[0].mode] + ' · ' + sq.orders.length + ' rp.' : sq.target ? 'Tulitus' : 'Paikallaan'}${sq.hide ? ' · piilossa' : ''} · ammuksia ${ammo}%</span>`;
    }
    this.updateUnitPanel();
    this.updateOrderButtons();
    this.R.updateObjectives();
  }
  squadAmmo(sq: Squad) {
    let a = 0, m = 0;
    for (const id of sq.members) { const s = this.sim.soldiers[id]; if (s.state >= ST_INCAP) continue; a += s.ammo + s.mag; m += s.w.ammo; }
    return m ? Math.round((a / m) * 100) : 0;
  }
  updateUnitPanel() {
    const panel = $('unit');
    if (this.sel < 0) { panel.hidden = true; return; }
    panel.hidden = false;
    const sq = this.sim.squads[this.sel];
    const sim = this.sim;
    const g = sim.squadCenter(sq);
    const ground = GROUND_NAMES[sim.T.groundAt(g.x, g.z)];
    $('unit-name').textContent = sq.name;
    $('unit-state').className = 'pill ' + MS_CLASS[sq.mstate];
    $('unit-state').textContent = MSTATE_NAMES[sq.mstate];
    if (sq.veh) { const v = sim.soldiers[sq.members[0]].veh!; $('unit-state').className = 'pill ' + (v.ko ? 'bad' : v.immob ? 'warn' : 'ok'); $('unit-state').textContent = v.ko ? 'Tuhottu' : v.immob ? 'Liikuntakyvytön' : 'Valmis'; }
    $('unit-meta').textContent = `${sideName(sq.side)} · ${ground} · moraali ${Math.max(0, Math.round(sq.morale))} · ${sq.hq ? 'joukkueen johto' : sq.c2 ? 'yhteys johtoon' : 'ei yhteyttä johtoon, käskyt viivästyvät'}`;
    if (sq.veh) {
      const t = sim.soldiers[sq.members[0]];
      const v = t.veh!;
      const parts = [v.immob ? 'liikuntakyvytön' : '', v.gunDmg ? 'kanuuna rikki' : '', v.crewHits ? `${v.crewHits} miehistöosuma${v.crewHits > 1 ? 'a' : ''}` : ''].filter(Boolean);
      const cond = v.ko ? 'Tuhottu' : parts.length ? 'Vaurioitunut: ' + parts.join(', ') : 'Toimintakykyinen';
      const sup = Math.round(t.supp);
      $('unit-meta').textContent = `Panssarivaunu · ${ground} · ${v.buttoned ? 'luukut kiinni' : 'johtaja luukusta'}${v.cmdHit ? ' · johtaja haavoittunut' : ''}`;
      $('unit-rows').innerHTML = `
        <tr><td class="rk">Kunto</td><td colspan="2">${cond}</td><td><div class="bar"><i style="width:${sup}%;background:${sup > 40 ? 'var(--warn)' : 'var(--ok)'}"></i></div><small>Osumien paine</small></td></tr>
        <tr><td class="rk">${t.rank}</td><td>${t.name}<small>Vaununjohtaja + ${VEHICLES[v.type].crew - 1} miehistö</small></td><td>${WEAPONS[VEHICLES[v.type].gun].name}<small>${v.gunDmg ? 'vaurioitunut' : t.ammo + ' sirpalekranaattia'}</small></td><td>${WEAPONS[VEHICLES[v.type].mg].name}<small>${v.mgMag + v.mgAmmo} patruunaa</small></td></tr>
        <tr><td class="rk">Panssari</td><td colspan="3">${VEHICLES[v.type].armorText}</td></tr>
        <tr><td class="rk">Ajo</td><td colspan="3">${t.moving ? Math.round(t.speed * 3.6) + ' km/h' : 'Paikallaan'} · tykki ampuu vain pysähdyksistä</td></tr>`;
      return;
    }
    const rows = sq.members.map((id) => {
      const s = sim.soldiers[id];
      const st = s.out ? 'Paennut' : s.state === ST_INCAP ? (s.treated ? 'Vakavasti haav., hoidettu' : 'Vakavasti haav., vuotaa') : s.aidTarget >= 0 ? 'Antaa ensiapua' : STATE_NAMES[s.state];
      const cls = s.state >= ST_INCAP || s.out ? 'dead' : s.state === ST_WOUNDED ? 'wnd' : '';
      const sup = Math.round(s.supp);
      return `<tr class="${cls}" data-id="${id}"><td class="rk">${s.rank}</td><td>${s.name}${id === sq.leader ? ' ★' : ''}<small>${s.role}</small></td>
        <td>${s.w.name}<small>${s.state < ST_INCAP ? (s.mag + ' + ' + s.ammo) : '—'}${s.grenades ? ' · ' + s.grenades + ' kr.' : ''}</small></td>
        <td><div class="bar"><i style="width:${sup}%;background:${sup > 70 ? 'var(--bad)' : sup > 40 ? 'var(--warn)' : 'var(--ok)'}"></i></div><small>${st}${s.kills ? ' · ' + s.kills + ' os.' : ''}</small></td></tr>`;
    });
    $('unit-rows').innerHTML = rows.join('');
  }
  updateOrderButtons() {
    const sq = this.sel >= 0 ? this.sim.squads[this.sel] : null;
    const tank = sq && sq.veh ? this.sim.soldiers[sq.members[0]] : null;
    const can = this.phase === 'orders' && !!sq && sq.mstate < 3 && (!tank || this.sim.alive(tank));
    document.querySelectorAll<HTMLButtonElement>('.obtn').forEach((b) => {
      const id = b.id.slice(3);
      let off = tank ? (id === 'slow' || id === 'hide' || (tank.veh!.immob && ['move', 'quick', 'fast', 'hunt'].includes(id))) : id === 'hatch';
      if (id === 'smoke') off = !sq || sq.smokeLeft <= 0;
      if (id === 'arty' || id === 'artysmoke') off = !sq || sq.id !== 0 || this.sim.artyLeft <= 0;
      if (id === 'split') {
        const team = !!sq && (sq.parent >= 0 || sq.child >= 0);
        off = !sq || (team ? !this.sim.canMerge(sq) : !this.sim.canSplit(sq));
        const lbl = b.querySelector('span');
        if (lbl) lbl.textContent = team ? 'Yhdistä tiimit' : 'Jaa tiimeihin';
      }
      b.disabled = !can || off;
      b.classList.toggle('on', this.omode === id || (id === 'hide' && !!sq && sq.hide) || (id === 'hatch' && !!tank && tank.veh!.hatchOrder));
    });
    const hint = $('hint');
    if (this.phase !== 'orders') hint.textContent = '';
    else if (this.sel < 0) hint.textContent = 'Valitse ryhmä klikkaamalla sen tunnusta tai luettelosta.';
    else if (this.sim.squads[this.sel].mstate >= 3) hint.textContent = 'Ryhmä on murtunut eikä ota vastaan käskyjä.';
    else if (this.sim.squads[this.sel].veh && !this.omode) hint.textContent = 'Vaunu ei pääse metsään eikä taloihin. Luukut auki parantaa näkyvyyttä mutta altistaa johtajan. Pidä jalkaväki lähellä vihollisen lähitorjuntaa vastaan.';
    else if (this.omode === 'target') hint.textContent = 'Klikkaa havaittua vihollista tai maastokohtaa (aluetuli). Viiva näyttää näkyvyyden.';
    else if (this.omode === 'face') hint.textContent = 'Klikkaa suuntaa, johon ryhmä ryhmittyy.';
    else if (this.omode === 'smoke') hint.textContent = 'Klikkaa kohtaa enintään 35 metrin päässä ryhmästä. Savukranaatti heitetään vuoron alussa.';
    else if (this.omode === 'arty' || this.omode === 'artysmoke') hint.textContent = `Klikkaa kohdetta. ${SCENARIO.arty.name}: kohdistuslaukaus 1½–3 min, sitten tehoammunta. Nopeampi ja tarkempi, jos johtaja näkee kohteen. Tulitehtäviä jäljellä ${this.sim.artyLeft}.`;
    else if (this.sim.squads[this.sel].mortar && !this.omode) hint.textContent = 'Heitin ampuu 50–520 m. Se tarvitsee näköyhteyden omalta tiimiltään tai joukkueenjohtajalta (alle 150 m päässä). Asettaminen pysähdyksen jälkeen 15 s.';
    else if (this.omode) hint.textContent = `${MODE_NAMES[this.omode as Mode]}: klikkaa maastoa lisätäksesi reittipisteen. Vaihto pohjassa lisää useita.${this.sim.squads[this.sel].c2 || this.sim.squads[this.sel].veh ? '' : ' Ei yhteyttä johtoon: käsky lähtee liikkeelle 10–18 s viiveellä.'}`;
    else hint.textContent = 'Anna käsky alapalkista tai pikanäppäimillä. Välilyönti päättää käskyvaiheen.';
  }

  roofs = true;
  audio = new Audio();
  audioT = 0;
  // Äänet voi käynnistää vain käyttäjän toimella; valinta muistetaan selaimessa.
  startAudio() {
    this.audio.init();
    this.refreshSoundBtn();
  }
  toggleSound() {
    this.audio.setEnabled(!this.audio.enabled);
    if (this.audio.enabled) this.audio.init();
    try { localStorage.setItem('bobr-sound', this.audio.enabled ? '1' : '0'); } catch { /* ei tallennusta */ }
    this.refreshSoundBtn();
  }
  refreshSoundBtn() {
    const b = $('btn-sound');
    b.setAttribute('aria-pressed', String(this.audio.enabled));
    b.textContent = this.audio.enabled ? 'Ääni' : 'Ääni pois';
  }
  reveal = false;
  toggleRoofs() {
    this.roofs = !this.roofs;
    this.R.setRoofs(this.roofs);
    $('btn-roofs').setAttribute('aria-pressed', String(this.roofs));
  }

  // Luettelo ja karttatunnukset jokaiselle omalle ryhmälle ja tiimille (tiimit lisätään jaettaessa).
  syncSquadUI() {
    const oob = $('oob-list');
    const layer = $('labels');
    for (const sq of this.sim.squads) {
      if (!this.labels[sq.id]) {
        const el = document.createElement('div');
        el.className = 'sq-label';
        el.hidden = sq.side !== 0;
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.select(sq.id); });
        layer.appendChild(el);
        this.labels[sq.id] = el;
      }
      if (sq.side !== 0) continue;
      let b = document.getElementById('oob-' + sq.id);
      if (!b) {
        b = document.createElement('button');
        b.className = 'oob-item';
        b.id = 'oob-' + sq.id;
        b.addEventListener('click', () => { this.select(sq.id); this.focusSquad(sq.id); });
        const after = sq.parent >= 0 ? document.getElementById('oob-' + sq.parent) : null;
        if (after) after.after(b); else oob.appendChild(b);
      }
      b.hidden = sq.dissolved;
      if (sq.dissolved) this.labels[sq.id].hidden = true;
    }
  }

  // ---------------- käskyt ----------------
  orderButton(id: string) {
    if (this.phase !== 'orders' || this.sel < 0) return;
    const sq = this.sim.squads[this.sel];
    if (sq.mstate >= 3) return;
    if (id === 'hide') { sq.hide = !sq.hide; }
    else if (id === 'split') {
      if (sq.parent >= 0 || sq.child >= 0) {
        if (this.sim.mergeTeams(sq)) { this.select(sq.parent >= 0 ? sq.parent : sq.id); this.flash('Tiimit yhdistetty'); }
        else this.flash('Tiimien on oltava paikallaan alle 30 m päässä toisistaan');
      } else {
        const t = this.sim.splitSquad(sq);
        if (t) { this.syncSquadUI(); this.flash(`${sq.baseShort} jaettu: kk-tiimi (${t.members.length}) ja kivääritiimi`); }
      }
      this.syncSquadUI();
    }
    else if (id === 'hatch') { const v = this.sim.soldiers[sq.members[0]].veh; if (v) { v.hatchOrder = !v.hatchOrder; if (!v.hatchOrder) v.buttoned = true; } }
    else if (id === 'clear') { this.sim.clearOrders(sq); sq.target = null; sq.face = null; sq.hide = false; this.omode = null; }
    else if (id === 'cease') { sq.target = null; this.omode = null; }
    else if (id === 'smoke' && sq.veh) {
      const t = this.sim.soldiers[sq.members[0]];
      sq.smokeOrder = { x: t.x - Math.sin(t.heading) * 4, z: t.z - Math.cos(t.heading) * 4 };
      this.flash('Savuheitin laukaistaan vuoron alussa');
    }
    else this.omode = this.omode === id ? null : (id as OMode);
    this.refreshPaths();
    this.updateHud();
  }
  private orderClick(shift: boolean) {
    const sim = this.sim;
    const sq = sim.squads[this.sel];
    const p = this.R.pickGround(this.ndc().x, this.ndc().y);
    if (this.omode === 'smoke') {
      if (!p) return;
      const c = sim.squadCenter(sq);
      if (Math.hypot(p.x - c.x, p.z - c.z) > 35) { this.flash('Liian kaukana, savukranaatin heittomatka on 35 m'); return; }
      sq.smokeOrder = { x: p.x, z: p.z };
      this.omode = null;
    } else if (this.omode === 'arty' || this.omode === 'artysmoke') {
      if (!p) return;
      const err = sim.requestArty(this.omode === 'arty' ? 'he' : 'smoke', p.x, p.z);
      if (err) { this.flash(err); return; }
      const m = sim.arty[sim.arty.length - 1];
      this.flash(`Tulipyyntö lähetetty${m.los ? '' : ' ilman näköyhteyttä'}: kohdistuslaukaus noin ${Math.round((m.tSpot - sim.time) / 60 * 2) / 2} min kuluttua`);
      this.omode = null;
    } else if (this.omode === 'target' && sq.mortar) {
      const enemy = this.pickSoldier(1);
      if (enemy >= 0) { sq.target = { kind: 'unit', id: enemy }; sq.targetUntil = 1e9; }
      else if (p) {
        const c = sim.squadCenter(sq);
        const R = Math.hypot(p.x - c.x, p.z - c.z);
        if (R < 50 || R > 520) { this.flash('Heittimen kantama on 50–520 m'); return; }
        if (!sim.mortarSpotter(sq, p.x, p.z)) { this.flash('Ei tähystystä: tiimi tai joukkueenjohtaja ei näe kohdetta'); return; }
        sq.target = { kind: 'area', x: p.x, z: p.z }; sq.targetUntil = 1e9;
      }
      this.omode = null;
    } else if (this.omode === 'target') {
      const enemy = this.pickSoldier(1);
      if (enemy >= 0) { sq.target = { kind: 'unit', id: enemy }; sq.targetUntil = 1e9; }
      else if (p) {
        const los = this.losFrom(sq, p);
        if (los.block) { this.flash('Ei näkyvyyttä kohteeseen'); return; }
        sq.target = { kind: 'area', x: p.x, z: p.z }; sq.targetUntil = 1e9;
      }
      this.omode = null;
    } else if (this.omode === 'face') {
      if (!p) return;
      const from = sq.orders.length ? sq.orders[sq.orders.length - 1] : sim.squadCenter(sq);
      sq.face = Math.atan2(p.x - from.x, p.z - from.z);
      if (!sq.orders.length) sim.arrive(sq);
      this.omode = null;
    } else if (this.omode && p) {
      if (!sim.canGo(sq, p.x, p.z)) { this.flash(sq.veh ? 'Vaunu ei pääse sinne (metsä, talo tai kartan reuna)' : 'Kohde on rakennuksen sisällä'); return; }
      const wps = [...sq.orders, { x: p.x, z: p.z, mode: this.omode as Mode }];
      sq.face = null;
      sim.setOrders(sq, wps, true);
      if (sq.veh && !sq.path.length) { sim.setOrders(sq, wps.slice(0, -1), true); this.flash('Vaunulle ei löydy reittiä'); }
      if (!shift) this.omode = null;
    }
    this.refreshPaths();
    this.updateHud();
  }
  losFrom(sq: Squad, p: { x: number; y: number; z: number }) {
    const sim = this.sim;
    const L = sim.soldiers[sq.leader >= 0 && sim.alive(sim.soldiers[sq.leader]) ? sq.leader : sim.squadAlive(sq)[0] ?? sq.members[0]];
    const ey = sim.T.h(L.x, L.z) + 1.05;
    const a = { x: L.x, y: ey, z: L.z };
    const b = { x: p.x, y: p.y + 0.6, z: p.z };
    if (sim.T.los(a.x, a.y, a.z, b.x, b.y, b.z) >= 0) return { a, b, block: null as any, d: Math.hypot(b.x - a.x, b.z - a.z) };
    let lo = 0, hi = 1;
    for (let i = 0; i < 9; i++) {
      const m = (lo + hi) / 2;
      if (sim.T.los(a.x, a.y, a.z, a.x + (b.x - a.x) * m, a.y + (b.y - a.y) * m, a.z + (b.z - a.z) * m) >= 0) lo = m; else hi = m;
    }
    const block = { x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo, z: a.z + (b.z - a.z) * lo };
    return { a, b, block, d: Math.hypot(b.x - a.x, b.z - a.z) };
  }
  refreshPaths() {
    const sim = this.sim;
    const list: any[] = [];
    for (const sq of sim.squads) {
      if (sq.side !== 0 || !sim.squadAlive(sq).length) continue;
      const c = sq.moving ? { x: sq.gx, z: sq.gz } : sim.squadCenter(sq);
      const pts = sq.path.map((p) => ({ x: p.x, z: p.z, mode: p.mode, wp: p.wp }));
      let target: { x: number; z: number; kind: string } | null = null;
      if (sq.target) {
        if (sq.target.kind === 'area') target = { x: sq.target.x, z: sq.target.z, kind: 'area' };
        else { const e = sim.soldiers[sq.target.id]; target = { x: e.x, z: e.z, kind: 'target' }; }
      }
      const end = pts.length ? pts[pts.length - 1] : c;
      const face = sq.face !== null && (pts.length || this.sel === sq.id) ? { x: end.x, z: end.z, dir: sq.face } : null;
      list.push({ from: c, pts, target, face, dim: this.sel !== sq.id });
    }
    this.R.setPaths(list);
    // tykistön kohteet ja savukäskyt
    const marks: { x: number; z: number; r: number; color: number }[] = [];
    for (const m of sim.arty) if (m.state !== 'done') marks.push({ x: m.x, z: m.z, r: m.kind === 'he' ? 28 : 22, color: m.kind === 'he' ? 0xff5a4f : 0xe9e7e0 });
    for (const sq of sim.squads) if (sq.smokeOrder) marks.push({ x: sq.smokeOrder.x, z: sq.smokeOrder.z, r: 6, color: 0xe9e7e0 });
    this.R.setMarkers(marks);
  }
  select(id: number) {
    if (id >= 0 && this.sim.squads[id].side !== 0) return;
    this.sel = id;
    this.omode = null;
    this.refreshPaths();
    this.updateHud();
  }
  focusSquad(id: number) {
    const c = this.sim.squadCenter(this.sim.squads[id]);
    this.R.cam.tx = c.x; this.R.cam.tz = c.z;
    this.R.cam.dist = Math.min(this.R.cam.dist, 110);
  }
  flash(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout((this as any)._tt);
    (this as any)._tt = setTimeout(() => (el.hidden = true), 1800);
  }

  // ---------------- vuorot ----------------
  mainAction() {
    if (this.phase === 'orders') this.execute();
    else if (this.phase === 'playback') this.endPlayback();
  }
  execute() {
    this.phase = 'computing';
    this.omode = null;
    this.R.setLos(null);
    this.updateHud();
    $('computing').hidden = false;
    this.sim.beginTurn();
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < TICKS && performance.now() - t0 < 30) { this.sim.tick(); i++; }
      ($('comp-bar') as HTMLElement).style.width = `${(i / TICKS) * 100}%`;
      if (i < TICKS) { requestAnimationFrame(step); return; }
      this.sim.endTurn();
      $('computing').hidden = true;
      this.phase = 'playback';
    this.audioT = 0;
      this.audioT = 0;
      this.replay = false;
      this.playT = 0;
      this.playing = true;
      this.logShown = 0;
      $('log-list').innerHTML = '';
      this.updatePlayback();
      this.updateHud();
    };
    requestAnimationFrame(step);
  }
  startReplay() {
    this.phase = 'playback';
    this.replay = true;
    this.playT = 0;
    this.playing = true;
    this.logShown = 0;
    $('log-list').innerHTML = '';
    this.updatePlayback();
    this.updateHud();
  }
  endPlayback() {
    this.playT = 60;
    this.flushLog(60);
    if (this.sim.gameOver && !this.replay) { this.showEnd(); return; }
    this.phase = 'orders';
    this.refreshPaths();
    this.updateHud();
  }
  updatePlayback() {
    $('pb-play').textContent = this.playing ? '❚❚' : '▶';
    document.querySelectorAll<HTMLButtonElement>('.spd').forEach((b) => b.classList.toggle('on', b.textContent === this.speed + '×'));
  }
  flushLog(t: number) {
    const msgs = this.sim.msgs;
    const list = $('log-list');
    while (this.logShown < msgs.length && msgs[this.logShown].t <= t) {
      const m = msgs[this.logShown++];
      const li = document.createElement('li');
      li.className = 'k' + m.kind;
      li.innerHTML = `<time>${(m.t).toFixed(0).padStart(2, '0')} s</time>${m.text}`;
      list.prepend(li);
    }
  }
  showEnd() {
    this.phase = 'end';
    const sim = this.sim;
    sim.updateObjectives();
    const [g, s] = sim.score();
    const diff = g - s;
    const verdict = diff > 300 ? 'Ratkaiseva voitto' : diff > 80 ? 'Taktinen voitto' : diff > -80 ? 'Ratkaisematon' : diff > -300 ? 'Taktinen tappio' : 'Ratkaiseva tappio';
    $('end-verdict').textContent = verdict;
    const cas = (side: number) => {
      const list = sim.soldiers.filter((x) => x.side === side);
      return { dead: list.filter((x) => x.state === ST_DEAD).length, inc: list.filter((x) => x.state === ST_INCAP).length, wnd: list.filter((x) => x.state === ST_WOUNDED).length, fled: list.filter((x) => x.out).length, total: list.length };
    };
    const cg = cas(0), cs = cas(1);
    $('end-body').innerHTML = `
      <table class="endt"><thead><tr><th></th><th>${sideName(0)}</th><th>${sideName(1)}</th></tr></thead><tbody>
      <tr><td>Pisteet</td><td>${g}</td><td>${s}</td></tr>
      <tr><td>Kaatuneet</td><td>${cg.dead}</td><td>${cs.dead}</td></tr>
      <tr><td>Vakavasti haavoittuneet</td><td>${cg.inc}</td><td>${cs.inc}</td></tr>
      <tr><td>Haavoittuneista hoidettu</td><td>${sim.soldiers.filter((x) => x.side === 0 && x.state === 2 && x.treated).length}</td><td>${sim.soldiers.filter((x) => x.side === 1 && x.state === 2 && x.treated).length}</td></tr>
      <tr><td>Lievästi haavoittuneet</td><td>${cg.wnd}</td><td>${cs.wnd}</td></tr>
      <tr><td>Paenneet</td><td>${cg.fled}</td><td>${cs.fled}</td></tr>
      <tr><td>Vahvuus alussa</td><td>${cg.total}</td><td>${cs.total}</td></tr>
      </tbody></table>
      <p class="endobj">Vihollisen ryhmitys: ${sim.setupName}. Kaikki viholliset näkyvät nyt kartalla.</p>
      <p class="endobj">${sim.objectives.map((o) => `${o.name}: <b>${o.owner === 0 ? sideName(0) : o.owner === 1 ? sideName(1) : 'kiistanalainen'}</b> (${o.pts} p)`).join(' · ')}</p>`;
    $('end').hidden = false;
    this.reveal = true;
    this.updateHud();
  }

  // ---------------- syöte ----------------
  ndc() { const r = this.canvas.getBoundingClientRect(); return { x: ((this.mouse.x - r.left) / r.width) * 2 - 1, y: -((this.mouse.y - r.top) / r.height) * 2 + 1 }; }
  pickSoldier(side: number): number {
    const r = this.canvas.getBoundingClientRect();
    let best = -1, bd = 18;
    for (let i = 0; i < this.sim.soldiers.length; i++) {
      const s = this.sim.soldiers[i];
      if (s.side !== side) continue;
      const mp = this.R.markerPos(i);
      if (!mp) continue;
      const p = this.R.project(mp.x, mp.y, mp.z, r.width, r.height);
      if (p.behind) continue;
      const d = Math.hypot(p.x + r.left - this.mouse.x, p.y + r.top - this.mouse.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  private bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      this.audio.init();
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) { const [a, b] = [...this.touches.values()]; this.pinch.d = Math.hypot(a.x - b.x, a.y - b.y); this.pinch.a = Math.atan2(b.y - a.y, b.x - a.x); }
      }
      c.setPointerCapture(e.pointerId);
      this.mouse.down = e.button; this.mouse.sx = e.clientX; this.mouse.sy = e.clientY; this.mouse.moved = false;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    c.addEventListener('pointermove', (e) => {
      const dx = e.clientX - this.mouse.x, dy = e.clientY - this.mouse.y;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      const cam = this.R.cam;
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) {
          const [a, b] = [...this.touches.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y), an = Math.atan2(b.y - a.y, b.x - a.x);
          if (this.pinch.d) cam.dist *= this.pinch.d / d;
          cam.yaw -= an - this.pinch.a;
          this.pinch.d = d; this.pinch.a = an;
          this.mouse.moved = true;
          return;
        }
      }
      if (this.mouse.down < 0) return;
      if (Math.hypot(e.clientX - this.mouse.sx, e.clientY - this.mouse.sy) > 5) this.mouse.moved = true;
      if (!this.mouse.moved) return;
      if (this.mouse.down === 2 || this.mouse.down === 1 || (this.mouse.down === 0 && e.altKey)) {
        cam.yaw -= dx * 0.005;
        cam.pitch += dy * 0.004;
      } else if (this.mouse.down === 0) {
        const k = cam.dist * 0.0022;
        cam.tx -= (Math.cos(cam.yaw) * dx + Math.sin(cam.yaw) * dy) * k;
        cam.tz -= (-Math.sin(cam.yaw) * dx + Math.cos(cam.yaw) * dy) * k;
      }
    });
    const up = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      const btn = this.mouse.down;
      this.mouse.down = -1;
      if (this.mouse.moved) return;
      if (btn === 2) { this.omode = null; this.updateHud(); return; }
      if (btn !== 0) return;
      this.click(e.shiftKey);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { this.touches.delete(e.pointerId); this.mouse.down = -1; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.R.cam.dist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      const map: Record<string, string> = { '1': 'move', '2': 'quick', '3': 'fast', '4': 'hunt', '5': 'slow', t: 'target', g: 'cease', j: 'split', y: 'face', h: 'hide', l: 'hatch', v: 'smoke', b: 'arty', n: 'artysmoke', backspace: 'clear', delete: 'clear' };
      if (map[k] && this.phase === 'orders') { e.preventDefault(); this.orderButton(map[k]); return; }
      if (k === 'escape') { this.omode = null; this.updateHud(); }
      if (k === ' ' || k === 'enter') {
        e.preventDefault();
        if (this.phase === 'playback' && k === ' ') { this.playing = !this.playing; this.updatePlayback(); }
        else if (this.phase === 'briefing') $('btn-start').click();
        else this.mainAction();
      }
      if (k === 'tab') {
        e.preventDefault();
        const own = this.sim.squads.filter((s) => s.side === 0 && this.sim.squadAlive(s).length);
        const i = own.findIndex((s) => s.id === this.sel);
        const n = own[(i + (e.shiftKey ? own.length - 1 : 1)) % own.length];
        if (n) { this.select(n.id); this.focusSquad(n.id); }
      }
      if (k === 'home' && this.sel >= 0) this.focusSquad(this.sel);
      if (k === 'k') this.toggleRoofs();
      if (k === 'm') this.toggleSound();
      this.audio.init();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    $('unit-rows').addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr) return;
      const s = this.sim.soldiers[parseInt(tr.dataset.id!)];
      this.R.cam.tx = s.x; this.R.cam.tz = s.z; this.R.cam.dist = Math.min(this.R.cam.dist, 40);
    });
  }
  private click(shift: boolean) {
    if (this.phase === 'orders' && this.sel >= 0 && this.omode) { this.orderClick(shift); return; }
    const own = this.pickSoldier(0);
    if (own >= 0) { this.select(this.sim.soldiers[own].squad); return; }
    if (this.phase === 'orders' || this.phase === 'playback') this.select(-1);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.R.resize(Math.max(1, r.width), Math.max(1, r.height));
  }

  // ---------------- silmukka ----------------
  private loop(now: number) {
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const cam = this.R.cam;
    const k = this.keys;
    const pan = cam.dist * 0.9 * dt;
    let fx = 0, fz = 0;
    if (k.has('w') || k.has('arrowup')) fz -= 1;
    if (k.has('s') || k.has('arrowdown')) fz += 1;
    if (k.has('a') || k.has('arrowleft')) fx -= 1;
    if (k.has('d') || k.has('arrowright')) fx += 1;
    cam.tx += (Math.cos(cam.yaw) * fx + Math.sin(cam.yaw) * fz) * pan;
    cam.tz += (-Math.sin(cam.yaw) * fx + Math.cos(cam.yaw) * fz) * pan;
    if (k.has('q')) cam.yaw += 1.4 * dt;
    if (k.has('e')) cam.yaw -= 1.4 * dt;
    if (k.has('r')) cam.dist *= Math.exp(-1.6 * dt);
    if (k.has('f')) cam.dist *= Math.exp(1.6 * dt);
    if (k.has('z')) cam.pitch += 0.8 * dt;
    if (k.has('x')) cam.pitch -= 0.8 * dt;
    this.R.updateCamera();
    // kuuntelija kameran ja katsekohteen välissä: lähelle zoomattaessa ollaan keskellä taistelua
    {
      const cp = this.R.camera.position, ty = this.sim.T.h(Math.max(0, Math.min(MAP_W, cam.tx)), Math.max(0, Math.min(MAP_D, cam.tz)));
      const k = 0.35;
      this.audio.setListener(cam.tx + (cp.x - cam.tx) * k, ty + 1.6 + (cp.y - ty) * k, cam.tz + (cp.z - cam.tz) * k, cam.yaw);
    }

    const sim = this.sim;
    if (this.phase === 'playback') {
      if (this.playing) this.playT = Math.min(60, this.playT + dt * this.speed);
      const f = this.playT / DT;
      const fA = Math.min(TICKS, Math.floor(f)), fB = Math.min(TICKS, fA + 1);
      if (this.playing) this.audio.playback(sim.shots, sim.impacts, sim.explosions, sim.sfx, this.audioT, this.playT, this.speed);
      this.audioT = this.playT;
      this.engineSound(fA);
      this.R.applyFrame(sim.frames, fA, fB, f - fA, this.reveal ? -1 : 0, this.sel);
      this.R.updateFx(this.playT, sim.shots, sim.impacts, sim.explosions, 0, sim.frames);
      this.R.updateSmoke(sim.time - 60 + this.playT);
      if (this.R.markerGroup) this.R.markerGroup.visible = false;
      this.R.showGhosts([]);
      ($('pb-slider') as HTMLInputElement).value = String(this.playT);
      $('pb-time').textContent = `${this.playT.toFixed(1).padStart(4, '0')} / 60 s`;
      this.flushLog(this.playT);
      if (this.playT >= 60 && this.playing) {
        this.playing = false;
        this.updatePlayback();
        if (!this.replay && sim.gameOver) this.showEnd();
      }
      if (Math.floor(this.playT * 4) !== Math.floor((this.playT - dt * this.speed) * 4)) this.updateUnitPanel();
      $('clock').textContent = 'klo ' + this.clock();
    } else {
      const last = Math.max(0, sim.frameCount - 1);
      this.R.applyFrame(sim.frames, last, last, 0, this.reveal ? -1 : 0, this.sel);
      this.R.updateFx(-10, [], [], [], 0, null);
      this.R.updateSmoke(sim.time);
      if (this.R.markerGroup) this.R.markerGroup.visible = true;
      this.engineSound(Math.max(0, sim.frameCount - 1), true);
      if (this.phase === 'orders') this.updateGhosts();
    }
    this.updateLabels();
    this.updateHover();
    this.audio.ambient(dt);
    this.R.render(dt);
    requestAnimationFrame((t) => this.loop(t));
  }
  private engineSound(f: number, idle = false) {
    const sim = this.sim;
    const t = sim.soldiers.find((s) => s.veh);
    if (!t) return;
    const N = sim.soldiers.length, o = f * N * FSTRIDE + t.id * FSTRIDE;
    const x = sim.frames[o], z = sim.frames[o + 2];
    const alive = sim.frames[o + 5] < ST_INCAP;
    const moving = !idle && this.playing && (sim.frames[o + 6] & 1) !== 0;
    this.audio.engine(x, sim.T.h(x, z) + 1.5, z, alive, moving);
  }
  private updateGhosts() {
    const sim = this.sim;
    const list: { x: number; z: number; alpha: number }[] = [];
    for (const e of sim.soldiers) {
      if (e.side !== 1 || e.state >= ST_INCAP || e.out) continue;
      const seen = sim.sideSeen[0][e.id];
      const age = sim.time - seen;
      if (age < 1.7 || age > 120) continue;
      list.push({ x: sim.lastPos[0][e.id * 2], z: sim.lastPos[0][e.id * 2 + 1], alpha: clamp(1 - age / 120, 0.25, 0.9) });
    }
    for (const c of sim.sounds[0]) list.push({ x: c.x, z: c.z, alpha: clamp(1 - (sim.time - c.t) / 45, 0.2, 0.8) });
    this.R.showGhosts(list);
  }
  private updateLabels() {
    const r = this.canvas.getBoundingClientRect();
    const sim = this.sim;
    for (const sq of sim.squads) {
      const el = this.labels[sq.id];
      if (sq.side !== 0) continue;
      const alive = sim.squadAlive(sq);
      if (!alive.length || sq.dissolved) { el.hidden = true; continue; }
      const L = sim.alive(sim.soldiers[sq.leader]) ? sq.leader : alive[0];
      const mp = this.R.markerPos(L);
      if (!mp) { el.hidden = true; continue; }
      const p = this.R.project(mp.x, mp.y + 0.8, mp.z, r.width, r.height);
      el.hidden = p.behind || p.x < -50 || p.y < -20 || p.x > r.width + 50 || p.y > r.height + 20;
      el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
      const txt = `${sq.short}<b class="${MS_CLASS[sq.mstate]}">${alive.length}</b>`;
      if (el.innerHTML !== txt) el.innerHTML = txt;
      el.classList.toggle('sel', this.sel === sq.id);
    }
    sim.objectives.forEach((o, i) => {
      const el = this.objLabels[i];
      const p = this.R.project(o.x, sim.T.h(o.x, o.z) + 6, o.z, r.width, r.height);
      el.hidden = p.behind;
      el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
      el.className = 'obj-label ' + (o.owner === 0 ? 'ger' : o.owner === 1 ? 'sov' : 'neu');
    });
  }
  private updateHover() {
    const tip = $('tip');
    if (this.mouse.down >= 0) { tip.hidden = true; return; }
    const sim = this.sim;
    let id = this.pickSoldier(0);
    if (id < 0) id = this.pickSoldier(1);
    const r = this.canvas.getBoundingClientRect();
    const inside = this.mouse.x >= r.left && this.mouse.x <= r.right && this.mouse.y >= r.top && this.mouse.y <= r.bottom;
    // näkyvyysviiva tulikäskyssä
    if (this.phase === 'orders' && this.omode === 'target' && this.sel >= 0 && inside) {
      const p = this.R.pickGround(this.ndc().x, this.ndc().y);
      if (p) {
        const los = this.losFrom(sim.squads[this.sel], p);
        this.R.setLos(los.a, los.b, los.block);
        tip.hidden = false;
        tip.innerHTML = `<b>${Math.round(los.d)} m</b>${los.block ? 'Näkyvyys katkeaa' : 'Näkyvyys kohteeseen'}`;
        tip.style.transform = `translate(${this.mouse.x + 16}px, ${this.mouse.y + 14}px)`;
        return;
      }
    } else this.R.setLos(null);
    if (id < 0 || !inside) { tip.hidden = true; return; }
    const s = sim.soldiers[id];
    tip.hidden = false;
    tip.style.transform = `translate(${this.mouse.x + 16}px, ${this.mouse.y + 14}px)`;
    if (s.veh && s.side === 0) {
      tip.innerHTML = `<b>${VEHICLES[s.veh.type].name} (${VEHICLES[s.veh.type].number})</b>${s.rank} ${s.name} · ${WEAPONS[VEHICLES[s.veh.type].gun].name}<br>${s.veh.ko ? 'Tuhottu' : s.veh.immob ? 'Liikuntakyvytön' : 'Toimintakykyinen'} · ${s.veh.buttoned ? 'luukut kiinni' : 'luukut auki'}`;
    } else if (s.side === 0) {
      tip.innerHTML = `<b>${s.rank} ${s.name}</b>${s.role} · ${s.w.name}<br>${STATE_NAMES[s.state]} · tukahdutus ${Math.round(s.supp)}%${s.posture === P_PRONE ? ' · makuulla' : ''}`;
    } else {
      const kind = s.veh ? 'Panssarivaunu' : sim.squads[s.squad].gun ? 'Panssarintorjuntatykin miehistö' : s.w.kind === 'lmg' ? 'Konekivääri' : s.w.kind === 'hmg' ? 'Raskas konekivääri' : s.w.kind === 'smg' ? 'Konepistooli' : 'Kiväärimies';
      let dist = '';
      if (this.sel >= 0) { const c = sim.squadCenter(sim.squads[this.sel]); dist = ` · ${Math.round(Math.hypot(c.x - s.x, c.z - s.z))} m`; }
      tip.innerHTML = `<b>Vihollinen</b>${kind}${dist}`;
    }
  }
}

export function clampMap(x: number, z: number) { return { x: clamp(x, 1, MAP_W - 1), z: clamp(z, 1, MAP_D - 1) }; }

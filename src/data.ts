// Aseet, joukkojen kokoonpano ja skenaario.
import { Rng } from './rng';

export type Side = 0 | 1; // 0 = pelaaja, 1 = tekoäly; kansallisuus tulee skenaariosta
export type Nation = 'ger' | 'sov';
export const sideName = (side: number) => SCENARIO.sideNames[side];
export const nationOf = (side: number): Nation => SCENARIO.nations[side];

export type WKind = 'rifle' | 'semi' | 'smg' | 'lmg' | 'hmg' | 'pistol' | 'gun' | 'mortar';
export interface Weapon {
  id: string; name: string; kind: WKind;
  v0: number;      // lähtönopeus m/s
  drag: number;    // ilmanvastus k (a = k v²), 1/m
  mass: number;    // luodin massa kg
  mrad: number;    // hajonta (1σ, milliradiaania) hyvissä oloissa
  rpm: number;     // tulinopeus sarjatulella
  mag: number; reload: number;
  burst: [number, number];
  aim: number;     // tähdätyn laukauksen väli (s) pitkällä matkalla
  eff: number;     // tehokas kantama
  max: number;     // suurin ampumamatka
  tracer: number;  // joka n:s on valojuova (0 = ei)
  setup: number;   // asettamisaika pysähtymisen jälkeen
  ammo: number;    // mukana olevat patruunat
  pen?: number; penV?: number; heat?: boolean; shatter?: number; // panssarintorjunta: läpäisy mm nopeudella penV
  minR?: number; charges?: number[]; // heittimet: pienin kantama ja panokset (lähtönopeudet)
  range?: number;  // ampumaetäisyyden ohitus (tarkka-ampuja)
}

const W = (o: Weapon) => o;
export const WEAPONS: Record<string, Weapon> = {
  k98: W({ id: 'k98', name: 'Karabiner 98k', kind: 'rifle', v0: 760, drag: 0.00076, mass: 0.0128, mrad: 2.6, rpm: 15, mag: 5, reload: 4, burst: [1, 1], aim: 5.5, eff: 500, max: 800, tracer: 0, setup: 0, ammo: 60 }),
  mp40: W({ id: 'mp40', name: 'MP 40', kind: 'smg', v0: 390, drag: 0.0018, mass: 0.008, mrad: 9, rpm: 500, mag: 32, reload: 4, burst: [3, 6], aim: 2.2, eff: 100, max: 190, tracer: 0, setup: 0, ammo: 192 }),
  mg34: W({ id: 'mg34', name: 'MG 34', kind: 'lmg', v0: 760, drag: 0.00076, mass: 0.0128, mrad: 3.4, rpm: 850, mag: 50, reload: 6, burst: [5, 10], aim: 2.4, eff: 800, max: 1100, tracer: 4, setup: 3, ammo: 1150 }),
  p08: W({ id: 'p08', name: 'Pistole 08', kind: 'pistol', v0: 350, drag: 0.002, mass: 0.008, mrad: 14, rpm: 120, mag: 8, reload: 3, burst: [1, 2], aim: 1.5, eff: 30, max: 50, tracer: 0, setup: 0, ammo: 24 }),
  mosin: W({ id: 'mosin', name: 'Mosin-Nagant 91/30', kind: 'rifle', v0: 865, drag: 0.0009, mass: 0.0096, mrad: 2.8, rpm: 15, mag: 5, reload: 4.5, burst: [1, 1], aim: 5.7, eff: 500, max: 800, tracer: 0, setup: 0, ammo: 75 }),
  svt: W({ id: 'svt', name: 'SVT-40', kind: 'semi', v0: 840, drag: 0.0009, mass: 0.0096, mrad: 3.4, rpm: 40, mag: 10, reload: 4, burst: [1, 2], aim: 3.4, eff: 400, max: 700, tracer: 0, setup: 0, ammo: 100 }),
  ppd: W({ id: 'ppd', name: 'PPD-40', kind: 'smg', v0: 490, drag: 0.0016, mass: 0.0055, mrad: 10, rpm: 850, mag: 71, reload: 6, burst: [4, 8], aim: 2.2, eff: 120, max: 200, tracer: 0, setup: 0, ammo: 213 }),
  dp: W({ id: 'dp', name: 'DP-28', kind: 'lmg', v0: 840, drag: 0.0009, mass: 0.0096, mrad: 4.2, rpm: 550, mag: 47, reload: 6, burst: [3, 6], aim: 2.4, eff: 600, max: 900, tracer: 5, setup: 2, ammo: 564 }),
  maxim: W({ id: 'maxim', name: 'Maxim M1910', kind: 'hmg', v0: 865, drag: 0.0009, mass: 0.0096, mrad: 2.4, rpm: 600, mag: 250, reload: 10, burst: [8, 15], aim: 1.6, eff: 1000, max: 1500, tracer: 5, setup: 20, ammo: 1500 }),
  kwk38: W({ id: 'kwk38', name: '5 cm KwK 38', kind: 'gun', v0: 450, drag: 0.00035, mass: 1.8, mrad: 0.8, rpm: 12, mag: 1, reload: 4.5, burst: [1, 1], aim: 4, eff: 1000, max: 1400, tracer: 1, setup: 0, ammo: 80 }),
  tankmg: W({ id: 'tankmg', name: 'MG 34 (vaunu)', kind: 'lmg', v0: 760, drag: 0.00076, mass: 0.0128, mrad: 2.2, rpm: 850, mag: 150, reload: 5, burst: [5, 10], aim: 2.4, eff: 800, max: 1000, tracer: 4, setup: 0, ammo: 2700 }),
  // 45 mm 53-K: PS-ammus BR-240 (1,43 kg, 760 m/s) ja sirpalekranaatti O-240
  pst45: W({ id: 'pst45', name: '45 mm 53-K', kind: 'gun', v0: 760, drag: 0.0002, mass: 1.43, mrad: 0.6, rpm: 15, mag: 1, reload: 4, burst: [1, 1], aim: 4, eff: 900, max: 1200, tracer: 1, setup: 0, ammo: 0, pen: 44, penV: 760, shatter: 0.2 }),
  // 5 cm leichter Granatwerfer 36: kantama 50–520 m, kranaatti 0,9 kg
  grw36: W({ id: 'grw36', name: '5 cm leGrW 36', kind: 'mortar', v0: 75, drag: 0.0003, mass: 0.91, mrad: 9, rpm: 12, mag: 1, reload: 0, burst: [1, 1], aim: 5, eff: 520, max: 520, tracer: 0, setup: 15, ammo: 45, minR: 50, charges: [75] }),
  // --- 1944 ---
  ppsh: W({ id: 'ppsh', name: 'PPŠ-41', kind: 'smg', v0: 488, drag: 0.0016, mass: 0.0055, mrad: 10, rpm: 1000, mag: 71, reload: 6, burst: [4, 9], aim: 2.0, eff: 120, max: 200, tracer: 0, setup: 0, ammo: 284 }),
  mosinpu: W({ id: 'mosinpu', name: 'Mosin 91/30 PU (kiikari)', kind: 'rifle', v0: 865, drag: 0.0009, mass: 0.0096, mrad: 0.9, rpm: 10, mag: 5, reload: 5, burst: [1, 1], aim: 7, eff: 800, max: 1000, tracer: 0, setup: 0, ammo: 60, range: 750 }),
  dt_t: W({ id: 'dt_t', name: 'DT (vaunu)', kind: 'lmg', v0: 840, drag: 0.0009, mass: 0.0096, mrad: 2.4, rpm: 600, mag: 63, reload: 6, burst: [4, 8], aim: 2.4, eff: 800, max: 1000, tracer: 5, setup: 0, ammo: 1890 }),
  zis53: W({ id: 'zis53', name: '85 mm ZiS-S-53', kind: 'gun', v0: 785, drag: 0.00015, mass: 9.5, mrad: 0.7, rpm: 8, mag: 1, reload: 7, burst: [1, 1], aim: 5, eff: 1200, max: 1600, tracer: 1, setup: 0, ammo: 55 }),
  m82: W({ id: 'm82', name: '82 mm BM-37', kind: 'mortar', v0: 211, drag: 0.00015, mass: 3.31, mrad: 9, rpm: 15, mag: 1, reload: 0, burst: [1, 1], aim: 5, eff: 3000, max: 3000, tracer: 0, setup: 20, ammo: 36, minR: 85, charges: [70, 95, 125, 160, 211] }),
  mg42: W({ id: 'mg42', name: 'MG 42', kind: 'lmg', v0: 755, drag: 0.00076, mass: 0.0128, mrad: 3.6, rpm: 1200, mag: 50, reload: 6, burst: [6, 12], aim: 2.4, eff: 800, max: 1100, tracer: 4, setup: 3, ammo: 1200 }),
  mg42l: W({ id: 'mg42l', name: 'MG 42 (Lafette)', kind: 'hmg', v0: 755, drag: 0.00076, mass: 0.0128, mrad: 1.6, rpm: 1200, mag: 250, reload: 8, burst: [8, 16], aim: 1.6, eff: 1200, max: 1600, tracer: 5, setup: 15, ammo: 2500 }),
  g43: W({ id: 'g43', name: 'Gewehr 43', kind: 'semi', v0: 746, drag: 0.00076, mass: 0.0128, mrad: 3.2, rpm: 40, mag: 10, reload: 4, burst: [1, 2], aim: 3.2, eff: 450, max: 700, tracer: 0, setup: 0, ammo: 90 }),
  p38: W({ id: 'p38', name: 'Walther P38', kind: 'pistol', v0: 350, drag: 0.002, mass: 0.008, mrad: 13, rpm: 120, mag: 8, reload: 3, burst: [1, 2], aim: 1.5, eff: 30, max: 50, tracer: 0, setup: 0, ammo: 24 }),
  // 7,5 cm PaK 40: PzGr 39 noin 135 mm suoraan levyyn lähietäisyydeltä
  pak40: W({ id: 'pak40', name: '7,5 cm PaK 40', kind: 'gun', v0: 792, drag: 0.00012, mass: 6.8, mrad: 0.5, rpm: 10, mag: 1, reload: 5, burst: [1, 1], aim: 4, eff: 1500, max: 2000, tracer: 1, setup: 0, ammo: 0, pen: 135, penV: 792 }),
  // Panzerfaust 30: onteloammus, läpäisy ei riipu nopeudesta
  pzf: W({ id: 'pzf', name: 'Panzerfaust 30', kind: 'gun', v0: 30, drag: 0.0004, mass: 3.0, mrad: 16, rpm: 1, mag: 1, reload: 0, burst: [1, 1], aim: 3, eff: 30, max: 35, tracer: 1, setup: 0, ammo: 0, pen: 140, heat: true }),
  tt: W({ id: 'tt', name: 'TT-33', kind: 'pistol', v0: 420, drag: 0.0016, mass: 0.0055, mrad: 14, rpm: 120, mag: 8, reload: 3, burst: [1, 2], aim: 1.5, eff: 30, max: 50, tracer: 0, setup: 0, ammo: 24 }),
};

export interface SoldierDef { rank: string; role: string; weapon: string; grenades: number; pzf?: number; }

// Panssarivaunut. Panssari: [paksuus mm, kaltevuus pystysuorasta °]; laatikot vaunun koordinaateissa.
export interface VehSpec {
  name: string; gun: string; mg: string; hull: number[]; tur: number[]; gunY: number; cmdY: number;
  armor: Record<'hull' | 'turret', Record<'front' | 'side' | 'rear' | 'top' | 'bottom', [number, number]>>;
  armorText: string; speed: number; soft: number; hatch: boolean; crew: number; model: 'pz3' | 't34'; number: string;
}
export const VEHICLES: Record<string, VehSpec> = {
  pz3: {
    name: 'Panzer III Ausf. H', gun: 'kwk38', mg: 'tankmg', hull: [-1.5, 0.25, -2.75, 1.5, 1.75, 2.75], tur: [-0.95, 1.75, -0.8, 0.95, 2.45, 1.3], gunY: 2.05, cmdY: 2.45,
    armor: { hull: { front: [55, 9], side: [30, 0], rear: [21, 10], top: [16, 0], bottom: [16, 0] }, turret: { front: [37, 15], side: [30, 25], rear: [30, 12], top: [12, 0], bottom: [30, 0] } },
    armorText: 'Keula 30 + 30 mm, kyljet ja torni 30 mm, tausta 21 mm. 45 mm tykki läpäisee kyljet ja tornin, keulaa harvoin.',
    speed: 1, soft: 1, hatch: true, crew: 5, model: 'pz3', number: '411',
  },
  t34: {
    name: 'T-34-85', gun: 'zis53', mg: 'dt_t', hull: [-1.5, 0.35, -3.0, 1.5, 1.55, 3.0], tur: [-1.05, 1.55, -1.35, 1.05, 2.5, 1.1], gunY: 2.05, cmdY: 2.5,
    armor: { hull: { front: [45, 60], side: [45, 40], rear: [45, 45], top: [20, 0], bottom: [20, 0] }, turret: { front: [90, 0], side: [75, 20], rear: [52, 10], top: [20, 0], bottom: [75, 0] } },
    armorText: 'Keula 45 mm 60° kulmassa (vastaa noin 90 mm), kyljet 45 mm, torni edestä 90 mm. PaK 40 läpäisee sen kaikilta suunnilta alle kilometrin päästä, Panzerfaust lähietäisyydeltä aina.',
    speed: 1.15, soft: 1.3, hatch: false, crew: 5, model: 't34', number: '223',
  },
};
export interface SquadDef { name: string; short: string; men: SoldierDef[]; x: number; z: number; face: number; exp: number; morale: number; foxholes?: boolean; ai?: string; hold?: number; vehicle?: string; occupy?: boolean; smoke?: number; slot?: string; gun?: { ap: number; he: number; w?: string; ambush?: number; frontOk?: boolean }; }

const GER = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Maier', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Scholz', 'Möller', 'Vogel', 'Jäger'];
const RUS = ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Vasiljev', 'Petrov', 'Sokolov', 'Mihailov', 'Novikov', 'Fjodorov', 'Morozov', 'Volkov', 'Aleksejev', 'Lebedev', 'Semjonov', 'Jegorov', 'Pavlov', 'Kozlov', 'Stepanov', 'Nikolajev', 'Orlov', 'Andrejev', 'Makarov', 'Nikitin', 'Zaharov', 'Zaitsev', 'Solovjov', 'Borisov', 'Jakovlev', 'Grigorjev', 'Romanov', 'Vorobjov', 'Sergejev', 'Kuzmin', 'Frolov', 'Bondarenko', 'Tkatšenko', 'Kovalenko', 'Abdullajev', 'Gusev'];

export function nameFor(nation: Nation, rng: Rng, used: Set<string>): string {
  const list = nation === 'ger' ? GER : RUS;
  for (let i = 0; i < 50; i++) {
    const n = rng.pick(list);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return rng.pick(list);
}

const gerSquad = (): SoldierDef[] => [
  { rank: 'Uffz.', role: 'Ryhmänjohtaja', weapon: 'mp40', grenades: 2 },
  { rank: 'Gefr.', role: 'Konekivääriampuja', weapon: 'mg34', grenades: 0 },
  { rank: 'Schtz.', role: 'Apulaisampuja', weapon: 'p08', grenades: 1 },
  { rank: 'Schtz.', role: 'Patruunankantaja', weapon: 'k98', grenades: 1 },
  { rank: 'Ogefr.', role: 'Varajohtaja', weapon: 'k98', grenades: 2 },
  { rank: 'Schtz.', role: 'Kivääri', weapon: 'k98', grenades: 2 },
  { rank: 'Schtz.', role: 'Kivääri', weapon: 'k98', grenades: 2 },
  { rank: 'Schtz.', role: 'Kivääri', weapon: 'k98', grenades: 2 },
  { rank: 'Gefr.', role: 'Kivääri', weapon: 'k98', grenades: 2 },
  { rank: 'Schtz.', role: 'Kivääri', weapon: 'k98', grenades: 1 },
];
const sovSquad = (leaderWeapon: string): SoldierDef[] => [
  { rank: 'Serž.', role: 'Ryhmänjohtaja', weapon: leaderWeapon, grenades: 2 },
  { rank: 'Kras.', role: 'Konekivääriampuja', weapon: 'dp', grenades: 0 },
  { rank: 'Kras.', role: 'Apulaisampuja', weapon: 'mosin', grenades: 1 },
  { rank: 'Mlserž.', role: 'Varajohtaja', weapon: 'svt', grenades: 2 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'mosin', grenades: 1 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'mosin', grenades: 1 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'svt', grenades: 1 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'mosin', grenades: 1 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'mosin', grenades: 1 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'mosin', grenades: 1 },
];

const gerSquad44 = (): SoldierDef[] => [
  { rank: 'Uffz.', role: 'Ryhmänjohtaja', weapon: 'mp40', grenades: 2 },
  { rank: 'Gefr.', role: 'Konekivääriampuja', weapon: 'mg42', grenades: 0 },
  { rank: 'Gren.', role: 'Apulaisampuja', weapon: 'p38', grenades: 1 },
  { rank: 'Ogefr.', role: 'Varajohtaja', weapon: 'g43', grenades: 2 },
  { rank: 'Gren.', role: 'Kivääri', weapon: 'k98', grenades: 2, pzf: 1 },
  { rank: 'Gren.', role: 'Kivääri', weapon: 'k98', grenades: 2 },
  { rank: 'Gren.', role: 'Kivääri', weapon: 'k98', grenades: 2, pzf: 1 },
  { rank: 'Gefr.', role: 'Kivääri', weapon: 'k98', grenades: 2 },
];
const sovSquad44 = (): SoldierDef[] => [
  { rank: 'Serž.', role: 'Ryhmänjohtaja', weapon: 'ppsh', grenades: 2 },
  { rank: 'Kras.', role: 'Konekivääriampuja', weapon: 'dp', grenades: 1 },
  { rank: 'Kras.', role: 'Apulaisampuja', weapon: 'mosin', grenades: 2 },
  { rank: 'Efr.', role: 'Varajohtaja', weapon: 'ppsh', grenades: 2 },
  { rank: 'Kras.', role: 'Patruunankantaja', weapon: 'mosin', grenades: 2 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'ppsh', grenades: 2 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'mosin', grenades: 2 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'mosin', grenades: 2 },
  { rank: 'Kras.', role: 'Kivääri', weapon: 'mosin', grenades: 2 },
];

const S_BOBR = {
  id: 'bobr', map: 'bobr',
  nations: ['ger', 'sov'] as Nation[],
  sideNames: ['Wehrmacht', 'Puna-armeija'],
  pick: 'Hyökkää Wehrmachtin kiväärijoukkueella ja Panzer III:lla kaivautunutta puna-armeijaa vastaan Barbarossan ensimmäisellä viikolla.',
  forces: ['Kiväärijoukkue, 33 miestä: 3 × MG 34, Kar98k, MP 40. Tukena Panzer III (5 cm KwK), 5 cm heitin ja kaksi 10,5 cm tulitehtävää. Kokeneita (Puola, Ranska).',
    'Kiväärijoukkue ampumakuopissa. DP-28-pikakiväärit, SVT-40, Maxim-raskas konekivääri. Kokemattomia mutta sitkeitä. Asemat ovat tuntemattomat ja vaihtelevat pelistä toiseen. Panssarintorjuntaa ei ole havaittu.'],
  arty: { name: '10,5 cm patteristo', size: 3, frag: 140, salvos: 4 },
  prep: null as null | { n: number; x0: number; x1: number; z0: number; z1: number; t1: number },
  helpTank: '<b>Panzer III.</b> Kiväärin luodit kimpoavat panssarista, mutta avoimesta luukusta tähyilevä vaununjohtaja on maali. Tykki ampuu sirpalekranaatteja vain pysähdyksistä, ja tornin kääntö vie aikaa. Metsään ja taloihin vaunu ei pääse. Alle 20 metrin päässä vihollinen voi heittää kasapanoksen, joka katkaisee telan tai tuhoaa vaunun.',
  helpArmor: '<b>Panssari.</b> Läpäisy lasketaan ammuksen nopeudesta osumahetkellä, levyn paksuudesta, levyn kaltevuudesta ja osumakulmasta. Viistosti osuva ammus kimpoaa. Panzer III H:n keula (60 mm) kestää 45 mm tykin, mutta kyljet ja torni (30 mm) eivät. Pidä keula kohti uhkaa ja etsi panssarintorjunta jalkaväellä ennen kuin vaunu ajaa avoimeen maastoon.',
  title: 'Kylä Bobrin laidalla',
  date: '28. kesäkuuta 1941, klo 05.30',
  place: 'Valko-Venäjä, Berezinan länsipuoli',
  turns: 20,
  artyMissions: 2,
  // Puolustajan ryhmitysvaihtoehdot: jokainen peli arpoo yhdistelmän. [x, z, suunta]
  defense: {
    front: [
      { name: 'kylän etureuna', pos: [[200, 282, 0], [290, 282, 0]] },
      { name: 'länsilaita', pos: [[125, 300, 0.5], [290, 282, 0]] },
      { name: 'notko edessä', pos: [[185, 360, 0], [300, 334, 0]] },
      { name: 'itälehto', pos: [[200, 282, 0], [372, 350, -0.4]] },
    ] as { name: string; pos: number[][] }[],
    mg: [[312, 262, 0], [215, 255, 0.1], [240, 360, 0], [325, 255, -0.1]],
    gun: [[100, 410, 1.31], [104, 440, 1.37], [362, 372, -1.03], [208, 262, 0.26]],
    reserve: [[255, 196], [330, 160], [228, 160]],
    hq: [[236, 236], [255, 150], [330, 160]],
  },
  wind: { x: 0.3, z: 0.1 },
  startMinute: 5 * 60 + 30,
  briefing: [
    'Panssariryhmä 2:n kärki on ohittanut kylän pohjoisesta. Jalkaväen tehtävä on puhdistaa se, jotta huoltotie Bobruiskiin aukeaa.',
    'Sinulla on kiväärijoukkue: kolme ryhmää, joissa kussakin MG 34, sekä joukkueen johto. Tueksi on alistettu yksi Panzer III, jonka 5 cm kanuuna ampuu sirpalekranaatteja. Vihollisena on puna-armeijan kiväärijoukkue, joka on kaivautunut kylän etelälaidalle. Tiedustelu on havainnut ainakin yhden raskaan konekiväärin.',
    'Tehtävä: valtaa Kylänaukio ja kolhoosin varasto 20 minuutissa. Vehnäpelto antaa näkösuojaa mutta ei suojaa luodeilta. Notko ja länsireunan metsä tarjoavat peitteisen reitin jalkaväelle, mutta vaunu ei pääse metsään. Älä vie vaunua yksin lähelle vihollisen kuoppia: puna-armeijan miehet hyökkäävät sen kimppuun kasapanoksilla. Panssarintorjunnasta ei ole tietoa, mutta 45 mm tykit ovat olleet tällä rintamalla yleisiä ja läpäisevät Panzer III:n tornin ja kyljet muutamien satojen metrien päästä. Rungon keulan 60 mm panssari kestää.',
  ],
  objectives: [
    { name: 'Kylänaukio', x: 0, z: 200, r: 26, pts: 300, onRoad: true },
    { name: 'Kolhoosin varasto', x: 330, z: 160, r: 26, pts: 200 },
  ],
  squads: [
    { name: 'Zugtrupp (johto)', short: 'Joht.', men: [
      { rank: 'Lt.', role: 'Joukkueenjohtaja', weapon: 'mp40', grenades: 1 },
      { rank: 'Gefr.', role: 'Lähetti', weapon: 'k98', grenades: 2 },
      { rank: 'Schtz.', role: 'Lähetti', weapon: 'k98', grenades: 2 },
    ], x: 250, z: 520, face: Math.PI, exp: 0.85, morale: 92 },
    { smoke: 2, name: '1. Gruppe', short: '1. ryhmä', men: gerSquad(), x: 175, z: 512, face: Math.PI, exp: 0.85, morale: 90 },
    { smoke: 2, name: '2. Gruppe', short: '2. ryhmä', men: gerSquad(), x: 245, z: 505, face: Math.PI, exp: 0.85, morale: 90 },
    { smoke: 2, name: '3. Gruppe', short: '3. ryhmä', men: gerSquad(), x: 320, z: 512, face: Math.PI, exp: 0.85, morale: 90 },
    { name: 'Panzer III Ausf. H (411)', short: 'Pz III', men: [
      { rank: 'Fw.', role: 'Vaununjohtaja', weapon: 'kwk38', grenades: 0 },
    ], x: 246, z: 546, face: Math.PI, exp: 0.85, morale: 95, vehicle: 'pz3', smoke: 1 },
    { name: 'Granatwerfertrupp (5 cm)', short: 'Heitin', men: [
      { rank: 'Uffz.', role: 'Heitinjohtaja', weapon: 'k98', grenades: 1 },
      { rank: 'Gefr.', role: 'Ampuja', weapon: 'grw36', grenades: 0 },
      { rank: 'Schtz.', role: 'Ammusmies', weapon: 'k98', grenades: 1 },
    ], x: 232, z: 534, face: Math.PI, exp: 0.85, morale: 90 },

    { slot: 'front0', name: '1. otdelenije', short: '1. otd.', men: sovSquad('svt'), x: 200, z: 282, face: 0, exp: 1.2, morale: 78, foxholes: true, ai: 'front', hold: 200 },
    { slot: 'front1', name: '2. otdelenije', short: '2. otd.', men: sovSquad('ppd'), x: 290, z: 282, face: 0, exp: 1.2, morale: 78, foxholes: true, ai: 'front', hold: 200 },
    { slot: 'reserve', name: '3. otdelenije', short: '3. otd.', men: sovSquad('svt'), x: 255, z: 196, face: 0, exp: 1.2, morale: 80, ai: 'reserve', hold: 150, occupy: true },
    { slot: 'mg', name: 'Raskas kk (Maxim)', short: 'Maxim', men: [
      { rank: 'Serž.', role: 'Konekivääriampuja', weapon: 'maxim', grenades: 0 },
      { rank: 'Kras.', role: 'Apulaisampuja', weapon: 'mosin', grenades: 1 },
      { rank: 'Kras.', role: 'Patruunankantaja', weapon: 'mosin', grenades: 1 },
    ], x: 312, z: 262, face: 0, exp: 1.1, morale: 82, foxholes: true, ai: 'mg', hold: 650 },
    { slot: 'gun', name: '45 mm panssarintorjuntatykki', short: 'PstTyk', men: [
      { rank: 'Serž.', role: 'Tykinjohtaja', weapon: 'mosin', grenades: 1 },
      { rank: 'Kras.', role: 'Suuntaaja', weapon: 'mosin', grenades: 0 },
      { rank: 'Kras.', role: 'Lataaja', weapon: 'mosin', grenades: 0 },
      { rank: 'Kras.', role: 'Ammusmies', weapon: 'mosin', grenades: 1 },
    ], x: 100, z: 378, face: 1.24, exp: 1.15, morale: 84, foxholes: true, ai: 'atgun', hold: 120, gun: { ap: 40, he: 15, w: 'pst45', ambush: 260, frontOk: false } },
    { slot: 'hq', name: 'Joukkueen johto', short: 'Joht.', men: [
      { rank: 'Ml.lt.', role: 'Joukkueenjohtaja', weapon: 'ppd', grenades: 1 },
      { rank: 'Kras.', role: 'Lähetti', weapon: 'mosin', grenades: 1 },
    ], x: 236, z: 236, face: 0, exp: 1.15, morale: 85, ai: 'hq', hold: 200, occupy: true },
  ] as SquadDef[],
  squadSide: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1] as Side[],
};
type Scenario = typeof S_BOBR;

// Operaatio Bagration, 24.6.1944: pelaaja on puna-armeija, puolustajana Wehrmacht.
const S_BAGR: Scenario = {
  id: 'bagr', map: 'bagr',
  nations: ['sov', 'ger'],
  sideNames: ['Puna-armeija', 'Wehrmacht'],
  pick: 'Murtaudu suon yli saksalaiseen puolustukseen puna-armeijan kiväärijoukkueella ja T-34-85:llä operaatio Bagrationin toisena päivänä.',
  forces: ['Kiväärijoukkue, 34 miestä: 3 × DP-28, PPŠ-41, tarkka-ampuja. Tukena T-34-85, 82 mm heitin ja kolme 122 mm tulitehtävää. Valmisteleva keskitys osuu oletettuun etulinjaan ensimmäisen minuutin aikana.',
    'Jalkaväkijoukkue kaivautuneena, noin 30 miestä. MG 42 -konekiväärejä ja Panzerfaust-sinkoja. Todennäköisesti 7,5 cm PaK 40, joka läpäisee T-34:n panssarin. Kokeneita mutta väsyneitä. Asemat tuntemattomat.'],
  arty: { name: '122 mm patteristo', size: 3.5, frag: 170, salvos: 4 },
  prep: { n: 22, x0: 130, x1: 350, z0: 268, z1: 318, t1: 55 },
  helpTank: '<b>T-34-85.</b> Nopea ja leveätelainen vaunu kulkee pehmeässäkin maastossa, mutta ei suolla eikä metsässä. 85 mm kanuuna ampuu sirpalekranaatteja vain pysähdyksistä. Miehistö ajaa tavallisesti luukut kiinni, mikä heikentää näkyvyyttä. Panzerfaust tuhoaa vaunun alle 30 metrin päästä: pidä jalkaväki vaunun edellä.',
  helpArmor: '<b>Panssari.</b> Läpäisy lasketaan ammuksen nopeudesta osumahetkellä, levyn paksuudesta, levyn kaltevuudesta ja osumakulmasta. T-34:n keulalevy on 45 mm mutta 60° kulmassa, joten se vastaa noin 90 mm:ä. Saksalainen 7,5 cm PaK 40 läpäisee silti kaikki levyt alle kilometrin päästä. Etsi tykki ennen kuin vaunu ajaa tielle suon ja koivikon väliin.',
  title: 'Zaborjen kukkula',
  date: '24. kesäkuuta 1944, klo 06.00',
  place: 'Valko-Venäjä, Bobruiskin suunta',
  turns: 20,
  artyMissions: 3,
  defense: {
    front: [
      { name: 'rinteen etureuna', pos: [[195, 303, 0], [290, 305, 0]] },
      { name: 'kukkulan laki', pos: [[165, 262, 0.2], [255, 278, 0]] },
      { name: 'kylän laita', pos: [[175, 268, 0], [312, 250, -0.2]] },
      { name: 'koivikon reuna', pos: [[245, 300, 0], [398, 300, -0.5]] },
    ],
    mg: [[175, 250, 0.1], [300, 248, 0], [232, 296, 0], [392, 292, -0.4]],
    gun: [[318, 250, 0.1], [190, 238, 0.45], [410, 262, -0.15], [306, 268, 0.3]],
    reserve: [[340, 190], [300, 160], [355, 160]],
    hq: [[318, 205], [342, 140], [300, 160]],
  },
  wind: { x: -0.2, z: 0.25 },
  startMinute: 6 * 60,
  briefing: [
    'Operaatio Bagration on alkanut. 65. armeijan pataljoonat ovat tulleet soiden läpi, joita saksalaiset pitivät kulkukelvottomina. Bobruiskin motti sulkeutuu, jos tie Zaborjen kautta saadaan auki.',
    'Sinulla on kiväärijoukkue (kolme ryhmää, DP-28 jokaisessa), tarkka-ampuja, 82 mm heitin ja tukena yksi T-34-85. Patteristolta on varattu kolme 122 mm tulitehtävää. Valmisteleva keskitys osuu oletettuun etulinjaan ensimmäisen minuutin aikana.',
    'Vastassa on heikennetty saksalainen jalkaväkijoukkue Zaborjen kylässä ja Korkeus 146,2:lla. Odotettavissa on MG 42 -konekiväärejä, Panzerfaust-sinkoja ja ainakin yksi panssarintorjuntatykki. Tie kulkee suon ja koivikon välistä, mikä on viholliselle luonteva tulenkäyttöpaikka. Suo hidastaa jalkaväkeä mutta piilottaa sen ruovikkoon, eikä vaunu pääse suolle.',
    'Tehtävä: valtaa Zaborje ja Korkeus 146,2 20 minuutissa.',
  ],
  objectives: [
    { name: 'Zaborje', x: 336, z: 192, r: 28, pts: 300, onRoad: false },
    { name: 'Korkeus 146,2', x: 172, z: 248, r: 24, pts: 200, onRoad: false },
  ],
  squads: [
    { name: 'Joukkueen johto', short: 'Joht.', men: [
      { rank: 'Lt.', role: 'Joukkueenjohtaja', weapon: 'ppsh', grenades: 2 },
      { rank: 'Serž.', role: 'Lähetti', weapon: 'mosin', grenades: 2 },
      { rank: 'Efr.', role: 'Tarkka-ampuja', weapon: 'mosinpu', grenades: 1 },
    ], x: 285, z: 537, face: Math.PI, exp: 0.95, morale: 88 },
    { smoke: 2, name: '1. otdelenije', short: '1. otd.', men: sovSquad44(), x: 160, z: 533, face: Math.PI, exp: 0.95, morale: 86 },
    { smoke: 2, name: '2. otdelenije', short: '2. otd.', men: sovSquad44(), x: 245, z: 531, face: Math.PI, exp: 0.95, morale: 86 },
    { smoke: 2, name: '3. otdelenije', short: '3. otd.', men: sovSquad44(), x: 330, z: 533, face: Math.PI, exp: 0.95, morale: 86 },
    { name: 'T-34-85 (223)', short: 'T-34', men: [
      { rank: 'Ml.lt.', role: 'Vaununjohtaja', weapon: 'zis53', grenades: 0 },
    ], x: 372, z: 552, face: Math.PI, exp: 0.95, morale: 92, vehicle: 't34', smoke: 0 },
    { name: '82 mm kranaatinheitin', short: 'Heitin', men: [
      { rank: 'Serž.', role: 'Heitinjohtaja', weapon: 'mosin', grenades: 1 },
      { rank: 'Kras.', role: 'Ampuja', weapon: 'm82', grenades: 0 },
      { rank: 'Kras.', role: 'Ammusmies', weapon: 'mosin', grenades: 1 },
    ], x: 300, z: 544, face: Math.PI, exp: 0.95, morale: 86 },

    { slot: 'front0', name: '1. Gruppe', short: '1. Gr.', men: gerSquad44(), x: 195, z: 303, face: 0, exp: 0.9, morale: 74, foxholes: true, ai: 'front', hold: 260 },
    { slot: 'front1', name: '2. Gruppe', short: '2. Gr.', men: gerSquad44(), x: 290, z: 305, face: 0, exp: 0.9, morale: 74, foxholes: true, ai: 'front', hold: 260 },
    { slot: 'reserve', name: '3. Gruppe', short: '3. Gr.', men: gerSquad44(), x: 340, z: 190, face: 0, exp: 0.9, morale: 76, ai: 'reserve', hold: 200, occupy: true },
    { slot: 'mg', name: 'sMG-Trupp (MG 42)', short: 'sMG', men: [
      { rank: 'Uffz.', role: 'Konekivääriampuja', weapon: 'mg42l', grenades: 1 },
      { rank: 'Gefr.', role: 'Apulaisampuja', weapon: 'k98', grenades: 1 },
      { rank: 'Gren.', role: 'Patruunankantaja', weapon: 'k98', grenades: 1, pzf: 1 },
    ], x: 175, z: 250, face: 0, exp: 0.9, morale: 78, foxholes: true, ai: 'mg', hold: 700 },
    { slot: 'gun', name: '7,5 cm PaK 40', short: 'PaK', men: [
      { rank: 'Uffz.', role: 'Tykinjohtaja', weapon: 'k98', grenades: 1 },
      { rank: 'Kan.', role: 'Suuntaaja', weapon: 'p38', grenades: 0 },
      { rank: 'Kan.', role: 'Lataaja', weapon: 'k98', grenades: 0 },
      { rank: 'Kan.', role: 'Ammusmies', weapon: 'k98', grenades: 1 },
    ], x: 338, z: 238, face: 0.05, exp: 0.85, morale: 80, foxholes: true, ai: 'atgun', hold: 120, gun: { ap: 24, he: 18, w: 'pak40', ambush: 520, frontOk: true } },
    { slot: 'hq', name: 'Zugtrupp', short: 'Zugtr.', men: [
      { rank: 'Lt.', role: 'Joukkueenjohtaja', weapon: 'mp40', grenades: 1 },
      { rank: 'Gefr.', role: 'Lähetti', weapon: 'k98', grenades: 2, pzf: 1 },
    ], x: 318, z: 205, face: 0, exp: 0.85, morale: 82, ai: 'hq', hold: 250, occupy: true },
  ],
  squadSide: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
};

export const SCENARIOS: Scenario[] = [S_BOBR, S_BAGR];
export let SCENARIO: Scenario = S_BOBR;
export function setScenario(i: number) { SCENARIO = SCENARIOS[i] ?? S_BOBR; }

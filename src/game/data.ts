// Contenu du jeu : bulles, boss, tours, pièges, cartes, modes, vagues, succès.
import type { Achievement, BubbleType, Diff, GameMode, Group, Kind, MapDef, Path, Pt, QueueItem, TowerDef } from './types';

export const W = 1024, H = 640;
export const TAU = Math.PI * 2;
export const KIND: Record<Kind, string> = { sharp: 'Perçant', explo: 'Explosif', cold: 'Glace', normal: 'Impact', magic: 'Énergie', glue: 'Glu', fire: 'Feu' };

// ---------- Géométrie des chemins ----------
export function prepPath(pts: Pt[]): Path {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  return { pts, seg, len: seg.reduce((a, b) => a + b, 0) };
}
export function posAt<T extends { x: number; y: number; a: number }>(P: Path, d: number, o: T): T {
  let i = 0;
  for (; i < P.seg.length; i++) { if (d <= P.seg[i]) break; d -= P.seg[i]; }
  if (i >= P.seg.length) { i = P.seg.length - 1; d = P.seg[i]; }
  const a = P.pts[i], b = P.pts[i + 1], t = Math.max(0, d) / P.seg[i];
  o.x = a[0] + (b[0] - a[0]) * t; o.y = a[1] + (b[1] - a[1]) * t; o.a = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return o;
}
export const pt = () => ({ x: 0, y: 0, a: 0 });
export function distToSeg(px: number, py: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
export const pathDist = (m: MapDef, x: number, y: number) =>
  Math.min(...m.P.flatMap(P => P.seg.map((_, i) => distToSeg(x, y, P.pts[i], P.pts[i + 1]))));
console.assert(distToSeg(5, 5, [0, 0], [10, 0]) === 5 && distToSeg(-3, 4, [0, 0], [10, 0]) === 5, 'distToSeg');
console.assert(Math.abs(posAt(prepPath([[0, 0], [10, 0], [10, 10]]), 15, pt()).y - 5) < 1e-9, 'posAt');

// ---------- Bulles et boss : chaque couche éclatée libère ses enfants ----------
type BubbleSrc = Partial<BubbleType> & Pick<BubbleType, 'n' | 'c' | 's' | 'r' | 'kids'>;
const BT_SRC: Record<string, BubbleSrc> = {
  red:     { n: 'Rouge',      c: '#e8453c', s: 1.0, r: 11,   kids: [] },
  blue:    { n: 'Bleue',      c: '#2f8ae6', s: 1.4, r: 11.5, kids: ['red'] },
  green:   { n: 'Verte',      c: '#36b84a', s: 1.8, r: 12,   kids: ['blue'] },
  yellow:  { n: 'Jaune',      c: '#f5cf1f', s: 2.8, r: 12.5, kids: ['green'] },
  pink:    { n: 'Rose',       c: '#f47cc0', s: 3.0, r: 12.5, kids: ['yellow'] },
  swift:   { n: 'Fusée',      c: '#ff5a1f', s: 4.4, r: 10.5, kids: ['pink'] },
  black:   { n: 'Noire',      c: '#26262e', s: 1.8, r: 9,    kids: ['pink', 'pink'], immune: ['explo'] },
  white:   { n: 'Blanche',    c: '#eef1f6', s: 2.0, r: 9,    kids: ['pink', 'pink'], immune: ['cold'] },
  purple:  { n: 'Violette',   c: '#8a3ad8', s: 3.0, r: 12,   kids: ['pink', 'pink'], immune: ['magic', 'fire'] },
  gold:    { n: 'Dorée',      c: '#ffc61a', s: 2.4, r: 13, hp: 3, kids: ['yellow', 'yellow'], gold: true },
  zebra:   { n: 'Zébrée',     c: '#eef1f6', s: 1.8, r: 12.5, kids: ['black', 'white'], immune: ['explo', 'cold'] },
  lead:    { n: 'Blindée',    c: '#8f99a4', s: 1.0, r: 12.5, kids: ['black', 'black'], immune: ['sharp', 'cold'] },
  ghost:   { n: 'Fantôme',    c: '#c9d6ff', s: 2.2, r: 12,   kids: ['white', 'white'], ghost: true },
  rainbow: { n: 'Prisme',     c: '#ff7a00', s: 2.2, r: 13,   kids: ['zebra', 'zebra'] },
  ceramic: { n: 'Céramique',  c: '#b9733a', s: 2.5, r: 14, hp: 10, kids: ['rainbow', 'rainbow'] },
  d1:      { n: 'Dirigeable', c: '#3f78c8', s: 1.0, r: 30, hp: 200,  kids: ['ceramic', 'ceramic', 'ceramic', 'ceramic'], blimp: 1, dark: '#284f8a', light: '#86b4ec' },
  d2:      { n: 'Cuirassé',   c: '#c8423f', s: .5,  r: 38, hp: 700,  kids: ['d1', 'd1', 'd1', 'd1'], blimp: 2, dark: '#8a2422', light: '#ee8a7f' },
  d3:      { n: 'Forteresse', c: '#3a9a52', s: .28, r: 48, hp: 4000, kids: ['d2', 'd2', 'd2', 'd2'], blimp: 3, dark: '#22663a', light: '#8fd6a2' },
  // Boss : énormes réserves de vie et une mécanique propre (voir bossAct dans engine.ts)
  boss1:   { n: 'Colosse',    c: '#7a4fd0', s: .22, r: 56, hp: 6000,  kids: ['d2', 'd2'], blimp: 4, boss: 1, dark: '#3f2380', light: '#c2a6ff' },
  boss2:   { n: 'Tempête',    c: '#2fb6c9', s: .3,  r: 56, hp: 15000, kids: ['d3', 'd3'], blimp: 4, boss: 2, dark: '#13606b', light: '#9cf0fb' },
  boss3:   { n: 'Hydre',      c: '#4a4a52', s: .2,  r: 62, hp: 30000, kids: ['boss1', 'boss1'], blimp: 4, boss: 3, dark: '#1d1d22', light: '#9a9aa6' },
};
export const BT = {} as Record<string, BubbleType>;
for (const [k, b] of Object.entries(BT_SRC))
  BT[k] = { hp: 1, immune: [], blimp: 0, boss: 0, gold: false, ghost: false, dark: b.c, light: b.c, rbe: 0, ...b, k };
const rbe = (k: string): number => BT[k].rbe ||= BT[k].hp + BT[k].kids.reduce((a, c) => a + rbe(c), 0);
for (const k in BT) rbe(k);
console.assert(BT.black.rbe === 11 && BT.ceramic.rbe === 104 && BT.d1.rbe === 616, 'rbe');
export const BOSS_TEXT: Record<number, string> = {
  1: 'Fait apparaître des céramiques en avançant.',
  2: "Se protège d'un bouclier et accélère par moments.",
  3: 'Libère des dirigeables, puis se divise en deux Colosses.',
};

// Régénération : remonte d'un cran toutes les 3 s, sans dépasser le type d'origine.
const REGROW: Record<string, string> = { red: 'blue', blue: 'green', green: 'yellow', yellow: 'pink', black: 'zebra', white: 'zebra', zebra: 'rainbow', rainbow: 'ceramic' };
export function regrowNext(t: string, max: string): string | null {
  const n = t === 'pink' ? (max === 'white' ? 'white' : 'black') : REGROW[t];
  return n && BT[n].rbe <= BT[max].rbe ? n : null;
}

// ---------- Tours : 2 voies de 4 améliorations ; une voie peut monter à 4 si l'autre reste ≤ 2 ----------
export const TOWERS: Record<string, TowerDef> = {
  mitra: {
    name: 'Mitrailleuse', cost: 200, cat: 'tir', desc: 'Tourelle polyvalente, tir rapide et précis.',
    base: { range: 135, rate: .7, dmg: 1, pierce: 2, kind: 'sharp', speed: 620, proj: 273, mode: 'proj', snd: 'shoot' },
    paths: [
      [['Balles perçantes', 140, '+1 perforation', t => { t.pierce += 1; }],
       ['Canon long', 110, '+30 portée', t => { t.range += 30; }],
       ['Triple canon', 480, 'Tire 3 balles à la fois', t => { t.multi = 3; }],
       ['Rafale infernale', 2800, 'Capacité : cadence x4 pendant 8 s. Tir +43 %', t => { t.rate *= .7; t.ab = 'rafale'; }]],
      [['Cadence rapide', 180, 'Tire 33 % plus vite', t => { t.rate *= .75; }],
       ['Optique thermique', 220, 'Détecte les bulles camouflées', t => { t.camo = true; }],
       ["Balles d'acier", 900, '+1 dégât, perce le blindage', t => { t.dmg += 1; t.kind = 'normal'; }],
       ['Gatling', 3600, 'Cadence x3,3', t => { t.rate *= .3; }]],
    ],
  },
  herisson: {
    name: 'Hérisson', cost: 300, cat: 'zone', desc: 'Projette des pointes dans toutes les directions.',
    base: { range: 90, rate: 1.25, dmg: 1, pierce: 1, kind: 'sharp', speed: 420, proj: 'spike', mode: 'burst', burst: 8, snd: 'shoot' },
    paths: [
      [['12 pointes', 220, '12 pointes par salve', t => { t.burst = 12; }],
       ['16 pointes', 300, '16 pointes par salve', t => { t.burst = 16; }],
       ['Lames', 1100, '+1 dégât, +2 perforation', t => { t.dmg += 1; t.pierce += 2; t.proj = 'blade'; }],
       ['Tempête de lames', 3200, 'Capacité : tempête de 72 lames. Cadence +66 %', t => { t.rate *= .6; t.ab = 'lames'; }]],
      [['Ressort', 200, 'Cadence +33 %', t => { t.rate *= .75; }],
       ['Longue portée', 180, '+25 portée', t => { t.range += 25; }],
       ['Pointes ardentes', 750, 'Pointes de feu : percent le blindage, +1 dégât', t => { t.kind = 'fire'; t.dmg += 1; t.proj = 'fire'; }],
       ['Anneau de feu', 2600, 'Brûle en continu tout ce qui est à portée', t => { t.mode = 'ring'; t.rate = .35; t.dmg += 1; }]],
    ],
  },
  roquette: {
    name: 'Lance-roquettes', cost: 600, cat: 'zone', desc: 'Roquettes à dégâts de zone. Sans effet sur les bulles noires et zébrées.',
    base: { range: 150, rate: 1.4, dmg: 1, pierce: 1, kind: 'explo', speed: 420, proj: 252, blast: 45, mode: 'proj', snd: 'rocket' },
    paths: [
      [['Grosse charge', 380, 'Explosion plus large', t => { t.blast = 65; }],
       ['Charge lourde', 600, '+1 dégât', t => { t.dmg += 1; }],
       ['Fragmentation', 900, "L'explosion projette 8 éclats perçants", t => { t.frags = 8; }],
       ['Frappe orbitale', 4800, 'Capacité : 1000 dégâts à chaque dirigeable. +2 dégâts', t => { t.dmg += 2; t.ab = 'orbitale'; }]],
      [['Longue portée', 250, '+40 portée', t => { t.range += 40; }],
       ['Chargeur rapide', 400, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Missiles chasseurs', 1700, 'Missiles guidés, x4 dégâts aux dirigeables', t => { t.homing = true; t.blimpMul = 4; }],
       ['Tête lourde', 5200, 'Énorme explosion, +4 dégâts', t => { t.blast = 110; t.dmg += 4; }]],
    ],
  },
  givre: {
    name: 'Cryo-tour', cost: 380, cat: 'zone', desc: 'Gèle les bulles proches. Sans effet sur les blanches et les dirigeables.',
    base: { range: 85, rate: 2.2, dmg: 1, pierce: 40, kind: 'cold', freeze: 1.2, mode: 'pulse', snd: 'frost' },
    paths: [
      [['Gel prolongé', 220, 'Gel plus long', t => { t.freeze = 2; }],
       ['Givre persistant', 320, 'Les bulles restent ralenties après le dégel', t => { t.chill = true; }],
       ['Glace profonde', 1300, 'Gèle les blanches et zébrées, ralentit les dirigeables', t => { t.deep = true; }],
       ['Ère glaciaire', 3000, 'Capacité : gèle tout pendant 6 s', t => { t.ab = 'glaciaire'; }]],
      [['Portée', 200, '+20 portée', t => { t.range += 20; }],
       ['Pulsation rapide', 350, 'Cadence +50 %', t => { t.rate *= .66; }],
       ['Glaçons', 950, '+2 dégâts par pulsation', t => { t.dmg += 2; }],
       ['Blizzard', 2700, '+40 portée, cadence x2, détecte le camouflage', t => { t.range += 40; t.rate *= .5; t.camo = true; }]],
    ],
  },
  sniper: {
    name: "Tireur d'élite", cost: 350, cat: 'tir', desc: 'Portée infinie, gros dégâts sur une seule cible.',
    base: { range: 9999, rate: 1.8, dmg: 2, pierce: 1, kind: 'sharp', mode: 'hitscan', snd: 'snipe' },
    paths: [
      [['Balles perforantes', 300, 'Perce le blindage', t => { t.kind = 'normal'; }],
       ['Calibre lourd', 500, '4 dégâts', t => { t.dmg = Math.max(t.dmg, 4); }],
       ['Anti-matériel', 2200, '9 dégâts, x2 aux dirigeables', t => { t.dmg = 9; t.blimpMul = 2; }],
       ['Fusil électromagnétique', 6000, '25 dégâts, traverse 3 cibles', t => { t.dmg = 25; t.pierce = 3; }]],
      [['Lunette thermique', 250, 'Détecte le camouflage', t => { t.camo = true; }],
       ['Culasse rapide', 400, 'Cadence +50 %', t => { t.rate *= .66; }],
       ['Semi-auto', 2000, 'Cadence x2,2', t => { t.rate *= .45; }],
       ['Ravitaillement', 4200, "Capacité : largue une caisse d'argent. Cadence +66 %", t => { t.rate *= .6; t.ab = 'ravitaillement'; }]],
    ],
  },
  glu: {
    name: 'Lanceur de glu', cost: 270, cat: 'soutien', desc: 'Englue les bulles pour les ralentir.',
    base: { range: 120, rate: 1.0, dmg: 0, pierce: 1, kind: 'glue', speed: 450, proj: 'glue', glueT: 6, glueF: .5, mode: 'proj', snd: 'glue' },
    paths: [
      [['Glu corrosive', 300, 'La glu ronge 1 couche toutes les 2 s', t => { t.acid = 2; }],
       ['Acide', 1000, 'Ronge 1 couche par seconde', t => { t.acid = 1; }],
       ['Dissolvant', 2500, 'Englue et ronge aussi les dirigeables', t => { t.glueBlimp = true; }],
       ['Marée de glu', 4500, "Capacité : englue et ronge tout l'écran", t => { t.ab = 'maree'; }]],
      [['Glu épaisse', 200, 'Ralentit davantage', t => { t.glueF = .3; }],
       ['Projection', 300, 'Englue 3 bulles par tir', t => { t.pierce = 3; }],
       ['Glu rapide', 500, 'Cadence x2', t => { t.rate *= .5; }],
       ['Super glu', 3000, 'Immobilise presque totalement', t => { t.glueF = .08; t.glueT = 8; }]],
    ],
  },
  tesla: {
    name: 'Bobine Tesla', cost: 750, cat: 'zone', desc: 'Arc électrique qui rebondit entre les bulles. Sans effet sur les violettes.',
    base: { range: 115, rate: 1.1, dmg: 1, pierce: 4, kind: 'magic', mode: 'chain', snd: 'zap' },
    paths: [
      [['Arc étendu', 450, '+2 rebonds', t => { t.pierce += 2; }],
       ['Surtension', 750, '+1 dégât', t => { t.dmg += 1; }],
       ['Arc géant', 1600, '+6 rebonds, +20 portée', t => { t.pierce += 6; t.range += 20; }],
       ['Tempête électrique', 5000, 'Capacité : cadence x5 pendant 10 s. +2 dégâts', t => { t.dmg += 2; t.ab = 'tempete'; }]],
      [['Condensateurs', 400, 'Cadence +25 %', t => { t.rate *= .8; }],
       ['Détecteur', 300, 'Détecte le camouflage', t => { t.camo = true; }],
       ['Arc focalisé', 1300, 'x3 dégâts aux dirigeables', t => { t.blimpMul = 3; }],
       ['Plasma', 6500, 'Cadence x2,5, +2 dégâts', t => { t.rate *= .4; t.dmg += 2; }]],
    ],
  },
  avion: {
    name: 'Escadrille', cost: 900, cat: 'zone', desc: 'Avion en patrouille qui mitraille dans toutes les directions.',
    base: { range: 0, rate: 1, dmg: 1, pierce: 3, kind: 'sharp', speed: 500, proj: 274, burst: 8, mode: 'plane', snd: 'shoot' },
    paths: [
      [['Tir rapide', 500, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Mitrailleuses x16', 700, '16 balles par salve', t => { t.burst = 16; }],
       ['Missiles chercheurs', 2500, 'Tire aussi des missiles guidés', t => { t.missiles = true; }],
       ['Bombardement', 7000, 'Capacité : tapis de bombes sur tout le parcours', t => { t.ab = 'bombard'; t.rate *= .8; }]],
      [['Balles lourdes', 400, '+3 perforation', t => { t.pierce += 3; }],
       ['Radar de bord', 450, 'Les missiles visent les bulles camouflées', t => { t.camo = true; }],
       ['Soute à bombes', 1800, 'Largue des bombes en vol', t => { t.bombs = true; }],
       ['Forteresse volante', 5500, '+2 dégâts, cadence x2, perce le blindage', t => { t.dmg += 2; t.rate *= .5; t.kind = 'normal'; }]],
    ],
  },
  char: {
    name: 'Char lourd', cost: 1000, cat: 'tir', desc: 'Obus puissants qui traversent plusieurs bulles. x2 contre les dirigeables.',
    base: { range: 145, rate: 1.3, dmg: 4, pierce: 3, kind: 'normal', speed: 700, proj: 275, blimpMul: 2, mode: 'proj', snd: 'boom' },
    paths: [
      [['Obus lourds', 600, '+3 dégâts', t => { t.dmg += 3; }],
       ['Télémètre', 400, '+25 portée', t => { t.range += 25; }],
       ['Obus explosifs', 1500, "Les obus explosent à l'impact", t => { t.blast = 50; }],
       ['Canon de 155', 6000, 'Capacité : salve de 10 obus. Dégâts x2', t => { t.dmg *= 2; t.ab = 'salve'; }]],
      [['Chargeur auto', 700, 'Cadence +33 %', t => { t.rate *= .75; }],
       ['Optique', 350, 'Détecte le camouflage', t => { t.camo = true; }],
       ['Double canon', 2500, 'Deux obus par tir', t => { t.multi = 2; t.twin = true; }],
       ['Mitrailleuse coaxiale', 4000, 'Ajoute une mitrailleuse rapide', t => { t.coax = true; }]],
    ],
  },
  radar: {
    name: 'Station radar', cost: 500, cat: 'soutien', desc: 'Soutien : les tours à portée détectent le camouflage.',
    base: { range: 130, mode: 'support' },
    paths: [
      [['Antennes', 300, '+40 portée de soutien', t => { t.range += 40; }],
       ['Brouilleur', 1500, 'Retire le camouflage des bulles à portée', t => { t.decamo = true; }],
       ['Ciblage avancé', 2000, 'Tours à portée : cadence +20 %', t => { t.bRate = .83; }],
       ['Commandement', 5000, 'Capacité : toutes les tours tirent 2x plus vite 10 s', t => { t.ab = 'commandement'; }]],
      [['Munitions perçantes', 500, 'Tours à portée : +1 perforation', t => { t.bPierce = 1; }],
       ['Obus blindés', 900, 'Tours à portée : percent le blindage', t => { t.bArmor = true; }],
       ['Télémétrie', 1200, 'Tours à portée : +15 % portée', t => { t.bRange = 1.15; }],
       ['Quartier général', 4000, 'Tours à portée : +1 dégât', t => { t.bDmg = 1; }]],
    ],
  },
  mine: {
    name: "Mine d'or", cost: 800, cat: 'soutien', desc: "Rapporte de l'argent à la fin de chaque vague.",
    base: { range: 0, mode: 'income', income: 80 },
    paths: [
      [['Filon', 400, '+60 $ par vague', t => { t.income += 60; }],
       ['Wagonnets', 900, '+100 $ par vague', t => { t.income += 100; }],
       ['Banque', 2400, '+220 $ par vague', t => { t.income += 220; }],
       ['Bourse', 5500, 'Capacité : +1500 $ immédiats. +300 $ par vague', t => { t.income += 300; t.ab = 'bourse'; }]],
      [['Ascenseur', 350, '+50 $ par vague', t => { t.income += 50; }],
       ['Infirmerie', 600, '+3 vies par vague', t => { t.heal = 3; }],
       ['Comptoir', 1800, '+200 $ par vague', t => { t.income += 200; }],
       ['Fort Knox', 6000, '+700 $ et +10 vies par vague', t => { t.income += 700; t.heal = 10; }]],
    ],
  },
  disque: {
    name: 'Lanceur de disques', cost: 330, cat: 'tir', desc: 'Lance des disques qui décrivent une boucle et reviennent.',
    base: { range: 125, rate: 1.1, dmg: 1, pierce: 4, kind: 'sharp', proj: 'disc', mode: 'proj', orbit: true, snd: 'shoot' },
    paths: [
      [['Disques tranchants', 200, '+4 perforation', t => { t.pierce += 4; }],
       ['Disques rouges', 450, '+1 dégât, percent le blindage', t => { t.dmg += 1; t.kind = 'normal'; }],
       ['Double lancer', 900, 'Deux disques en boucles opposées', t => { t.multi = 2; }],
       ['Disque géant', 3600, 'Capacité : un disque géant tourne autour de la tour', t => { t.ab = 'disque'; t.pierce += 6; }]],
      [['Lancer rapide', 220, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Bras long', 180, '+30 portée', t => { t.range += 30; }],
       ['Disques à fusion', 1200, 'x3 dégâts aux dirigeables', t => { t.blimpMul = 3; }],
       ['Glaive', 3200, 'Cadence x2,5, +6 perforation', t => { t.rate *= .4; t.pierce += 6; }]],
    ],
  },
  flamme: {
    name: 'Lance-flammes', cost: 600, cat: 'zone', desc: 'Arrose un cône de flammes. Le feu brûle même les bulles blindées.',
    base: { range: 80, rate: .35, dmg: 1, pierce: 3, kind: 'fire', cone: .35, mode: 'flame', snd: 'rocket' },
    paths: [
      [['Napalm', 350, 'Les bulles brûlent 3 s (1 couche/s)', t => { t.burn = 3; }],
       ['Jet long', 300, '+25 portée', t => { t.range += 25; }],
       ['Flamme bleue', 1300, '+1 dégât', t => { t.dmg += 1; }],
       ['Fournaise', 4200, 'Capacité : vague de feu géante autour de la tour', t => { t.ab = 'fournaise'; }]],
      [['Débit accru', 400, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Cône large', 500, 'Cône plus large, +3 bulles touchées', t => { t.cone = .6; t.pierce += 3; }],
       ['Détecteur thermique', 600, 'Détecte le camouflage', t => { t.camo = true; }],
       ['Dragon', 5500, 'Cadence x2, +2 dégâts, +4 bulles touchées', t => { t.rate *= .5; t.dmg += 2; t.pierce += 4; }]],
    ],
  },
  usine: {
    name: 'Usine à clous', cost: 700, cat: 'zone', desc: 'Dépose des tas de clous sur le chemin à sa portée.',
    base: { range: 110, rate: 2.4, dmg: 1, pierce: 6, kind: 'sharp', mode: 'factory', snd: 'place' },
    paths: [
      [['Gros tas', 400, 'Tas de 10 clous', t => { t.pierce = 10; }],
       ["Clous d'acier", 700, '+1 dégât, percent le blindage', t => { t.dmg += 1; t.kind = 'normal'; }],
       ['Mines à clous', 1800, 'Les tas explosent une fois usés', t => { t.pileBoom = true; }],
       ['Tapis infini', 5000, 'Capacité : couvre le chemin de clous. Tas de 30, +2 dégâts', t => { t.pierce = 30; t.dmg += 2; t.ab = 'tapis'; }]],
      [['Production accélérée', 450, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Grand terrain', 300, '+35 portée', t => { t.range += 35; }],
       ['Placement intelligent', 1100, 'Dépose les clous au plus près de la sortie', t => { t.smart = true; }],
       ['Chaîne industrielle', 4500, 'Cadence x3', t => { t.rate *= .33; }]],
    ],
  },
  mortier: {
    name: 'Mortier', cost: 650, cat: 'zone', desc: "Bombarde le point que tu choisis, n'importe où sur la carte. Touche les bulles camouflées.",
    base: { range: 9999, rate: 1.6, dmg: 1, pierce: 1, kind: 'explo', blast: 45, spread: 28, mode: 'mortar', snd: 'boom' },
    paths: [
      [['Gros obus', 400, 'Explosion plus large', t => { t.blast = 65; }],
       ['Obus lourds', 650, '+1 dégât', t => { t.dmg += 1; }],
       ['Obus incendiaires', 1400, 'Les bulles touchées brûlent 3 s', t => { t.burn = 3; }],
       ['Barrage', 5000, 'Capacité : déluge de 24 obus. +2 dégâts', t => { t.dmg += 2; t.ab = 'barrage'; }]],
      [['Rechargement', 350, 'Cadence +33 %', t => { t.rate *= .75; }],
       ['Précision', 300, 'Les obus tombent plus près du point visé', t => { t.spread = 10; }],
       ['Onde de choc', 1300, 'Étourdit les bulles touchées 0,6 s', t => { t.stun = .6; }],
       ['Artillerie lourde', 4800, 'Cadence x2,5, explosion énorme', t => { t.rate *= .4; t.blast = 85; }]],
    ],
  },
  harpon: {
    name: 'Lance-harpon', cost: 550, cat: 'tir', desc: 'Harpons lents mais dévastateurs contre les dirigeables et les boss (x6).',
    base: { range: 170, rate: 2, dmg: 3, pierce: 1, kind: 'sharp', speed: 650, proj: 'harpoon', blimpMul: 6, mode: 'proj', snd: 'snipe' },
    paths: [
      [['Harpon barbelé', 450, '+3 dégâts', t => { t.dmg += 3; }],
       ['Treuil', 600, 'Les dirigeables harponnés sont ralentis', t => { t.winch = true; }],
       ['Harpon explosif', 1500, "Le harpon explose à l'impact", t => { t.blast = 40; }],
       ['Remorquage', 5500, 'Capacité : ramène le plus gros dirigeable au départ', t => { t.ab = 'remorquage'; }]],
      [['Arbalète', 350, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Pointe tungstène', 400, 'Perce le blindage, +2 perforation', t => { t.kind = 'normal'; t.pierce += 2; }],
       ['Harpons multiples', 1600, 'Tire 3 harpons', t => { t.multi = 3; }],
       ['Baleinier', 5200, 'x12 aux dirigeables, +4 dégâts', t => { t.blimpMul = 12; t.dmg += 4; }]],
    ],
  },
  laser: {
    name: 'Canon laser', cost: 900, cat: 'tir', desc: 'Rayon continu qui traverse les bulles. Chauffe sur une même cible.',
    base: { range: 140, rate: .2, dmg: 1, pierce: 2, kind: 'normal', heatMax: 2, mode: 'beam', snd: 'zap' },
    paths: [
      [['Lentille', 500, '+2 bulles traversées', t => { t.pierce += 2; }],
       ['Surchauffe', 900, "Dégâts jusqu'à x5 en chauffant", t => { t.heatMax = 4; }],
       ['Rayon prismatique', 2400, 'Trois rayons à la fois', t => { t.multi = 3; }],
       ['Rayon solaire', 6000, 'Capacité : cadence x4 pendant 6 s. +2 dégâts', t => { t.dmg += 2; t.ab = 'solaire'; }]],
      [['Focalisation', 400, '+30 portée', t => { t.range += 30; }],
       ['Refroidissement', 700, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Anti-dirigeable', 1600, 'x3 dégâts aux dirigeables', t => { t.blimpMul = 3; }],
       ['Faisceau de la mort', 6500, '+3 dégâts, détecte le camouflage', t => { t.dmg += 3; t.camo = true; }]],
    ],
  },
  vent: {
    name: 'Souffleur', cost: 450, cat: 'soutien', desc: 'Repousse les bulles en arrière sur le chemin. Sans effet sur les dirigeables.',
    base: { range: 90, rate: 1.6, dmg: 0, pierce: 30, push: 40, mode: 'push', snd: 'frost' },
    paths: [
      [['Rafale', 300, 'Repousse plus loin', t => { t.push = 60; }],
       ['Souffle puissant', 900, 'Repousse un peu les dirigeables', t => { t.pushB = true; }],
       ['Cyclone', 1500, 'Repousse très loin et éclate 1 couche', t => { t.push = 100; t.dmg = 1; }],
       ['Ouragan', 4000, "Capacité : repousse toutes les bulles de l'écran", t => { t.ab = 'ouragan'; }]],
      [['Ventilateur', 300, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Grand rayon', 350, '+30 portée', t => { t.range += 30; }],
       ['Désarmement', 1200, 'Retire camouflage et régénération des bulles soufflées', t => { t.strip = true; }],
       ['Typhon', 3800, 'Cadence x2,5', t => { t.rate *= .4; }]],
    ],
  },
  ruche: {
    name: 'Ruche de drones', cost: 750, cat: 'tir', desc: 'Des drones tournent autour de la ruche et tirent chacun de leur côté.',
    base: { range: 150, rate: .8, dmg: 1, pierce: 2, kind: 'sharp', speed: 520, proj: 274, mode: 'drone', drones: 2, snd: 'shoot' },
    paths: [
      [['Drone supplémentaire', 400, '3 drones', t => { t.drones = 3; }],
       ['Lasers de bord', 700, '+1 dégât, percent le blindage', t => { t.dmg += 1; t.kind = 'normal'; }],
       ['Essaim', 1800, '5 drones', t => { t.drones = 5; }],
       ['Nuée', 5000, 'Capacité : 12 drones kamikazes foncent sur les bulles', t => { t.ab = 'nuee'; }]],
      [['Moteurs', 300, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Capteurs', 350, 'Détecte le camouflage', t => { t.camo = true; }],
       ['Patrouille large', 900, '+60 portée', t => { t.range += 60; }],
       ['Drones lourds', 4200, '+3 dégâts, x3 aux dirigeables', t => { t.dmg += 3; t.blimpMul = 3; }]],
    ],
  },
  glacon: {
    name: 'Canon à glace', cost: 420, cat: 'tir', desc: 'Tire des éclats de glace qui ralentissent les bulles touchées.',
    base: { range: 140, rate: .9, dmg: 1, pierce: 1, kind: 'cold', speed: 520, proj: 'ice', slow: .5, mode: 'proj', snd: 'frost' },
    paths: [
      [['Givre', 250, 'Ralentissement plus fort', t => { t.slow = .3; }],
       ['Éclats', 600, 'Les projectiles se brisent en 5 éclats', t => { t.frags = 5; t.shatter = true; }],
       ['Gel profond', 1400, 'Touche les blanches, ralentit fortement les dirigeables', t => { t.deep = true; t.kind = 'normal'; }],
       ['Zéro absolu', 4500, 'Capacité : gèle tout 4 s et inflige 3 dégâts', t => { t.ab = 'zero'; }]],
      [['Cadence', 300, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Portée', 250, '+30 portée', t => { t.range += 30; }],
       ['Pointes de glace', 900, '+1 dégât, +2 perforation', t => { t.dmg += 1; t.pierce += 2; }],
       ['Avalanche', 4000, '3 projectiles, cadence x2', t => { t.multi = 3; t.rate *= .5; }]],
    ],
  },
  arbalete: {
    name: 'Arbalète', cost: 380, cat: 'tir', desc: 'Carreaux puissants avec 10 % de chances de coup critique (x5).',
    base: { range: 165, rate: 1.0, dmg: 2, pierce: 2, kind: 'sharp', speed: 820, proj: 'bolt', critChance: .1, mode: 'proj', snd: 'snipe' },
    paths: [
      [['Carreaux lourds', 300, '+1 dégât', t => { t.dmg += 1; }],
       ['Œil de lynx', 500, '20 % de critiques', t => { t.critChance = .2; }],
       ['Carreaux explosifs', 1500, 'Les carreaux explosent', t => { t.blast = 35; }],
       ['Tir mortel', 5000, 'Capacité : critiques garantis pendant 10 s', t => { t.ab = 'mortel'; }]],
      [['Rechargement rapide', 300, 'Cadence +43 %', t => { t.rate *= .7; }],
       ['Pointes acier', 450, 'Perce le blindage', t => { t.kind = 'normal'; }],
       ['Multitir', 1500, 'Tire 3 carreaux', t => { t.multi = 3; }],
       ['Baliste', 4800, '+5 dégâts, +4 perforation', t => { t.dmg += 5; t.pierce += 4; }]],
    ],
  },
  coffre: {
    name: 'Coffre-fort', cost: 900, cat: 'soutien', desc: 'Accumule de l\'argent avec intérêts à chaque vague. Retire-le quand tu veux.',
    base: { range: 0, mode: 'bank', income: 120, interest: .1, cap: 5000 },
    paths: [
      [['Intérêts', 500, 'Intérêts 15 % par vague', t => { t.interest = .15; }],
       ['Placement', 1200, '+200 $ déposés par vague', t => { t.income += 200; }],
       ['Grand coffre', 2000, 'Plafond 15 000 $', t => { t.cap = 15000; }],
       ['Salle des marchés', 6000, 'Capacité : double le contenu du coffre', t => { t.ab = 'marche'; t.cap = 30000; }]],
      [['Dépôt', 400, '+80 $ déposés par vague', t => { t.income += 80; }],
       ['Assurance', 700, '+2 vies par vague', t => { t.heal = 2; }],
       ['Coffre blindé', 1500, 'Intérêts 20 % par vague', t => { t.interest = Math.max(t.interest, .2); }],
       ['Réserve fédérale', 5500, '+400 $ par vague, intérêts 25 %', t => { t.income += 400; t.interest = .25; }]],
    ],
  },
};
export const TOWER_KEYS = Object.keys(TOWERS);
export const CATS: [TowerDef['cat'], string][] = [['tir', 'Tir'], ['zone', 'Zone'], ['soutien', 'Soutien']];
// Touches physiques (e.code) : même position en AZERTY et QWERTY
export const HOTKEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus',
  'KeyU', 'KeyI', 'KeyO', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyB', 'KeyN', 'KeyV'];
export const HOTLABEL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', ')', 'U', 'I', 'O', 'G', 'H', 'J', 'K', 'L', 'B', 'N', 'V'];
export const ABKEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'], ABLABEL = ['A', 'Z', 'E', 'R', 'T', 'Y'];

export const ABIL: Record<string, { n: string; cd: number }> = {
  rafale: { n: 'Rafale infernale', cd: 45 }, lames: { n: 'Tempête de lames', cd: 40 }, orbitale: { n: 'Frappe orbitale', cd: 60 },
  glaciaire: { n: 'Ère glaciaire', cd: 50 }, ravitaillement: { n: 'Ravitaillement', cd: 60 }, maree: { n: 'Marée de glu', cd: 45 },
  tempete: { n: 'Tempête électrique', cd: 50 }, bombard: { n: 'Bombardement', cd: 45 }, salve: { n: 'Salve de 155', cd: 35 },
  commandement: { n: 'Commandement', cd: 60 }, bourse: { n: 'Bourse', cd: 90 }, disque: { n: 'Disque géant', cd: 40 },
  fournaise: { n: 'Fournaise', cd: 40 }, tapis: { n: 'Tapis infini', cd: 45 }, barrage: { n: 'Barrage', cd: 45 },
  remorquage: { n: 'Remorquage', cd: 60 }, solaire: { n: 'Rayon solaire', cd: 50 }, ouragan: { n: 'Ouragan', cd: 55 },
  nuee: { n: 'Nuée', cd: 45 }, zero: { n: 'Zéro absolu', cd: 50 }, mortel: { n: 'Tir mortel', cd: 50 }, marche: { n: 'Salle des marchés', cd: 120 },
};

export const TRAPS: Record<string, { name: string; short: string; icon: string; cost: number; desc: string }> = {
  clous: { name: 'Tapis de clous', short: 'Clous', icon: 'map-pin', cost: 40, desc: 'Posé sur le chemin : éclate 20 couches puis disparaît (ou en fin de vague).' },
  bombe: { name: 'Mine terrestre', short: 'Mine', icon: 'alert-triangle', cost: 75, desc: 'Posée sur le chemin : explose au passage (4 dégâts, grande zone).' },
  colle: { name: 'Flaque de glu', short: 'Glu', icon: 'sparkles', cost: 55, desc: 'Posée sur le chemin : englue les 30 premières bulles qui passent.' },
};

// ---------- Cartes : tuiles Kenney (sol / chemin), un ou deux chemins ----------
// Nouvelles cartes en fin de liste : l'index sert de clé aux records et sauvegardes.
const MAP_SRC: Omit<MapDef, 'P'>[] = [
  { name: 'Prairie', level: 'Débutant', ground: 158, road: 159, edge: '#7b5530', decor: [131, 132, 134, 135, 136, 137],
    paths: [[[-40, 96], [224, 96], [224, 288], [96, 288], [96, 544], [480, 544], [480, 192], [736, 192], [736, 448], [1064, 448]]] },
  { name: 'Dunes', level: 'Débutant', ground: 161, road: 160, edge: '#6f7f86', decor: [133, 135, 136, 137, 138],
    paths: [[[-40, 560], [160, 560], [160, 96], [384, 96], [384, 448], [608, 448], [608, 96], [864, 96], [864, 680]]] },
  { name: 'Oasis', level: 'Intermédiaire', ground: 158, road: 161, edge: '#c9a46a', decor: [131, 133, 134, 135],
    paths: [[[-40, 180], [720, 180], [720, 520], [320, 520], [320, 70], [900, 70], [900, 680]]] },
  { name: 'Carrière', level: 'Intermédiaire', ground: 160, road: 159, edge: '#5a3d22', decor: [136, 137, 138, 132],
    paths: [[[512, -40], [512, 80], [920, 80], [920, 560], [100, 560], [100, 200], [780, 200], [780, 440], [260, 440], [260, 320], [600, 320]]] },
  { name: 'Deux routes', level: 'Avancé', ground: 159, road: 160, edge: '#55636a', decor: [132, 136, 137, 138],
    paths: [[[-40, 110], [300, 110], [300, 260], [700, 260], [700, 110], [1064, 110]],
            [[-40, 530], [300, 530], [300, 380], [700, 380], [700, 530], [1064, 530]]] },
  { name: 'Éclair', level: 'Expert', ground: 161, road: 159, edge: '#7b5530', decor: [133, 135, 136, 138],
    paths: [[[1064, 110], [620, 110], [420, 530], [-40, 530]]] },
  { name: 'Serpentin', level: 'Débutant', ground: 161, road: 159, edge: '#7b5530', decor: [133, 135, 136, 137],
    paths: [[[80, -40], [80, 560], [252, 560], [252, 80], [424, 80], [424, 560], [596, 560], [596, 80], [768, 80], [768, 560], [940, 560], [940, -40]]] },
  { name: 'Lagon', level: 'Intermédiaire', ground: 158, road: 160, edge: '#55636a', decor: [131, 132, 134, 136],
    paths: [[[-40, 320], [160, 320], [160, 80], [860, 80], [860, 560], [160, 560], [160, 440], [700, 440], [700, 210], [320, 210], [320, 320], [540, 320]]] },
  { name: 'Croisement', level: 'Avancé', ground: 158, road: 159, edge: '#7b5530', decor: [131, 132, 135, 137],
    paths: [[[-40, 120], [300, 120], [724, 520], [1064, 520]],
            [[-40, 520], [300, 520], [724, 120], [1064, 120]]] },
  { name: 'Autoroute', level: 'Expert', ground: 160, road: 159, edge: '#5a3d22', decor: [136, 137, 138, 132],
    paths: [[[-40, 320], [1064, 320]]] },
  { name: 'Spirale', level: 'Avancé', ground: 161, road: 160, edge: '#6f7f86', decor: [133, 135, 137, 138],
    paths: [[[-40, 60], [960, 60], [960, 580], [70, 580], [70, 170], [850, 170], [850, 470], [180, 470], [180, 290], [620, 290]]] },
  { name: 'Trois voies', level: 'Expert', ground: 158, road: 161, edge: '#c9a46a', decor: [131, 132, 134, 135],
    paths: [[[-40, 90], [420, 90], [420, 200], [1064, 200]], [[-40, 320], [1064, 320]], [[-40, 550], [420, 550], [420, 440], [1064, 440]]] },
];
export const MAPS: MapDef[] = MAP_SRC.map(m => ({ ...m, P: m.paths.map(prepPath) }));

export const MODES: GameMode[] = [
  { k: 'std',  name: 'Standard',     desc: 'Survis à toutes les vagues pour gagner la médaille.' },
  { k: 'apoc', name: 'Apocalypse',   desc: "Les vagues s'enchaînent sans pause et sans fin. Tiens le plus longtemps possible." },
  { k: 'defl', name: 'Déflation',    desc: '20 000 $ au départ, puis plus aucun gain. Mines et coffres interdits.', ban: ['mine', 'coffre'], money: 20000, noCash: true },
  { k: 'half', name: 'Demi-argent',  desc: 'Les bulles rapportent moitié moins.', cashMul: .5 },
  { k: 'eco',  name: 'Disette',      desc: 'Aucun bonus de fin de vague, mines et coffres interdits.', ban: ['mine', 'coffre'], noBonus: true },
  { k: 'hard', name: 'Sans retour',  desc: 'Impossible de vendre une tour. Les améliorations sont limitées au niveau 3.', noSell: true, maxTier: 3 },
  { k: 'fast', name: 'Turbo',        desc: 'Toutes les bulles vont 40 % plus vite.', fastBubbles: true },
];

// Rang du joueur : l'XP gagnée à chaque vague débloque les tours.
export const TOWER_RANK: Record<string, number> = {
  mitra: 1, herisson: 1, glu: 2, disque: 2, roquette: 3, glacon: 3, givre: 4, arbalete: 4, sniper: 5, flamme: 5, mine: 6, ruche: 6,
  tesla: 7, usine: 7, char: 8, coffre: 8, mortier: 9, radar: 9, avion: 10, harpon: 11, laser: 12, vent: 13,
};
export const xpFor = (r: number) => 100 * (r - 1) * r / 2;
export const rankOf = (xp: number) => { let r = 1; while (xp >= xpFor(r + 1)) r++; return r; };
console.assert(rankOf(0) === 1 && rankOf(100) === 2 && rankOf(299) === 2 && rankOf(300) === 3, 'rangs');

export const DIFFS: Diff[] = [
  { name: 'Facile',     lives: 200, money: 650, cost: .85, waves: 40,  sell: .8, boss: .3 },
  { name: 'Moyen',      lives: 150, money: 650, cost: 1,   waves: 60,  sell: .75, boss: .6 },
  { name: 'Difficile',  lives: 100, money: 650, cost: 1.08, waves: 80, sell: .7, boss: .85 },
  { name: 'Impossible', lives: 1,   money: 650, cost: 1.2, waves: 100, sell: .7, boss: 1 },
];

// ---------- Vagues : budget de couches (RBE) croissant, composition selon les types débloqués ----------
const UNLOCK: [string, number][] = [['red', 1], ['blue', 2], ['green', 5], ['yellow', 10], ['pink', 13], ['swift', 15], ['black', 16], ['white', 18],
  ['purple', 30], ['zebra', 22], ['lead', 24], ['ghost', 34], ['rainbow', 27], ['ceramic', 32], ['d1', 40], ['d2', 60], ['d3', 80]];
const budget = (n: number) => 10 * n + .55 * n * n + (n > 40 ? 1500 * (1.1 ** (n - 40) - 1) : 0);
export const BOSS_WAVES: Record<number, [string, number][]> = {
  25: [['boss1', 1]], 40: [['d1', 1]], 50: [['boss2', 1]], 60: [['d2', 1]], 75: [['boss3', 1]], 80: [['d3', 1]], 100: [['boss3', 1], ['boss2', 1]],
};
export const isBossWave = (n: number) => (BOSS_WAVES[n] ?? []).some(([t]) => BT[t].boss > 0);

export function waveGroups(n: number): Group[] {
  const avail = UNLOCK.filter(u => u[1] <= n).map(u => u[0]);
  let B = budget(n);
  const G: Group[] = [];
  const boss = BOSS_WAVES[n] ?? (n > 100 && n % 25 === 0 ? [['boss3', Math.floor(n / 50)]] as [string, number][] : null);
  if (boss) { for (const [t, c] of boss) G.push({ t, c }); B *= BT[boss[0][0]].boss ? .35 : .5; }
  const ti = Math.max(0, avail.findLastIndex(t => BT[t].rbe * 10 <= B));
  const mix: [string, number][] = [[avail[ti], .45], [avail[Math.max(0, ti - 1)], .3], [avail[Math.max(0, ti - 3)], .25]];
  mix.forEach(([t, f], i) => {
    const c = Math.max(1, Math.round(B * f / BT[t].rbe));
    const camo = n >= 20 && !BT[t].blimp && ((i === 1 && n % 2 === 0) || (i === 0 && n >= 45 && n % 3 === 0));
    const rg = n >= 25 && !BT[t].blimp && t !== 'lead' && ((i === 2 && n % 3 !== 0) || (i === 0 && n >= 50 && n % 2 === 1));
    const fort = n >= 55 && (t === 'ceramic' || t === 'lead' || BT[t].blimp > 0) && n % 2 === 0;
    const same = G.find(g => g.t === t && g.camo === camo && g.rg === rg && g.fort === fort);
    if (same) same.c += c; else G.push({ t, c, camo, rg, fort });
  });
  if (n % 10 === 5) G.push({ t: 'gold', c: 1 + Math.floor(n / 30) }); // bulle dorée bonus
  return G;
}

export function buildQueue(n: number, nPaths: number): QueueItem[] {
  const q: QueueItem[] = [];
  let start = 0, k = 0;
  const pace = Math.max(.3, 1 - n / 90);
  for (const g of waveGroups(n)) {
    const base = BT[g.t].boss ? 6 : BT[g.t].blimp ? 2.5 : g.t === 'ceramic' ? .55 : .4;
    const gap = Math.max(.05, Math.min(base * pace, 20 / g.c));
    for (let i = 0; i < g.c; i++) q.push({ t: g.t, time: start + i * gap, camo: g.camo, rg: g.rg, fort: g.fort, p: k++ % nPaths });
    start += g.c * gap * .55 + .5;
  }
  return q.sort((a, b) => a.time - b.time);
}
console.assert(waveGroups(1).length === 1 && waveGroups(1)[0].t === 'red', 'vague 1');
console.assert(waveGroups(25).some(g => g.t === 'boss1') && buildQueue(30, 2).length > 20, 'vagues');

// ---------- Succès ----------
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'pop1k', n: 'Éclateur', d: 'Éclater 1 000 bulles', icon: 'sparkles', test: s => s.pops >= 1000 },
  { id: 'pop10k', n: 'Machine à éclater', d: 'Éclater 10 000 bulles', icon: 'sparkles', test: s => s.pops >= 10000 },
  { id: 'pop100k', n: 'Légende du pop', d: 'Éclater 100 000 bulles', icon: 'sparkles', test: s => s.pops >= 100000 },
  { id: 'gold', n: "Chercheur d'or", d: 'Éclater 10 bulles dorées', icon: 'piggy-bank', test: s => s.golds >= 10 },
  { id: 'blimp1', n: 'Chasseur de dirigeables', d: 'Abattre un dirigeable', icon: 'star', test: s => s.blimps >= 1 },
  { id: 'blimp100', n: 'Fléau des airs', d: 'Abattre 100 dirigeables', icon: 'star', test: s => s.blimps >= 100 },
  { id: 'boss1', n: 'Tueur de géants', d: 'Vaincre un boss', icon: 'crown', test: s => s.bosses >= 1 },
  { id: 'hydra', n: "L'Hydre est tombée", d: "Vaincre l'Hydre", icon: 'crown', test: s => s.hydra >= 1 },
  { id: 'win0', n: 'Premiers pas', d: 'Gagner une partie en Facile', icon: 'check', test: s => s.winDiffs.includes(0) },
  { id: 'win1', n: 'Stratège', d: 'Gagner une partie en Moyen', icon: 'check', test: s => s.winDiffs.includes(1) },
  { id: 'win2', n: 'Général', d: 'Gagner une partie en Difficile', icon: 'check', test: s => s.winDiffs.includes(2) },
  { id: 'win3', n: 'Intouchable', d: 'Gagner une partie en Impossible', icon: 'crown', test: s => s.winDiffs.includes(3) },
  { id: 'perfect', n: 'Sans une égratignure', d: 'Gagner sans perdre une seule vie', icon: 'heart', test: s => s.perfect },
  { id: 'apoc30', n: 'Survivant', d: 'Atteindre la vague 30 en Apocalypse', icon: 'clock', test: s => s.apocBest >= 30 },
  { id: 'defl', n: 'Économe', d: 'Gagner en Déflation', icon: 'piggy-bank', test: s => s.winModes.includes('defl') },
  { id: 'hard', n: 'Pas de regrets', d: 'Gagner en Sans retour', icon: 'lock', test: s => s.winModes.includes('hard') },
  { id: 'tier4', n: 'Spécialiste', d: 'Amener une tour au niveau 4', icon: 'arrow-up', test: s => s.t4types.length >= 1 },
  { id: 'tier4x10', n: 'Collectionneur', d: 'Niveau 4 sur 10 types de tours différents', icon: 'grid', test: s => s.t4types.length >= 10 },
  { id: 'towers500', n: 'Bâtisseur', d: 'Poser 500 tours au total', icon: 'home', test: s => s.towers >= 500 },
  { id: 'ab50', n: 'Pouvoirs', d: 'Utiliser 50 capacités', icon: 'sparkles', test: s => s.abilities >= 50 },
  { id: 'sell100', n: 'Brocanteur', d: 'Vendre 100 tours', icon: 'card', test: s => s.sold >= 100 },
  { id: 'rich', n: 'Millionnaire', d: 'Avoir 20 000 $ en même temps', icon: 'piggy-bank', test: s => s.maxMoney >= 20000 },
  { id: 'rank10', n: 'Vétéran', d: 'Atteindre le rang 10', icon: 'star', test: (_s, p) => rankOf(p.xp) >= 10 },
  { id: 'rank20', n: 'Maître', d: 'Atteindre le rang 20', icon: 'crown', test: (_s, p) => rankOf(p.xp) >= 20 },
  { id: 'maps', n: 'Globe-trotter', d: 'Gagner sur 6 cartes différentes', icon: 'globe', test: s => s.mapsWon.length >= 6 },
  { id: 'konami', n: 'Code Konami', d: "Entrer le code secret — débloque l'IA qui joue à ta place", icon: 'sparkles', secret: true, test: () => false },
];

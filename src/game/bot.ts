// IA qui joue à la place du joueur (débloquée par le code Konami).
// Principe : on lit la composition des prochaines vagues, chemin par chemin (couches, camouflage,
// bulles résistantes, dirigeables et boss), on estime ce que chaque tour inflige selon sa mécanique
// et la portion de chaque chemin qu'elle couvre, puis on achète l'action (nouvelle tour ou
// amélioration, notée sur la meilleure suite d'améliorations qu'elle ouvre) qui comble le plus
// gros manque par dollar. Quand la défense est assurée, l'argent part dans l'économie.
// Banc d'essai : node scripts/bot-bench.mjs
import { BT, H, MODES, TOWERS, TOWER_KEYS, TRAPS, W, buildQueue, isBossWave, pathDist, posAt, terrainOk } from './data';
import {
  abilityGroups, buyUpgrade, canPlace, placeTower, placeTrap, priceOf, sell, sellValue, startWave, towerOk, upState, useAbilityGroup, withdraw,
} from './engine';
import { ghostTower } from './render';
import type { Buffs, Game, Kind, MapDef, Tower, Trap } from './types';

// Bulles qui résistent à certains dégâts : il faut des tours capables de les toucher, elles.
const RES = ['lead', 'black', 'white', 'purple', 'zebra'];
// Catégories de besoin, pour chaque chemin : 0 couches, 1 camouflage, 2 dirigeables/boss,
// 3..7 dégâts qui passent sur chaque bulle résistante, 8 couches lâchées en route par un boss (seules
// les tours placées plus loin sur le chemin les rattrapent). Un vecteur = NC catégories x NP chemins.
const LATE = 3 + RES.length, NC = LATE + 1;
type Vec = number[];
let NP = 1;
const zero = (): Vec => new Array(NC * NP).fill(0);

// ---------- Carte : échantillons des chemins et emplacements possibles ----------
interface Spot { x: number; y: number; d: Float32Array[]; cc?: Map<number, number[]> } // cc : couverture déjà calculée, par portée // d[p] : distances triées aux échantillons du chemin p
interface MapInfo { m: MapDef; pts: { x: number; y: number }[][]; spots: Spot[]; len: number[]; end: number[]; ones: number[]; halves: number[]; mortar: number[] } // end : dernier point visible du chemin
let MI: MapInfo | null = null;
const STEP = 10;
function mapInfo(m: MapDef): MapInfo {
  NP = m.P.length;
  if (MI?.m === m) return MI;
  const pts = m.P.map(P => {
    const out: { x: number; y: number }[] = [];
    for (let d = 0; d < P.len; d += STEP) {
      const o = posAt(P, d, { x: 0, y: 0, a: 0 });
      if (o.x > 0 && o.y > 0 && o.x < W && o.y < H) out.push({ x: o.x, y: o.y });
    }
    return out;
  });
  const spots: Spot[] = [];
  for (let y = 24; y <= H - 24; y += 20) for (let x = 24; x <= W - 24; x += 20) {
    if (pathDist(m, x, y) < 40 || m.decorObjs!.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 14)) continue;
    spots.push({ x, y, d: pts.map(ps => Float32Array.from(ps.map(p => Math.hypot(p.x - x, p.y - y))).sort()) });
  }
  const end = m.P.map(P => {
    let d = P.len;
    for (const o = { x: 0, y: 0, a: 0 }; d > 0; d -= 5) { posAt(P, d, o); if (o.x > 20 && o.y > 20 && o.x < W - 20 && o.y < H - 20) break; }
    return d;
  });
  const len = m.P.map(P => P.len);
  return MI = { m, pts, spots, len, end, ones: len.map(() => 1), halves: len.map(() => .5), mortar: len.map((_, q) => (q ? 0 : 300)) };
}
// Longueur (px) de chaque chemin à portée R. Résultat gardé sur l'emplacement : à ne pas modifier par l'appelant.
function covAt(s: Spot, R: number) {
  const cc = s.cc ??= new Map<number, number[]>();
  let out = cc.get(R);
  if (out) return out;
  out = s.d.map(d => {
    let lo = 0, hi = d.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (d[mid] < R) lo = mid + 1; else hi = mid; }
    return lo * STEP;
  });
  if (cc.size > 24) cc.clear();
  cc.set(R, out);
  return out;
}
// Même chose pour une tour posée : ses distances triées sont calculées une fois (une tour ne bouge pas).
const towerSpot = new WeakMap<Tower, Spot>();
function covT(t: Tower, R: number) {
  let sp = towerSpot.get(t);
  if (!sp) towerSpot.set(t, sp = { x: t.x, y: t.y, d: MI!.pts.map(ps => Float32Array.from(ps.map(p => Math.hypot(p.x - t.x, p.y - t.y))).sort()) });
  return covAt(sp, R);
}
// Part de la couverture pondérée par la position sur le chemin (0 à l'entrée, 1 à la sortie) :
// une bulle lâchée par un boss à mi-chemin n'est rattrapée que par les tours situées après.
const lateCache = new Map<number, Map<number | string, number[]>>(); // portée -> position -> résultat
let lateN = 0;
function lateAt(x: number, y: number, R: number) {
  let byR = lateCache.get(R);
  if (!byR) lateCache.set(R, byR = new Map());
  const key = Number.isInteger(x) && Number.isInteger(y) ? x * 4096 + y : x + '|' + y;
  let l = byR.get(key);
  if (!l) {
    if (lateN > 20000) { lateCache.clear(); lateN = 0; lateCache.set(R, byR = new Map()); }
    lateN++;
    byR.set(key, l = MI!.pts.map(ps => {
      let a = 0, n = 0;
      for (let j = 0; j < ps.length; j++) { const p = ps[j]; if ((p.x - x) ** 2 + (p.y - y) ** 2 < R * R) { a += j / ps.length; n++; } }
      return n ? a / n : 0;
    }));
  }
  return l;
}
// Portée utile pour la couverture : l'avion patrouille autour de sa piste.
const reach = (t: Tower, bf: Buffs) => (t.mode === 'plane' ? 200 : t.range * bf.range);

// ---------- Modèle des tours : dégâts/s effectifs selon la mécanique ----------
const NOBUF: Buffs = { range: 1, rate: 1, camo: false, pierce: 0, dmg: 0, armor: false };
const isEco = (t: Tower) => t.mode === 'income' || t.mode === 'bank';
// Pour un type de dégât : quelles bulles de RES il touche (rien si le type est absent).
const okTab = new Map<string, boolean[]>(), none = RES.map(() => false);
function resists(kind: string | undefined) {
  if (!kind) return none;
  let r = okTab.get(kind);
  if (!r) okTab.set(kind, r = RES.map(b => !BT[b].immune.includes(kind as Kind)));
  return r;
}
// Contribution d'une tour à chaque catégorie de chaque chemin, selon sa couverture cov[p] (px).
function contrib(t: Tower, bf: Buffs, cov: number[]): Vec {
  const v = zero();
  if (t.mode === 'support' || isEco(t)) return v;
  const r = t.rate * bf.rate, d = t.dmg + (t.dmg > 0 ? bf.dmg : 0), p = t.pierce + bf.pierce, m = t.multi || 1;
  let kind = t.kind === 'sharp' && bf.armor ? 'normal' : t.kind;
  const crit = 1 + 4 * (t.critChance || 0), bm = t.blimpMul || 1;
  let dps = 0, bdps = 0, camo = t.camo || bf.camo;
  switch (t.mode) {
    case 'proj':
      if (t.kind === 'glue') { // ralentit (vaut un peu de dégâts) et ronge avec l'acide
        const glued = Math.min(p, 3) * t.glueT / r;
        dps = (t.acid ? glued / t.acid : 0) + (1 - t.glueF) * Math.min(p, 3) / r * .5;
        bdps = t.glueBlimp && t.acid ? 8 / t.acid : 0; kind = 'normal';
        break;
      }
      dps = d * Math.min(p, 1 + (p - 1) * .7) * m / r * crit;
      bdps = d * m / r * bm * crit;
      if (t.blast) { const bd = t.kind === 'explo' ? d : Math.ceil(d / 2); dps += bd * 3 * m / r; bdps += bd * m / r * bm; }
      if (t.frags) dps += t.frags * .4 * m / r;
      if (t.homing) dps *= 1.1;
      if (t.coax) { dps += 12; bdps += 6; }
      break;
    case 'burst': dps = d * p * t.burst / r * .3; bdps = d * t.burst / r * .4 * bm; break;
    case 'ring': dps = d * 6 / r; bdps = d / r; break;
    case 'pulse': // le gel ne tue pas : il compte peu
      dps = d * Math.min(p, 8) / r + t.freeze * Math.min(p, 8) / r * (t.chill ? .4 : .25); bdps = t.deep ? d / r : 0;
      kind = t.deep ? 'normal' : 'cold'; camo = true; break;
    case 'hitscan': dps = d * p / r * crit; bdps = d / r * bm * crit; break;
    case 'factory': dps = d * p / r * .6 + (t.pileBoom ? 3 / r : 0); bdps = d / r * .5; camo = true; break;
    case 'mortar': dps = d * 4 / r + (t.burn ? 3 / r : 0) + (t.stun ? 2 / r : 0); bdps = d / r; camo = true; kind = 'explo'; break;
    case 'flame': dps = d * Math.min(p, 6) / r + (t.burn ? t.burn * Math.min(p, 6) / r * .4 : 0); bdps = d / r * bm; break;
    case 'beam': dps = d * (1 + t.heatMax * .3) * Math.min(p, 4) * m / r; bdps = d * (1 + t.heatMax) * m / r * bm; break;
    case 'chain': dps = d * p / r * .8; bdps = d / r * bm; kind = 'magic'; break;
    case 'plane':
      dps = d * p * t.burst / r * .25 + (t.missiles ? 10 : 0) + (t.bombs ? 8 + (t.up[1] > 3 ? 6 : 0) : 0);
      bdps = d * t.burst / r * .2 + (t.missiles ? 6 : 0); camo = true; break;
    case 'drone': dps = t.drones * d * Math.min(p, 2) / r; bdps = t.drones * d / r * bm; break;
    case 'push': dps = (t.dmg ? d * Math.min(p, 10) / r : 0) + t.push * Math.min(p, 10) / r / 100; bdps = 0; kind = 'normal'; camo = true; break;
  }
  if (t.ab) { dps *= 1.2; bdps *= 1.2; }
  // Portée infinie : partagée entre les chemins. Le mortier vise par défaut le milieu du premier chemin.
  const inf = t.range * bf.range >= 2000 && t.mode !== 'mortar';
  const c = t.mode === 'mortar' ? MI!.mortar : cov, tot = c.reduce((a, x) => a + x, 0);
  const late = inf ? MI!.ones : t.mode === 'mortar' ? MI!.halves : lateAt(t.x, t.y, reach(t, bf)), ok = resists(kind);
  for (let q = 0; q < NP; q++) {
    const share = inf ? 1 / NP : tot ? c[q] / tot * Math.min(1, tot / 300) : 0, o = q * NC;
    v[o] = dps * share; v[o + 1] = camo ? v[o] : 0;
    // Un dirigeable subit bdps pendant le temps qu'il passe à portée : bdps x longueur couverte.
    v[o + 2] = bdps * (inf ? MI!.len[q] : c[q]) / 1000;
    for (let i = 0; i < ok.length; i++) v[o + 3 + i] = ok[i] ? v[o] : 0;
    v[o + LATE] = v[o] * late[q];
  }
  return v;
}
// Buffs qu'une station radar donnerait à une tour placée en (x, y)
function buffsAt(towers: Tower[], x: number, y: number): Buffs {
  const bf = { ...NOBUF };
  for (const r of towers) {
    if (r.mode !== 'support' || Math.hypot(x - r.x, y - r.y) > r.range) continue;
    bf.camo = true;
    if (r.bRate) bf.rate = Math.min(bf.rate, r.bRate);
    if (r.bPierce) bf.pierce = 1;
    if (r.bArmor) bf.armor = true;
    if (r.bRange) bf.range = Math.max(bf.range, r.bRange);
    if (r.bDmg) bf.dmg = 1;
  }
  return bf;
}

// ---------- Ce que demandent les prochaines vagues ----------
const layersOf = (t: string, b: string): number => (t === b ? BT[t].hp : 0) + BT[t].kids.reduce((a, c) => a + layersOf(c, b), 0);
const blimpPart = (t: string): number => (BT[t].blimp ? BT[t].hp : 0) + BT[t].kids.reduce((a, c) => a + blimpPart(c), 0);
// Comme dans le moteur : ce que libère un boss descend de 2 crans en Facile, 1 en Moyen.
const soft = (t: string, boss: number, n = boss < .5 ? 2 : boss < .7 ? 1 : 0): string => n ? soft(BT[t].kids[0] ?? t, boss, n - 1) : t;
// PV x vitesse de chaque coque de dirigeable (le boss et ses enfants avancent à des vitesses différentes)
const blimpWork = (t: string, boss: number): number => (BT[t].blimp ? BT[t].hp * (BT[t].boss ? boss : 1) * 50 * BT[t].s : 0)
  + BT[t].kids.reduce((a, c) => a + blimpWork(BT[t].boss ? soft(c, boss) : c, boss), 0);
// Ajoute un flux de bulles de type t (bulles/s) sur le chemin o (décalage dans le vecteur).
function addLayers(v: Vec, o: number, t: string, perSec: number, camo: boolean) {
  const l = (BT[t].rbe - blimpPart(t)) * perSec;
  v[o] += l; if (camo) v[o + 1] += l;
  RES.forEach((b, i) => { v[o + 3 + i] += layersOf(t, b) * perSec; });
}
const needCache = new Map<string, Vec>();
function waveNeed(S: Game, n: number): Vec {
  const key = S.mi + ':' + S.di + ':' + S.mode + ':' + n + ':' + TUNE.boss + ':' + TUNE.burst;
  const hit = needCache.get(key);
  if (hit) return hit;
  const v = zero(), q = buildQueue(n, NP), fast = S.MD.fastBubbles ? 1.4 : 1;
  const T = (q.length ? q[q.length - 1].time : 0) + 8;
  for (const it of q) {
    const B = BT[it.t], f = it.fort ? 2 : 1, o = it.p * NC, cross = MI!.len[it.p] / (50 * B.s * fast);
    // Dirigeable : il faut lui infliger ses PV pendant sa traversée, soit PV x vitesse (« dégâts/s x px »).
    // Tempête : bouclier 2,5 s sur 7 (intouchable et 2,5x plus rapide), il faut ~2,4x plus de puissance.
    // Contre un boss, les tours tirent aussi sur ce qu'il lâche et ratent : il faut une marge en plus (TUNE.boss).
    if (B.blimp) v[o + 2] += blimpWork(it.t, S.D.boss ?? 1) * f * fast / 1000 * (B.boss === 2 ? 2.4 : 1) * (B.boss ? TUNE.boss : 1);
    // Ce que les boss lâchent en route (pendant environ la moitié de leur traversée).
    if (B.boss === 1) {
      const t = soft('ceramic', S.D.boss ?? 1);
      addLayers(v, o, t, 3 / 4, !!it.camo);
      v[o + LATE] += (BT[t].rbe - blimpPart(t)) * 3 / 4;
    }
    if (B.boss === 3) v[o + 2] += cross * .5 / 6 * 2 * blimpWork(soft('d1', S.D.boss ?? 1), 1) * fast / 1000 / 2;
    // Les couches cachées dans un dirigeable sortent au fil de sa traversée, pas toutes au début de la vague.
    // Celles d'un boss sortent d'un coup à sa mort : il faut les éclater en quelques secondes (TUNE.burst).
    if (B.boss) for (const k of B.kids) addLayers(v, o, soft(k, S.D.boss ?? 1), 1 / TUNE.burst, !!it.camo);
    else addLayers(v, o, it.t, (it.rg ? 1.3 : 1) / (B.blimp ? T + cross : T), !!it.camo);
  }
  for (let q2 = 0; q2 < NP; q2++) {
    const o = q2 * NC;
    v[o] *= fast; v[o + 1] *= fast;
    v[o + LATE] *= fast;
    for (let i = 3; i < LATE; i++) if (v[o + i]) v[o + i] = Math.max(3, v[o + i] * fast); // une seule bulle résistante qui passe coûte cher
  }
  needCache.set(key, v);
  return v;
}

// Réglages de l'IA, ajustés par node scripts/bot-tune.mjs (le banc d'essai peut les remplacer).
export const TUNE = {
  k1: 1.6, k2: 1.25, k3: 1.1, // marge de sécurité selon les vies (1 vie, moins de 120, plus)
  leak: 1.3, kmax: 2.5, // prudence en plus après une fuite, et son plafond
  safe: 1.25, // dégâts visés par rapport au besoin
  margin: 3, // plafond du surplus, en multiple du besoin à venir
  urgent: 4, later: 2, extra: .3, // poids : manque urgent, manque à venir, surplus
  spot: .02, // coût d'une place, en fraction de l'argent disponible
  roi: .3, // rentabilité minimale d'un achat d'économie
  save: .95, // action abordable acceptée si elle vaut au moins cette part de la meilleure
  rush: .9, // même chose quand la défense manque
  low: .4, high: .9, // ... et selon les vies restantes : on n'épargne plus sous « low », pleinement au-dessus de « high » (part des vies de départ)
  blimp: 3, // poids des dégâts anti-dirigeable
  boss: 1, // besoin anti-boss en plus (les tours se dispersent sur ce qu'il lâche)
  burst: 12, // secondes pour éclater tout ce qu'un boss libère à sa mort
  traps: 2, // mines d'urgence gardées en réserve quand il reste 20 vies ou moins
};

// ---------- État de l'IA pour la partie en cours ----------
let cur: Game | null = null, tick = 0, K = 1, lastLives = 0, lastWave = 0, waveLives = 0, leaking = false, soldWave = -1;
let myTraps: { p: number; d: number; tr: Trap }[] = [], trapSpent = 0; // pièges d'urgence posés par l'IA, et ce qu'ils ont coûté pendant la vague

function reset(S: Game) {
  cur = S; tick = 0; myTraps = []; trapSpent = 0; spotCache.clear(); chainCache.clear(); lateCache.clear(); lateN = 0; freeN = -1; soldWave = -1; lastLives = waveLives = S.lives; lastWave = S.wave;
  K = S.lives <= 1 ? TUNE.k1 : S.lives < 120 ? TUNE.k2 : TUNE.k3; // une seule vie : marge de sécurité plus grande
  mapInfo(S.m);
}

export function botAct(S: Game, dt: number) {
  if (cur !== S) reset(S);
  if (!S.running && S.autoT <= 0 && !S.over) startWave();
  emergency(S);
  if ((tick -= dt) > 0) return;
  tick = .5;
  // À chaque nouvelle vague, l'IA devient plus prudente pour le reste de la partie selon ce que la vague précédente
  // a coûté : 10 % des vies perdues, ou deux mines d'urgence, = prudence maximale (TUNE.leak).
  if (S.wave !== lastWave) {
    K = Math.min(TUNE.kmax, K * (1 + (TUNE.leak - 1) * Math.min(1, Math.max(0, waveLives - S.lives) / (waveLives * .1) + trapSpent / (2 * priceOf(TRAPS.bombe.cost)))));
    lastWave = S.wave; waveLives = S.lives; trapSpent = 0;
  }
  // Une fuite déclenche un achat urgent ; un piège d'urgence aussi : sans lui, la bulle passait.
  leaking = S.lives < lastLives || trapSpent > 0;
  lastLives = S.lives;
  abilities(S);
  if (!spend(S)) return;
  tick = 0; // un achat par image au plus : un gros retrait se dépense vite sans figer l'écran
  // Les tours fortes contre les dirigeables visent la bulle la plus grosse (le boss) plutôt que la première.
  for (const t of S.towers) if (t.blimpMul > 1 || t.mode === 'hitscan') t.prio = 2;
}

// Pièges à empiler pour détruire entièrement une bulle : [clous, mines]. Une mine fait 4 dégâts de zone (le reste
// passe à la première bulle libérée) ; des clous n'en font qu'un par bulle : ils servent contre ce qui résiste aux explosions.
const planCache = new Map<string, [number, number]>();
function trapPlan(t: string, hp = BT[t].hp, left = 0): [number, number] {
  const B = BT[t], full = hp === B.hp && !left, hit = full && planCache.get(t);
  if (hit) return hit;
  const kids = (carry: number) => B.kids.map((k, i) => trapPlan(k, BT[k].hp, i ? 0 : carry))
    .reduce((a, b) => (b[0] + b[1] > a[0] + a[1] ? b : a), [0, 0] as [number, number]);
  let out: [number, number];
  if (!B.immune.includes('explo')) {
    if (left > 0) out = hp > left ? trapPlan(t, hp - left) : kids(left - hp);
    else if (hp <= 1 && !B.kids.length) out = [1, 0]; // dernière couche : des clous suffisent, pour 20 bulles
    else { const [c, b] = trapPlan(t, hp, 4); out = [c, b + 1]; }
  } else if (B.immune.includes('sharp')) out = [0, 0]; // aucun piège n'y fait rien
  else { const [c, b] = hp > 1 ? trapPlan(t, hp - 1) : kids(0); out = [c + 1, b]; }
  if (full) planCache.set(t, out);
  return out;
}
console.assert(trapPlan('red').join() === '1,0' && trapPlan('pink').join() === '1,1' && trapPlan('black').join() === '2,1', 'trapPlan');

// Bulles près de la sortie : on empile juste devant la première les pièges qu'il faut pour détruire la plus coriace.
// Revu à chaque image : ce qui survit à une pile en reçoit une autre plus loin.
function emergency(S: Game) {
  if (myTraps.length) { const live = new Set(S.traps); myTraps = myTraps.filter(o => o.tr.left > 0 && live.has(o.tr)); }
  S.m.P.forEach((P, p) => {
    const end = MI!.end[p]; // au-delà, le chemin sort de l'écran : un piège n'y sert à rien
    let front = 0, loss = 0, c = 0, b = 0;
    for (const e of S.enemies) {
      if (!e.alive || e.p !== p || BT[e.t].blimp || e.d < end * .82) continue;
      const pl = trapPlan(e.t, Math.ceil(e.hp));
      front = Math.max(front, e.d); loss += BT[e.t].rbe; c = Math.max(c, pl[0]); b = Math.max(b, pl[1]);
    }
    // Avec beaucoup de vies, une petite fuite coûte moins cher que les pièges : on garde l'argent pour la défense.
    if (!front || (S.lives > 20 && loss < S.lives * .1)) return;
    const d = Math.min(end, front + 40), at = posAt(P, d, { x: 0, y: 0, a: 0 });
    if (d <= front) return;
    for (const o of myTraps) if (o.p === p && o.d > front) { if (o.tr.k === 'clous') c--; else b--; }
    for (const [k, n] of [['clous', c], ['bombe', b]] as const) for (let i = 0; i < n; i++)
      if (placeTrap(k, at.x, at.y)) { myTraps.push({ p, d, tr: S.traps[S.traps.length - 1] }); trapSpent += priceOf(TRAPS[k].cost); }
  });
}
// Argent gardé de côté pour ces pièges quand chaque vie compte.
const reserve = (S: Game) => (S.lives <= 20 ? TUNE.traps * priceOf(TRAPS.bombe.cost) : 0);

// Bonus de vague : dégâts anti-boss et argent d'abord ; les vies seulement quand il en reste peu.
const PERK_ORDER = ['magot', 'prime', 'butin', 'blimp', 'cadence', 'perfo', 'soldes', 'portee', 'vies'];
export function botPerk(S: Game) {
  const o = S.lives < S.D.lives * .4 ? ['vies', ...PERK_ORDER] : PERK_ORDER;
  return S.pick!.map((k, i) => [o.indexOf(k), i]).sort((x, y) => x[0] - y[0])[0][1];
}

function abilities(S: Game) {
  const alive = S.enemies.filter(e => e.alive), blimp = alive.some(e => BT[e.t].blimp);
  // Une vague bien remplie suffit : une compétence qui attend trop longtemps est perdue.
  const busy = blimp || alive.length >= 12 || alive.some(e => e.d > S.m.P[e.p].len * .45);
  for (const g of abilityGroups()) {
    if (!g.ready) continue;
    if (g.k === 'marche') { if (g.towers.some(t => (t.bank ?? 0) > t.cap * .4)) useAbilityGroup(g.k); continue; }
    if (g.k === 'orbitale' || g.k === 'remorquage') { if (blimp) useAbilityGroup(g.k); continue; } // n'agissent que sur les dirigeables
    if (g.k === 'bourse' || g.k === 'ravitaillement' || busy) useAbilityGroup(g.k);
  }
  for (const t of S.towers) if (t.mode === 'bank' && (t.bank ?? 0) >= t.cap * .95) withdraw(t);
}

// Diagnostic pour le banc d'essai : besoins et capacités par catégorie (chemins additionnés).
export const diag = { raw: [] as Vec[], need: [] as number[], soon: [] as number[], have: [] as number[], top: [] as string[] };
const fold = (v: Vec) => Array.from({ length: NC }, (_, i) => v.reduce((a, x, j) => a + (j % NC === i ? x : 0), 0));

interface Action { cost: number; score: number; run: () => unknown; name: string; t?: Tower }

// Achète la meilleure action ; renvoie true si un achat a eu lieu.
function spend(S: Game): boolean {
  const cash = S.money - reserve(S);
  // Besoin urgent : la vague en cours (un boss met plusieurs minutes à traverser) et les 3 prochaines.
  // Besoin à venir : jusqu'à 10 vagues (boss), préparé en épargnant.
  const need = zero(), soon = zero(), have = zero(), from = S.running ? S.wave : S.wave + 1;
  for (let n = from; n <= S.wave + 10; n++) {
    const w = waveNeed(S, n);
    for (let i = 0; i < w.length; i++) { if (n <= S.wave + 3) need[i] = Math.max(need[i], w[i] * K); soon[i] = Math.max(soon[i], w[i] * K); }
  }
  const covs = new Map<Tower, number[]>(), now = new Map<Tower, Vec>(); // now : contribution actuelle de chaque tour
  for (const t of S.towers) {
    const c = covT(t, reach(t, t.bf)), v = contrib(t, t.bf, c); covs.set(t, c); now.set(t, v);
    for (let i = 0; i < v.length; i++) have[i] += v[i];
  }
  diag.need = fold(need); diag.soon = fold(soon); diag.have = fold(have); diag.raw = [need, have];
  const deficit = need.map((n, i) => Math.max(0, n * TUNE.safe - have[i]));
  const later = soon.map((n, i) => Math.max(0, n * TUNE.safe - have[i] - deficit[i]));
  // Marge plafonnée à 3x le besoin à venir : au-delà, on garde l'argent au lieu de remplir la carte.
  // Le plafond monte avec la fortune : un trésor qui dort ne sauve aucune vie.
  const margin = soon.map((n, i) => Math.max(0, n * TUNE.margin * (1 + Math.max(0, cash) / 3000) - have[i] - deficit[i] - later[i]));
  if (leaking) for (let q = 0; q < NP; q++) deficit[q * NC] = Math.max(deficit[q * NC], need[q * NC] * .5 + 5);
  // Urgence = la vague en cours et la prochaine seulement : un manque 2 ou 3 vagues plus loin (un boss) se prépare
  // en épargnant pour la meilleure action, au lieu de disperser l'argent dans tout ce qui est abordable.
  const short = leaking || [from, S.wave + 1].some(n => waveNeed(S, n).some((x, i) => x * K * TUNE.safe - have[i] > x * K * .05 + .5));
  // Prochaine vague bien au-delà de l'armée actuelle (un boss) : l'économie doit avoir rapporté avant.
  let threat = S.wave + 11;
  for (let n = from; n <= S.wave + 10 && threat > S.wave + 10; n++) {
    if (waveNeed(S, n).some((x, i) => x * K > have[i] * 2 + 2)) threat = n;
  }
  const rem = (MODES[S.mode].k === 'apoc' ? 100 : S.D.waves) - S.wave;
  const Hz = Math.min(rem - 1, 15, threat - S.wave - 1);
  // Boss trop fort pour l'armée actuelle, ou dernière vague : coffres et mines ne rapporteront plus à temps,
  // on les revend pour la défense. Ils seront rachetés après si ça vaut encore le coup.
  if (S.running && !S.MD.noSell && (rem <= 0 || (isBossWave(S.wave) && short))) {
    const e = S.towers.find(isEco);
    if (e) { if (e.mode === 'bank') withdraw(e); sell(e); freeN = -1; spotCache.clear(); return true; }
  }
  // Les coffres servent d'épargne : on les vide dès qu'il manque de la défense ou qu'une menace arrive.
  if (short || threat - S.wave <= 2) for (const t of S.towers) if (t.mode === 'bank' && (t.bank ?? 0) > 50) withdraw(t);
  // Valeur d'un gain, en fraction du besoin de chaque case (unités différentes : couches/s, dégâts x px) :
  // manques urgents d'abord, puis ceux à venir ; le surplus de dégâts compte un peu, comme marge.
  const value = (g: Vec) => g.reduce((a, x, i) => {
    const y = Math.max(0, x), u = Math.min(y, deficit[i]), l = Math.min(y - u, later[i]);
    const m = Math.min(y - u - l, margin[i]);
    // Les dégâts anti-dirigeable coûtent bien plus cher par fraction de besoin : sans poids en plus, ils passent
    // toujours après les couches et le boss arrive sans défense (TUNE.blimp).
    const w = i % NC === 2 ? TUNE.blimp : 1;
    return a + (u ? u / need[i] * TUNE.urgent * w : 0) + (l ? l / soon[i] * TUNE.later * w : 0) + (i % NC === 0 && m > 0 ? m / Math.max(need[i], 10) * TUNE.extra : 0);
  }, 0);

  const acts: Action[] = [], eco: (Action & { roi: number })[] = [];
  // Améliorations : chaque achat est noté sur la meilleure suite d'améliorations qu'il commence
  // (un harpon seul est faible, avec ses harpons multiples il devient le meilleur anti-boss).
  for (const t of S.towers) for (const p of [0, 1]) {
    if (upState(t, p)) continue;
    const u = TOWERS[t.type].paths[p][t.up[p]], cost = priceOf(u[1]), name = t.type + ' ' + p + '>' + (t.up[p] + 1);
    if (isEco(t)) {
      const c2 = { ...t, up: [...t.up] as [number, number] }; u[3](c2); c2.up[p]++;
      eco.push({ cost, score: 0, roi: ecoRoi(c2, t, cost, Hz), run: () => buyUpgrade(t, p), name }); continue;
    }
    let best = 0;
    for (const [c2, total] of chains(S, t, p)) {
      let g: Vec;
      if (t.mode === 'support') g = radarGain(S, t, c2, covs);
      else {
        const a = now.get(t)!, b = contrib(c2, t.bf, covT(t, reach(c2, t.bf)));
        g = b.map((x, i) => x - a[i]);
      }
      best = Math.max(best, value(g) / total);
    }
    acts.push({ cost, score: best, run: () => buyUpgrade(t, p), name, t });
  }
  // Nouvelles tours : on essaie les meilleurs emplacements, la tour notée sur sa meilleure suite d'améliorations.
  for (const k of TOWER_KEYS) {
    if (!towerOk(k)) continue;
    const cost = priceOf(TOWERS[k].cost), gt = ghosts[k] ??= ghostTower(k, 0, 0);
    if (isEco(gt)) {
      // 8 bâtiments d'économie au plus, et seulement hors de portée du chemin : la place sert à la défense.
      const sp = S.towers.filter(isEco).length < 8 ? farSpot(S, true, k) : null;
      if (sp) eco.push({ cost, score: 0, roi: ecoRoi(gt, null, cost, Hz), run: () => placeTower(k, sp.x, sp.y), name: '+' + k });
      continue;
    }
    // Un emplacement coûte aussi de la place : plus on est riche, plus on préfère améliorer que poser.
    const spotCost = cost + cash * TUNE.spot;
    let best = 0, at: Spot | null = null;
    for (const s of candidates(S, k, gt)) {
      const t0 = { ...gt, x: s.x, y: s.y };
      let sc: number;
      if (gt.mode === 'support') sc = value(radarGain(S, null, t0, covs)) / spotCost;
      else {
        const bf = buffsAt(S.towers, s.x, s.y);
        sc = value(contrib(t0, bf, covAt(s, reach(t0, bf)))) / spotCost;
        for (const [c2, total] of chains(S, t0, -1)) sc = Math.max(sc, value(contrib(c2, bf, covAt(s, reach(c2, bf)))) / (total + spotCost));
      }
      if (sc > best) { best = sc; at = s; }
    }
    if (at) { const s = at; acts.push({ cost, score: best, run: () => placeTower(k, s.x, s.y), name: '+' + k }); }
  }
  // Défense assurée pour les 3 prochaines vagues : on investit si ça rapporte avant la prochaine menace.
  eco.sort((a, b) => b.roi - a.roi);
  if (!short && eco[0]?.roi >= TUNE.roi) {
    diag.top = eco.slice(0, 4).map(a => `${a.name} ${a.cost}$ roi ${a.roi.toFixed(2)}`);
    if (eco[0].cost > cash) return false; // on épargne pour elle
    eco[0].run();
    return true;
  }
  acts.sort((a, b) => b.score - a.score);
  diag.top = acts.slice(0, 8).map(a => `${a.name} ${a.cost}$ ${(a.score * 1000).toFixed(1)}`);
  const top = acts[0];
  if (!top || top.score <= 0) return false;
  // On épargne pour l'action la plus rentable, sauf si une autre presque aussi bonne est déjà abordable. Quand la
  // défense manque, on est moins difficile (TUNE.rush), sans tout dépenser en petites améliorations : c'est le triple
  // rayon à 2 600 $ qui bat le boss, pas vingt mitrailleuses. Fuite en cours : tout ce qui est abordable.
  // Dirigeable ou boss déjà loin sur le chemin : plus le temps d'épargner non plus.
  const panic = leaking || S.enemies.some(e => e.alive && BT[e.t].blimp && e.d > MI!.len[e.p] * .6);
  // Épargner pendant que la défense manque coûte des vies : plus il en reste peu, moins on attend (TUNE.low, TUNE.high).
  const health = Math.min(1, Math.max(0, (S.lives / S.D.lives - TUNE.low) / Math.max(.01, TUNE.high - TUNE.low)));
  const min = panic ? 0 : short ? TUNE.rush * health : TUNE.save;
  const pick = acts.find(a => a.cost <= cash && a.score >= top.score * min);
  if (!pick) return sellForTop(S, top, need, have, covs);
  pick.run();
  return true;
}

// Changement de stratégie : si la meilleure action n'est pas abordable, on revend une tour qui ne comble
// plus aucun manque quand ça finance cette action.
// Une revente par vague au plus, pour ne pas osciller.
function sellForTop(S: Game, top: Action, need: Vec, have: Vec, covs: Map<Tower, number[]>): boolean {
  if (soldWave === S.wave || S.MD.noSell) return false;
  const gap = top.cost - S.money + reserve(S), def = (h: number, i: number) => Math.max(0, need[i] * TUNE.safe - h);
  let worst: Tower | null = null, wl = Infinity;
  for (const t of S.towers) {
    const v = sellValue(t);
    if (t === top.t || t.mode === 'support' || isEco(t) || v < gap || v <= 0) continue;
    const loss = contrib(t, t.bf, covs.get(t)!).reduce((a, x, i) => a + (def(have[i] - x, i) - def(have[i], i)) / (need[i] || 1) * 4, 0) / v;
    if (loss < wl) { wl = loss; worst = t; }
  }
  if (!worst || wl > 0) return false; // revendre une tour utile coûte 25 % et creuse un trou dans la défense
  sell(worst);
  soldWave = S.wave; freeN = -1; spotCache.clear(); // même nombre de tours après le rachat : caches périmés
  return true;
}

const ghosts: Record<string, Tower> = {}; // modèle de chaque type, en lecture seule

// Suites d'améliorations possibles d'une tour : [tour améliorée, coût total].
// p = 0 ou 1 : celles qui commencent par la voie p ; p = -1 : toutes (tour neuve).
// Mis en cache : le résultat ne dépend que du type, du niveau et des plafonds (et de la position pour un radar).
const chainCache = new Map<string, [Tower, number][]>();
function chains(S: Game, t: Tower, p: number): [Tower, number][] {
  // 5e niveau (super évolution) : une seule tour de chaque type par voie
  const max = (q: number) => S.MD.maxTier ?? (S.towers.some(o => o !== t && o.type === t.type && o.up[q] === 5) ? 4 : TOWERS[t.type].paths[q].length);
  const m0 = max(0), m1 = max(1), key = t.type + '|' + t.up + '|' + m0 + '|' + m1 + (t.mode === 'support' ? '|' + t.x + '|' + t.y : '');
  let all = chainCache.get(key);
  if (!all) {
    all = chainList(t, m0, m1);
    if (chainCache.size > 5000) chainCache.clear();
    chainCache.set(key, all);
  }
  return p < 0 ? all : all.filter(([c]) => c.up[p] !== t.up[p]);
}
function chainList(t: Tower, m0: number, m1: number): [Tower, number][] {
  const out: [Tower, number][] = [];
  for (let a = t.up[0]; a <= m0; a++) for (let b = t.up[1]; b <= m1; b++) {
    if ((a > 2 && b > 2) || (a === t.up[0] && b === t.up[1])) continue;
    const c = { ...t, up: [...t.up] as [number, number] };
    let cost = 0;
    for (const [q, n] of [[0, a], [1, b]] as const) for (let i = c.up[q]; i < n; i++) { const u = TOWERS[t.type].paths[q][i]; u[3](c); cost += priceOf(u[1]); }
    c.up = [a, b];
    out.push([c, cost]);
  }
  return out;
}

// Rentabilité d'un achat d'économie : (argent rapporté dans H vagues - coût) / coût.
function ecoRoi(after: Tower, before: Tower | null, cost: number, Hz: number) {
  if (Hz < 1) return -1;
  const ret = (t: Tower | null) => {
    if (!t) return 0;
    if (t.mode !== 'bank') return (t.income + (t.ab === 'bourse' ? 1000 : 0)) * Hz;
    let b = 0; // le coffre capitalise : on simule ses H vagues (plafond compris)
    for (let i = 0; i < Hz; i++) b = Math.min(t.cap, (b + t.income) * (1 + t.interest));
    return b;
  };
  return (ret(after) - ret(before) - cost) / cost;
}

// Gain d'une amélioration (ou création) de radar : buffs donnés aux tours à sa portée.
function radarGain(S: Game, before: Tower | null, after: Tower, covs: Map<Tower, number[]>): Vec {
  const g = zero(), others = S.towers.filter(r => r !== before);
  for (const t of S.towers) {
    if (t === before || t.mode === 'support' || isEco(t) || Math.hypot(t.x - after.x, t.y - after.y) > after.range) continue;
    const bfA = buffsAt(others, t.x, t.y), bfB = buffsAt([...others, after], t.x, t.y);
    const a = contrib(t, bfA, covs.get(t)!), b = contrib(t, bfB, covT(t, reach(t, bfB)));
    b.forEach((x, i) => { g[i] += x - a[i]; });
  }
  return g;
}

// Emplacements libres (les tours posées en occupent), recalculés quand le nombre de tours change.
let freeN = -1, free: Spot[] = [];
function freeSpots(S: Game) {
  if (freeN !== S.towers.length) { freeN = S.towers.length; free = MI!.spots.filter(s => S.towers.every(t => (t.x - s.x) ** 2 + (t.y - s.y) ** 2 > 35 * 35)); }
  return free;
}

// Emplacements candidats pour une nouvelle tour : les meilleurs pour chaque chemin et au total.
// Mis en cache tant qu'aucune tour n'est posée (et qu'aucun radar ne change).
const spotCache = new Map<string, Spot[]>();
function candidates(S: Game, k: string, gt: Tower): Spot[] {
  const key = k + '|' + S.towers.length + '|' + S.towers.filter(t => t.mode === 'support').map(t => t.up.join('')).join();
  const hit = spotCache.get(key);
  if (hit) return hit;
  let list = freeSpots(S).filter(s => terrainOk(S.m, s.x, s.y, k)), out: Spot[];
  if (gt.mode === 'support') {
    // radar : les emplacements qui couvrent le plus de tours de défense
    const def = S.towers.filter(t => t.mode !== 'support' && !isEco(t));
    out = list.map(s => ({ s, n: def.filter(t => (t.x - s.x) ** 2 + (t.y - s.y) ** 2 < gt.range ** 2).length }))
      .filter(o => o.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8).map(o => o.s);
  } else if (gt.range >= 2000) {
    // portée infinie : un emplacement loin du chemin, pour laisser les bons aux autres
    const f = farSpot(S, false, k);
    out = f ? [f] : [];
  } else {
    const scored = list.map(s => {
      const bf = buffsAt(S.towers, s.x, s.y), c = covAt(s, reach(gt, bf));
      return { s, c, tot: c.reduce((a, x) => a + x, 0) + (bf.camo ? 100 : 0) + (bf.armor ? 100 : 0) };
    });
    const pick = new Set<Spot>();
    const top = (f: (o: typeof scored[0]) => number, n: number) => scored.slice().sort((a, b) => f(b) - f(a)).slice(0, n).forEach(o => pick.add(o.s));
    top(o => o.tot, 4);
    for (let q = 0; q < NP && NP > 1; q++) top(o => o.c[q] * 2 - o.tot * .5, 3);
    out = [...pick].filter(s => covAt(s, reach(gt, NOBUF)).some(x => x > 0));
  }
  out = out.filter(s => canPlace(s.x, s.y, k));
  if (spotCache.size > 3000) spotCache.clear();
  spotCache.set(key, out);
  return out;
}

// Emplacement loin du chemin (mines, coffres, tireurs) pour laisser les bons à la défense.
function farSpot(S: Game, offPath = false, k?: string) {
  let best: Spot | null = null, bc = Infinity;
  for (const s of freeSpots(S)) {
    if (!terrainOk(S.m, s.x, s.y, k)) continue;
    const c = covAt(s, 160).reduce((a, x) => a + x, 0); if (c < bc) { bc = c; best = s; }
  }
  return best && (!offPath || bc === 0) && canPlace(best.x, best.y, k) ? best : null;
}

// IA qui joue à la place du joueur (débloquée par le code Konami).
// Principe : on lit la composition des 3 prochaines vagues (couches, camouflage, immunités, dirigeables),
// on estime ce que chaque tour inflige réellement selon sa mécanique, puis on achète l'action
// (nouvelle tour ou amélioration) qui comble le plus gros manque par dollar. Sans manque : économie.
import { BT, H, MODES, TOWERS, TOWER_KEYS, W, buildQueue, pathDist, posAt, waveGroups } from './data';
import {
  abilityGroups, buyUpgrade, canPlace, placeTower, placeTrap, priceOf, startWave, towerOk, upState, useAbilityGroup, withdraw,
} from './engine';
import { ghostTower } from './render';
import type { Buffs, Game, Kind, MapDef, Tower } from './types';

const KINDS: Kind[] = ['sharp', 'explo', 'cold', 'magic', 'fire'];
// Catégories de besoin : 0 total, 1 camouflage, 2 dirigeables/boss, 3..7 dégâts non bloqués par chaque immunité.
const NC = 3 + KINDS.length;
type Vec = number[];
const zero = (): Vec => new Array(NC).fill(0);

// ---------- Carte : échantillons du chemin et emplacements possibles ----------
interface Spot { x: number; y: number; d: Float32Array } // d : distances triées aux échantillons du chemin
interface MapInfo { m: MapDef; pts: { x: number; y: number }[]; spots: Spot[]; len: number }
let MI: MapInfo | null = null;
const STEP = 10;
function mapInfo(m: MapDef): MapInfo {
  if (MI?.m === m) return MI;
  const pts: { x: number; y: number }[] = [];
  for (const P of m.P) for (let d = 0; d < P.len; d += STEP) {
    const o = posAt(P, d, { x: 0, y: 0, a: 0 });
    if (o.x > 0 && o.y > 0 && o.x < W && o.y < H) pts.push({ x: o.x, y: o.y });
  }
  const spots: Spot[] = [];
  for (let y = 24; y <= H - 24; y += 20) for (let x = 24; x <= W - 24; x += 20) {
    if (pathDist(m, x, y) < 40 || m.decorObjs!.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 14)) continue;
    spots.push({ x, y, d: Float32Array.from(pts.map(p => Math.hypot(p.x - x, p.y - y))).sort() });
  }
  return MI = { m, pts, spots, len: Math.max(...m.P.map(P => P.len)) };
}
// Longueur de chemin (px) à portée R d'un emplacement
function covAt(s: Spot, R: number) {
  let lo = 0, hi = s.d.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s.d[mid] < R) lo = mid + 1; else hi = mid; }
  return lo * STEP;
}
const covXY = (x: number, y: number, R: number) => MI!.pts.reduce((n, p) => n + ((p.x - x) ** 2 + (p.y - y) ** 2 < R * R ? STEP : 0), 0);

// ---------- Modèle des tours : dégâts/s effectifs selon la mécanique ----------
const NOBUF: Buffs = { range: 1, rate: 1, camo: false, pierce: 0, dmg: 0, armor: false };
const isEco = (t: Tower) => t.mode === 'income' || t.mode === 'bank';
// Contribution d'une tour à chaque catégorie de besoin (couches/s), couverture du chemin comprise.
function contrib(t: Tower, bf: Buffs, cov: number): Vec {
  const v = zero();
  if (t.mode === 'support' || isEco(t)) return v;
  const R = t.range * bf.range, r = t.rate * bf.rate, d = t.dmg + (t.dmg > 0 ? bf.dmg : 0), p = t.pierce + bf.pierce, m = t.multi || 1;
  let kind = t.kind === 'sharp' && bf.armor ? 'normal' : t.kind;
  const crit = 1 + 4 * (t.critChance || 0), bm = t.blimpMul || 1;
  let dps = 0, bdps = 0, camo = t.camo || bf.camo;
  switch (t.mode) {
    case 'proj':
      if (t.kind === 'glue') { // ralentit (vaut un peu de dégâts) et ronge avec l'acide
        const glued = Math.min(p, 3) * t.glueT / r;
        dps = (t.acid ? glued / t.acid : 0) + (1 - t.glueF) * Math.min(p, 3) / r * 3;
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
    case 'pulse':
      dps = d * Math.min(p, 8) / r + t.freeze * Math.min(p, 8) / r * (t.chill ? 1.5 : 1); bdps = t.deep ? d / r : 0;
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
    case 'push': dps = (t.dmg ? d * Math.min(p, 10) / r : 0) + t.push * Math.min(p, 10) / r / 15; bdps = 0; kind = 'normal'; camo = true; break;
  }
  if (t.ab) { dps *= 1.2; bdps *= 1.2; }
  const f = R >= 2000 || t.mode === 'plane' ? 1 : Math.min(1, cov / 300);
  dps *= f; bdps *= f;
  v[0] = dps; v[1] = camo ? dps : 0; v[2] = bdps;
  KINDS.forEach((k, i) => { v[3 + i] = kind && kind !== k ? dps : 0; });
  return v;
}
// Buffs qu'une station radar donnerait à une tour placée en (x, y)
function buffsAt(S: Game, x: number, y: number, extra?: Tower): Buffs {
  const bf = { ...NOBUF };
  for (const r of extra ? [...S.towers, extra] : S.towers) {
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

// ---------- Ce que demandent les prochaines vagues (couches/s) ----------
const immTree = (t: string, k: Kind): number => (BT[t].immune.includes(k) ? BT[t].hp : 0) + BT[t].kids.reduce((a, c) => a + immTree(c, k), 0);
const blimpPart = (t: string): number => (BT[t].blimp ? BT[t].hp : 0) + BT[t].kids.reduce((a, c) => a + blimpPart(c), 0);
const needCache = new Map<string, Vec>();
function waveNeed(S: Game, n: number): Vec {
  const key = S.mi + ':' + S.mode + ':' + n;
  const hit = needCache.get(key);
  if (hit) return hit;
  const v = zero(), q = buildQueue(n, S.m.P.length), fast = S.MD.fastBubbles ? 1.4 : 1;
  const T = (q.length ? q[q.length - 1].time : 0) + 8;
  for (const g of waveGroups(n)) {
    const B = BT[g.t], f = g.fort ? 2 : 1;
    if (B.blimp) {
      // un dirigeable doit être détruit pendant sa traversée
      const cross = MI!.len / (50 * B.s * fast);
      v[2] += g.c * blimpPart(g.t) * f / Math.min(cross, T + cross * .5) * 1.5;
    }
    const layers = g.c * (B.rbe - blimpPart(g.t)) / T * (g.rg ? 1.3 : 1);
    v[0] += layers; if (g.camo) v[1] += layers;
    KINDS.forEach((k, i) => { v[3 + i] += g.c * immTree(g.t, k) / T; });
  }
  v[0] *= fast; v[1] *= fast;
  needCache.set(key, v);
  return v;
}

// ---------- État de l'IA pour la partie en cours ----------
let cur: Game | null = null, tick = 0, K = 1, lastLives = 0, lastWave = 0;
const trapped = new Set<number>();

function reset(S: Game) {
  cur = S; tick = 0; trapped.clear(); spotCache.clear(); freeN = -1; lastLives = S.lives; lastWave = S.wave;
  K = S.lives <= 1 ? 1.6 : S.lives < 120 ? 1.25 : 1.1; // une seule vie : marge de sécurité plus grande
  mapInfo(S.m);
}

export function botAct(S: Game, dt: number) {
  if (cur !== S) reset(S);
  if (!S.running && S.autoT <= 0 && !S.over) startWave();
  emergency(S);
  if ((tick -= dt) > 0) return;
  tick = .5;
  // Chaque vague qui coûte des vies rend l'IA plus prudente pour le reste de la partie.
  if (S.wave !== lastWave) { if (S.lives < lastLives) K *= 1.3; lastLives = S.lives; lastWave = S.wave; }
  abilities(S);
  for (let i = 0; i < 3 && spend(S); i++) { /* plusieurs achats possibles par tick */ }
}

// Bulle près de la sortie : piège juste devant elle (mine, ou clous si elle résiste aux explosions).
function emergency(S: Game) {
  for (const e of S.enemies) {
    if (!e.alive || trapped.has(e.id) || BT[e.t].blimp) continue;
    const P = S.m.P[e.p];
    if (e.d < P.len * .82) continue;
    const ahead = posAt(P, Math.min(P.len - 12, e.d + 40), { x: 0, y: 0, a: 0 });
    const k = BT[e.t].immune.includes('explo') ? 'clous' : 'bombe';
    if (placeTrap(k, ahead.x, ahead.y)) trapped.add(e.id);
  }
  if (trapped.size > 500) trapped.clear();
}

function abilities(S: Game) {
  const threat = S.enemies.some(e => e.alive && (BT[e.t].blimp || e.d > S.m.P[e.p].len * .45));
  for (const g of abilityGroups()) {
    if (!g.ready) continue;
    if (g.k === 'marche') { if (g.towers.some(t => (t.bank ?? 0) > t.cap * .4)) useAbilityGroup(g.k); continue; }
    if (g.k === 'bourse' || g.k === 'ravitaillement' || threat) useAbilityGroup(g.k);
  }
  for (const t of S.towers) if (t.mode === 'bank' && (t.bank ?? 0) >= t.cap * .95) withdraw(t);
}

// Diagnostic pour le banc d'essai (scripts/bot-bench.mjs)
export const diag = { need: zero(), have: zero() };

interface Action { cost: number; score: number; run: () => unknown }

// Achète la meilleure action abordable ; renvoie true si un achat a eu lieu.
function spend(S: Game): boolean {
  const need = zero(), have = zero();
  // 3 prochaines vagues en plein, les 7 suivantes à 70 % : on prépare les boss à l'avance.
  for (let n = S.wave + 1; n <= S.wave + 10; n++) {
    const w = waveNeed(S, n), f = n <= S.wave + 3 ? K : K * .7;
    for (let i = 0; i < NC; i++) need[i] = Math.max(need[i], w[i] * f);
  }
  const covs = new Map<Tower, number>();
  for (const t of S.towers) {
    const c = covXY(t.x, t.y, t.range * t.bf.range); covs.set(t, c);
    const v = contrib(t, t.bf, c);
    for (let i = 0; i < NC; i++) have[i] += v[i];
  }
  diag.need = need; diag.have = have;
  const deficit = need.map((n, i) => Math.max(0, n * 1.25 - have[i]));
  const short = deficit.some((d, i) => d > need[i] * .05 + .5);
  // Valeur d'un gain : comble d'abord les manques ; le surplus compte un peu (marge pour la suite).
  const value = (g: Vec) => g.reduce((a, x, i) => a + Math.min(Math.max(0, x), deficit[i]) * 4 + Math.max(0, x) * (i === 0 ? .25 : .05), 0);

  const acts: Action[] = [];
  const rem = (MODES[S.mode].k === 'apoc' ? 100 : S.D.waves) - S.wave;
  // Améliorations
  for (const t of S.towers) for (const p of [0, 1]) {
    if (upState(t, p)) continue;
    const u = TOWERS[t.type].paths[p][t.up[p]], cost = priceOf(u[1]);
    const c2 = { ...t, up: [...t.up] as [number, number] }; u[3](c2); c2.up[p]++;
    if (isEco(t)) { acts.push({ cost, score: ecoScore(c2, t, cost, rem, short), run: () => buyUpgrade(t, p) }); continue; }
    let g: Vec;
    if (t.mode === 'support') g = radarGain(S, t, c2, covs);
    else {
      const a = contrib(t, t.bf, covs.get(t)!), b = contrib(c2, t.bf, covXY(t.x, t.y, c2.range * t.bf.range));
      g = b.map((x, i) => x - a[i]);
    }
    acts.push({ cost, score: value(g) / cost, run: () => buyUpgrade(t, p) });
  }
  // Nouvelles tours
  for (const k of TOWER_KEYS) {
    if (!towerOk(k)) continue;
    const cost = priceOf(TOWERS[k].cost), gt = ghostTower(k, 0, 0);
    if (isEco(gt)) {
      const sp = farSpot(S);
      if (sp) acts.push({ cost, score: ecoScore(gt, null, cost, rem, short), run: () => placeTower(k, sp.x, sp.y) });
      continue;
    }
    const best = bestSpot(S, k, gt, covs);
    if (best) acts.push({ cost, score: value(best.g) / cost, run: () => placeTower(k, best.x, best.y) });
  }
  acts.sort((a, b) => b.score - a.score);
  const top = acts[0];
  if (!top || top.score <= 0) return false;
  // On attend l'action la plus rentable, sauf si une autre presque aussi bonne est déjà abordable.
  const pick = acts.find(a => a.cost <= S.money && a.score >= top.score * (short ? .55 : .8));
  if (!pick) {
    // Manque urgent sans argent : on vide les coffres.
    if (short) for (const t of S.towers) if (t.mode === 'bank' && (t.bank ?? 0) > 50) withdraw(t);
    return false;
  }
  pick.run();
  return true;
}

// Rentabilité d'une tour d'économie : argent rapporté avant la fin de la partie, par dollar investi.
function ecoScore(after: Tower, before: Tower | null, cost: number, rem: number, short: boolean) {
  if (short || rem < 6) return 0;
  const inc = (t: Tower | null) => !t ? 0 : t.mode === 'bank' ? t.income * (1 + t.interest * 4) + (t.ab === 'marche' ? 400 : 0)
    : t.income + (t.ab === 'bourse' ? 600 : 0);
  const gain = (inc(after) - inc(before)) * (rem - 2) - cost;
  return gain > 0 ? gain / cost * .03 : 0;
}

// Gain d'une amélioration (ou création) de radar : buffs donnés aux tours à sa portée.
function radarGain(S: Game, before: Tower | null, after: Tower, covs: Map<Tower, number>): Vec {
  const g = zero();
  for (const t of S.towers) {
    if (t === before || t.mode === 'support' || isEco(t)) continue;
    if (Math.hypot(t.x - after.x, t.y - after.y) > after.range) continue;
    const others = S.towers.filter(r => r !== before);
    const bfA = buffsAt({ ...S, towers: others } as Game, t.x, t.y), bfB = buffsAt({ ...S, towers: others } as Game, t.x, t.y, after);
    const a = contrib(t, bfA, covs.get(t)!), b = contrib(t, bfB, covXY(t.x, t.y, t.range * bfB.range));
    for (let i = 0; i < NC; i++) g[i] += b[i] - a[i];
  }
  return g;
}

// Emplacements libres (les tours posées en occupent), recalculés quand le nombre de tours change.
let freeN = -1, free: Spot[] = [];
function freeSpots(S: Game) {
  if (freeN !== S.towers.length) { freeN = S.towers.length; free = MI!.spots.filter(s => S.towers.every(t => (t.x - s.x) ** 2 + (t.y - s.y) ** 2 > 35 * 35)); }
  return free;
}

const spotCache = new Map<string, { x: number; y: number; g: Vec } | null>();
function bestSpot(S: Game, k: string, gt: Tower, covs: Map<Tower, number>) {
  // le meilleur emplacement ne change que si une tour est posée ou un radar amélioré
  const key = k + '|' + S.towers.length + '|' + S.towers.filter(t => t.mode === 'support').map(t => t.up.join('')).join();
  if (gt.mode !== 'support' && spotCache.has(key)) return spotCache.get(key)!;
  const r = bestSpotRaw(S, gt, covs);
  if (spotCache.size > 2000) spotCache.clear();
  spotCache.set(key, r);
  return r;
}
function bestSpotRaw(S: Game, gt: Tower, covs: Map<Tower, number>) {
  let best: { x: number; y: number; g: Vec } | null = null, bs = -1;
  const infinite = gt.range >= 2000 || gt.mode === 'plane';
  let list = freeSpots(S);
  if (gt.mode === 'support') {
    // radar : seulement les 12 emplacements qui couvrent le plus de tours de défense
    const def = S.towers.filter(t => t.mode !== 'support' && !isEco(t));
    list = list.map(s => ({ s, n: def.filter(t => (t.x - s.x) ** 2 + (t.y - s.y) ** 2 < gt.range ** 2).length }))
      .filter(o => o.n >= 2).sort((a, b) => b.n - a.n).slice(0, 12).map(o => o.s);
  }
  for (const s of list) {
    let g: Vec, sc: number;
    if (gt.mode === 'support') {
      const t = { ...gt, x: s.x, y: s.y };
      g = radarGain(S, null, t, covs); sc = g.reduce((a, x) => a + Math.max(0, x), 0);
    } else if (infinite) {
      // tour à portée infinie : on garde les bons emplacements pour les autres
      g = contrib(gt, buffsAt(S, s.x, s.y), 1e4); sc = g[0] - covAt(s, 150) * .001;
    } else {
      const bf = buffsAt(S, s.x, s.y);
      g = contrib(gt, bf, covAt(s, gt.range * bf.range)); sc = g[0] + g[1] * .5 + g[2] * .5;
    }
    if (sc > bs) { bs = sc; best = { x: s.x, y: s.y, g }; }
  }
  return best && bs > 0 ? best : null;
}

// Emplacement loin du chemin (mines, coffres) pour laisser les bons à la défense.
function farSpot(S: Game) {
  let best: Spot | null = null, bc = Infinity;
  for (const s of freeSpots(S)) { const c = covAt(s, 160); if (c < bc) { bc = c; best = s; } }
  return best && canPlace(best.x, best.y) ? best : null;
}

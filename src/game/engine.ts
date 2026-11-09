// Moteur : état de partie, combat, boucle, rendu de la partie, entrées, sauvegarde, succès.
import { AUD, ctx2d, music, play, popSound, SHEET, spr } from './assets';
import {
  ABIL, ABKEYS, ACHIEVEMENTS, BT, DIFFS, H, HOTKEYS, MAPS, MODES, TAU, TOWER_KEYS, TOWER_RANK, TOWERS, TRAPS, W,
  buildQueue, isBossWave, pathDist, posAt, pt, rankOf, regrowNext,
} from './data';
import { blimpSprite, bubbleSprite, buildBg, drawPlane, drawTower, ghostTower } from './render';
import type { Enemy, Fx, FxKind, Game, Kind, Profile, Shot, ShotOpts, Stats2, Tower, Trap } from './types';
import { toast, ui, type MenuKind } from './ui.svelte';

// ---------- Stockage ----------
export const store = {
  get<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* stockage indisponible */ } },
};
const STATS0: Stats2 = { pops: 0, blimps: 0, bosses: 0, hydra: 0, towers: 0, abilities: 0, sold: 0, golds: 0, maxMoney: 0, apocBest: 0,
  t4types: [], mapsWon: [], winModes: [], winDiffs: [], perfect: false };
export const profile: Profile = (() => {
  const p = store.get<Partial<Profile> & { pops?: number }>('bd2-profile', {});
  const stats = { ...STATS0, ...(p.stats ?? {}) };
  if (p.pops && !p.stats) stats.pops = p.pops; // profil de la version JavaScript
  return { best: {}, medals: {}, wins: 0, xp: 0, unlockAll: false, ach: {}, ...p, stats };
})();
export const saveProfile = () => store.set('bd2-profile', profile);
export function resetProfile() {
  store.del('bd2-profile'); store.del('bd2-save');
  Object.assign(profile, { best: {}, medals: {}, wins: 0, xp: 0, unlockAll: false, ach: {}, stats: { ...STATS0, t4types: [], mapsWon: [], winModes: [], winDiffs: [] } });
  ui.shop++;
}
// ---------- Export / import chiffré (AES-GCM : toute modification du fichier fait échouer le déchiffrement) ----------
// shortcut: la clé est dans le code du jeu, un tricheur motivé peut la retrouver ; pour une vraie garantie, signer côté serveur.
// Clé créée à la demande : crypto.subtle n'existe pas hors HTTPS/localhost et ne doit pas casser le chargement du jeu.
const KEY = () => crypto.subtle.importKey('raw', new TextEncoder().encode('BulleDefense-Klaynight-2026-save'.padEnd(32, '!')), 'AES-GCM', false, ['encrypt', 'decrypt']);
export async function exportProfile() {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify({ v: 1, profile, save: store.get('bd2-save', null) }));
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await KEY(), data));
  const blob = new Blob([btoa(String.fromCharCode(...iv, ...enc))], { type: 'application/octet-stream' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `bulle-defense-${new Date().toISOString().slice(0, 10)}.bulle` });
  a.click(); URL.revokeObjectURL(a.href);
}
export async function importProfile(file: File) {
  let d: { v?: number; profile?: Profile; save?: unknown };
  try {
    const raw = Uint8Array.from(atob((await file.text()).trim()), c => c.charCodeAt(0));
    d = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await KEY(), raw.slice(12))));
  } catch { d = {}; }
  if (d.v !== 1 || !d.profile?.stats) { toast('Import impossible', 'Fichier invalide ou modifié.', 'alert-triangle'); return; }
  store.set('bd2-profile', d.profile);
  if (d.save) store.set('bd2-save', d.save); else store.del('bd2-save');
  location.reload();
}

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (profile.ach[a.id] || !a.test(profile.stats, profile)) continue;
    profile.ach[a.id] = Date.now(); profile.xp += 100;
    toast('Succès : ' + a.n, a.d + ' (+100 XP)', a.icon); play('win', .7);
    saveProfile();
  }
}

// ---------- État ----------
let S!: Game;
let active = false, uid = 0, selected: Tower | null = null;
const mouse = { x: -99, y: -99, in: false };
let cv!: HTMLCanvasElement, ctx!: CanvasRenderingContext2D;
export const game = () => (active ? S : null);
export const sel = () => (active ? selected : null);
export const priceOf = (c: number) => Math.round(c * (active ? S.D.cost : DIFFS[ui.diffSel].cost) / 5) * 5;
export const towerOk = (k: string) => (profile.unlockAll || rankOf(profile.xp) >= TOWER_RANK[k]) && !(active && S.MD.ban?.includes(k));
export const towerBanned = (k: string) => active && !!S.MD.ban?.includes(k);
const recKey = () => S.mi + '-' + S.di + (S.mode ? '-' + MODES[S.mode].k : '');
const touch = () => { ui.sel++; };

function sync() {
  ui.money = S.money; ui.lives = S.lives; ui.wave = S.wave; ui.waves = S.D.waves; ui.freeplay = S.freeplay;
  ui.running = S.running; ui.speed = S.speed; ui.auto = S.auto;
}

export function newGame(mi: number, di: number, mode = 0) {
  const m = MAPS[mi], D = DIFFS[di], MD = MODES[mode];
  S = { mi, di, mode, MD, m, D, money: MD.money ?? D.money, lives: D.lives, wave: 0, enemies: [], towers: [], projs: [], fx: [], parts: [],
        floats: [], traps: [], timers: [], queue: [], wt: 0, clock: 0, running: false, speed: 1, auto: false, paused: false, over: false,
        freeplay: MD.k === 'apoc', cashF: 0, pops: 0, flash: 0, cmdT: 0, autoT: 0, banner: null, bg: buildBg(m), aim: null, leaked: 0 };
  active = true; ui.active = true; selected = null; ui.placing = null; ui.boss = null;
  music(['level1', 'level2', 'level3'][mi % 3]);
  sync(); ui.shop++; ui.waveRev++; touch(); hideMenu();
}
export function saveGame() {
  if (!active || S.over || S.MD.k === 'apoc') return;
  store.set('bd2-save', { mi: S.mi, di: S.di, mode: S.mode, money: S.money, lives: S.lives, wave: S.wave, freeplay: S.freeplay, pops: S.pops, leaked: S.leaked,
    towers: S.towers.map(t => ({ type: t.type, x: t.x, y: t.y, up: t.up, prio: t.prio, spent: t.spent, pops: t.pops, tx: t.tx, ty: t.ty, bank: t.bank })) });
}
interface SavedTower { type: string; x: number; y: number; up: [number, number]; prio: number; spent: number; pops: number; tx?: number; ty?: number; bank?: number }
interface Save { mi: number; di: number; mode?: number; money: number; lives: number; wave: number; freeplay: boolean; pops?: number; leaked?: number; towers: SavedTower[] }
export const savedGame = () => { const s = store.get<Save | null>('bd2-save', null); return s && MAPS[s.mi] && TOWERS ? s : null; };
export function loadGame() {
  const s = savedGame();
  if (!s) return false;
  newGame(s.mi, s.di, s.mode ?? 0);
  Object.assign(S, { money: s.money, lives: s.lives, wave: s.wave, freeplay: s.freeplay, pops: s.pops ?? 0, leaked: s.leaked ?? 0 });
  for (const o of s.towers) {
    if (!TOWERS[o.type]) continue;
    const t = makeTower(o.type, o.x, o.y);
    o.up.forEach((n, p) => { for (let i = 0; i < n; i++) TOWERS[o.type].paths[p][i][3](t); });
    Object.assign(t, { up: [...o.up], prio: o.prio, spent: o.spent, pops: o.pops, tx: o.tx, ty: o.ty, bank: o.bank ?? 0 });
    if (t.ab) t.abCd = ABIL[t.ab].cd * .5;
    S.towers.push(t);
  }
  sync(); ui.waveRev++;
  return true;
}

// ---------- Effets ----------
function fx(o: Partial<Fx> & { k: FxKind; t: number }) {
  S.fx.push({ x: 0, y: 0, r: 0, c: '#fff', fill: '', x2: 0, y2: 0, x0: 0, y0: 0, x1: 0, y1: 0, pts: [], T: o.t, ...o });
}
const floatTxt = (x: number, y: number, txt: string, c: string, t = 1.2, big = false) => S.floats.push({ x, y, txt, c, t, big });

// ---------- Ennemis ----------
function spawn(t: string, p: number, d: number, camo = false, rg: string | null = null, fort = false): Enemy {
  const B = BT[t];
  const hp = fort ? (B.hp > 1 ? B.hp * 2 : t === 'lead' ? 4 : 1) : B.hp;
  const e: Enemy = { id: ++uid, t, hp, maxHp: hp, p, d, camo, rg, rgT: 0, alive: true, frz: 0, hard: false, chill: false,
    slowT: 0, slowF: 1, glueT: 0, glueF: 1, acid: 0, acidT: 0, glueSrc: null, burnT: 0, burnC: 0, burnSrc: null, stunT: 0, pushed: 0,
    fort, bossT: 0, shield: 0, phase: 0, x: 0, y: 0, a: 0 };
  posAt(S.m.P[p], d, e);
  S.enemies.push(e);
  return e;
}
function gainCash(v: number) {
  if (S.MD.noCash) return;
  S.cashF += v * (S.MD.cashMul ?? 1) * (S.wave > 100 ? .2 : S.wave > 50 ? .5 : 1);
  const w = Math.floor(S.cashF); S.money += w; S.cashF -= w;
}
// Une bulle est « intouchable » quand elle est en phase fantôme ou sous bouclier de boss.
const untouchable = (e: Enemy) => e.phase > 0 || e.shield > 0;
function hit(e: Enemy, dmg: number, kind: Kind | undefined, src: Tower | null, bm = 1): boolean {
  if (!e.alive || dmg <= 0 || !kind) return false;
  if (untouchable(e)) { if (e.shield > 0) blocked(e); return false; }
  if (BT[e.t].immune.includes(kind)) { blocked(e); return false; }
  if (BT[e.t].blimp) dmg *= bm;
  e.rgT = 0;
  while (dmg > 0 && e.alive) {
    if (BT[e.t].immune.includes(kind)) break;
    const d = Math.min(dmg, e.hp); e.hp -= d; dmg -= d;
    if (e.hp > 0) break;
    popEnemy(e, src);
  }
  return true;
}
function popEnemy(e: Enemy, src: Tower | null) {
  const B = BT[e.t];
  gainCash(1); S.pops++; profile.stats.pops++; if (src) src.pops++;
  const n = B.blimp ? 30 : 5;
  for (let i = 0; i < n && S.parts.length < 350; i++) {
    const a = Math.random() * TAU, v = 50 + Math.random() * (B.blimp ? 200 : 90);
    S.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: .35 + Math.random() * .2, c: t2col(e.t) });
  }
  fx({ k: 'pop', x: e.x, y: e.y, t: .12, r: B.r });
  if (B.gold) { const v = 50 + S.wave * 2; if (!S.MD.noCash) S.money += v; profile.stats.golds++; floatTxt(e.x, e.y - 20, '+' + v + ' $', '#ffe066', 1.4); play('coin'); }
  if (B.boss) { profile.stats.bosses++; if (B.boss === 3) profile.stats.hydra++; S.banner = { txt: B.n + ' vaincu !', t: 2.5 }; S.flash = -.5; }
  else if (B.blimp) profile.stats.blimps++;
  if (B.blimp) { play('bigboom', .8, .1); fx({ k: 'boom', x: e.x, y: e.y, r: B.r * 1.6, t: .6 }); } else if (e.t === 'ceramic') play('bigpop', .6, .06); else popSound();
  if (!B.kids.length) { e.alive = false; return; }
  const sp = B.blimp ? 16 : 7;
  for (let i = 1; i < B.kids.length; i++) spawn(B.kids[i], e.p, e.d - sp * i, e.camo, e.rg);
  e.t = B.kids[0]; e.hp = e.maxHp = BT[e.t].hp; e.fort = false; e.phase = 0; e.shield = 0; e.bossT = 0;
}
const t2col = (t: string) => t === 'rainbow' ? ['#ff3b3b', '#ffe23b', '#3bd15a', '#2f8ae6'][Math.random() * 4 | 0] : t === 'zebra' ? (Math.random() < .5 ? '#111' : '#fff') : BT[t].c;
let lastBlock = 0;
function blocked(e: Enemy) {
  if (S.clock - lastBlock < .15) return;
  lastBlock = S.clock; play('metal', .35, .2);
  fx({ k: 'spark', x: e.x, y: e.y, t: .15 });
}
function explode(x: number, y: number, r: number, dmg: number, kind: Kind, src: Tower | null, bm = 1, cap = 40, onHit?: (e: Enemy) => void) {
  fx({ k: 'boom', x, y, r, t: .4 });
  play('boom', .45, .07);
  let n = 0;
  near(x, y, r + 60, e => {
    if (n >= cap || !e.alive) return;
    const rr = r + BT[e.t].r * .6;
    if ((e.x - x) ** 2 + (e.y - y) ** 2 < rr * rr && hit(e, dmg, kind, src, bm)) { n++; if (onHit && e.alive) onHit(e); }
  });
}
function applyGlue(e: Enemy, glueT: number, glueF: number, acid: number, blimpOk: boolean, src: Tower | null) {
  if (BT[e.t].blimp && !blimpOk) return;
  if (BT[e.t].boss) return;
  e.glueF = e.glueT > 0 ? Math.min(e.glueF, glueF) : glueF;
  e.glueT = glueT;
  if (acid) e.acid = e.acid ? Math.min(e.acid, acid) : acid;
  e.glueSrc = src;
}
const burn = (e: Enemy, sec: number, src: Tower) => { e.burnT = Math.max(e.burnT, sec); e.burnSrc = src; };

// Grille spatiale pour les collisions projectiles / ennemis
const GC = 64, GW = Math.ceil(W / GC) + 2, GH = Math.ceil(H / GC) + 2, grid: Enemy[][] = Array.from({ length: GW * GH }, () => []);
const gx = (v: number) => Math.max(0, Math.min(GW - 1, Math.floor(v / GC) + 1)), gy = (v: number) => Math.max(0, Math.min(GH - 1, Math.floor(v / GC) + 1));
function buildGrid() {
  for (const c of grid) c.length = 0;
  for (const e of S.enemies) if (e.alive) grid[gy(e.y) * GW + gx(e.x)].push(e);
}
function near(x: number, y: number, r: number, cb: (e: Enemy) => void) {
  for (let cy = gy(y - r), y1 = gy(y + r); cy <= y1; cy++)
    for (let cx = gx(x - r), x1 = gx(x + r); cx <= x1; cx++) for (const e of grid[cy * GW + cx]) cb(e);
}

// ---------- Tours ----------
function makeTower(type: string, x: number, y: number): Tower {
  const t = ghostTower(type, x, y);
  t.id = ++uid;
  return t;
}
export function upState(t: Tower, p: number): 'max' | 'lock' | 'mode' | null {
  const n = t.up[p] + 1;
  if (n > 4) return 'max';
  if (active && S.MD.maxTier && n > S.MD.maxTier) return 'mode';
  if (n > 2 && t.up[1 - p] > 2) return 'lock';
  return null;
}
export function buyUpgrade(t: Tower | null, p: number) {
  if (!active || !t || upState(t, p)) return;
  const u = TOWERS[t.type].paths[p][t.up[p]], c = priceOf(u[1]);
  if (S.money < c) { play('error'); return; }
  S.money -= c; t.spent += c; const hadAb = t.ab;
  u[3](t); t.up[p]++;
  if (t.ab && !hadAb) t.abCd = ABIL[t.ab].cd * .5;
  if (t.up[p] === 4 && !profile.stats.t4types.includes(t.type)) profile.stats.t4types.push(t.type);
  play('upgrade'); fx({ k: 'ring', x: t.x, y: t.y, r: 30, t: .4, c: '#ffe066' });
  sync(); touch(); checkAchievements();
}
export const sellValue = (t: Tower) => Math.floor(t.spent * S.D.sell) + Math.floor(t.bank ?? 0);
export function sell(t: Tower | null) {
  if (!active || !t || S.MD.noSell) return;
  const v = sellValue(t);
  S.money += v; S.towers.splice(S.towers.indexOf(t), 1);
  floatTxt(t.x, t.y - 20, '+' + v + ' $', '#ffe066', 1);
  profile.stats.sold++;
  play('sell'); selected = null; sync(); touch();
}
export function withdraw(t: Tower) {
  if (!t.bank) return;
  const v = Math.floor(t.bank); S.money += v; t.bank = 0;
  floatTxt(t.x, t.y - 24, '+' + v + ' $', '#ffe066', 1.4); play('coin'); sync(); touch();
}
export function cyclePrio(t: Tower) { t.prio = (t.prio + 1) % 4; play('click'); touch(); }
export function aimMortar(t: Tower) { S.aim = t; play('click'); }

export const eRange = (t: Tower) => t.range * t.bf.range;
export const eRate = (t: Tower) => t.rate * t.bf.rate * (t.boostT > 0 ? t.boostMul : 1) * (active && S.cmdT > 0 ? .5 : 1);
export const eCamo = (t: Tower) => t.camo || t.bf.camo;
export const eKind = (t: Tower): Kind | undefined => t.kind === 'sharp' && t.bf.armor ? 'normal' : t.kind;
export const ePierce = (t: Tower) => t.pierce + t.bf.pierce;
export const eDmg = (t: Tower) => t.dmg + (t.dmg > 0 ? t.bf.dmg : 0);

function applyBuffs() {
  for (const t of S.towers) t.bf = { range: 1, rate: 1, camo: false, pierce: 0, dmg: 0, armor: false };
  for (const r of S.towers) {
    if (r.mode !== 'support') continue;
    for (const t of S.towers) {
      if (t === r || Math.hypot(t.x - r.x, t.y - r.y) > r.range) continue;
      t.bf.camo = true;
      if (r.bRate) t.bf.rate = Math.min(t.bf.rate, r.bRate);
      if (r.bPierce) t.bf.pierce = 1;
      if (r.bArmor) t.bf.armor = true;
      if (r.bRange) t.bf.range = Math.max(t.bf.range, r.bRange);
      if (r.bDmg) t.bf.dmg = 1;
    }
    if (r.decamo) for (const e of S.enemies) if (e.camo && (e.x - r.x) ** 2 + (e.y - r.y) ** 2 < r.range ** 2) e.camo = false;
  }
}
function target(t: Tower, x: number, y: number, R: number, filter?: (e: Enemy) => boolean, prio = t.prio): Enemy | null {
  const camo = eCamo(t);
  let best: Enemy | null = null, bs = -Infinity;
  for (const e of S.enemies) {
    if (!e.alive || e.d < 8 || e.phase > 0 || (e.camo && !camo)) continue;
    const dx = e.x - x, dy = e.y - y, dd = dx * dx + dy * dy, rr = R + BT[e.t].r * .5;
    if (dd > rr * rr || (filter && !filter(e))) continue;
    const prog = e.d - S.m.P[e.p].len;
    const s = prio === 0 ? prog : prio === 1 ? -prog : prio === 2 ? BT[e.t].rbe * 1e5 + prog : -dd;
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}
export const PRIO = ['Premier', 'Dernier', 'Fort', 'Proche'];

function shoot(o: ShotOpts) {
  const sp = o.speed || 500;
  S.projs.push({ x: o.x, y: o.y, vx: Math.cos(o.ang) * sp, vy: Math.sin(o.ang) * sp, sp, life: o.life, pierce: o.pierce || 1, dmg: o.dmg,
    kind: o.kind, blast: o.blast || 0, bdmg: o.bdmg || o.dmg, frags: o.frags || 0, bm: o.bm || 1, src: o.src, hits: new Set(),
    spr: o.spr, rot: o.ang, homing: !!o.homing, rad: o.rad || 5, glue: o.glue || null, tgt: o.tgt || null, orb: o.orb || null, ot: 0,
    winch: !!o.winch, slow: o.slow || 0, shatter: !!o.shatter });
}
function towerShot(t: Tower, ang: number, extra: Partial<ShotOpts> = {}) {
  const sp = t.speed || 500;
  let dmg = eDmg(t);
  if (t.critChance && (Math.random() < t.critChance || (t.ab === 'mortel' && t.boostT > 0))) { dmg *= 5; fx({ k: 'spark', x: t.x, y: t.y - 20, t: .2 }); }
  shoot({ x: t.x + Math.cos(ang) * 18, y: t.y + Math.sin(ang) * 18, ang, speed: sp, life: (eRange(t) + 40) / sp, pierce: ePierce(t), dmg,
    kind: eKind(t), blast: t.blast, bdmg: t.kind === 'explo' ? dmg : Math.ceil(dmg / 2), frags: t.frags, bm: t.blimpMul, src: t,
    spr: t.proj, homing: t.homing, winch: t.winch, slow: t.slow, shatter: t.shatter, glue: t.mode === 'proj' && t.kind === 'glue' ? t : null, ...extra });
}

function towerAct(t: Tower, dt: number) {
  if (t.boostT > 0) t.boostT -= dt;
  if (t.beamT && t.beamT > 0) t.beamT -= dt;
  if (t.ab && t.abCd > 0) t.abCd -= dt;
  if (t.type === 'char') t.body += (((t.ang - t.body + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 4);
  if (t.mode === 'income' || t.mode === 'support' || t.mode === 'bank') return;
  if (t.mode === 'plane') return planeAct(t, dt);
  if (t.mode === 'drone') return droneAct(t, dt);
  const R = eRange(t);
  if (t.coax && (t.cd2 -= dt) <= 0) {
    const e = target(t, t.x, t.y, R);
    if (e) {
      t.cd2 = .12 * (eRate(t) / t.rate);
      shoot({ x: t.x, y: t.y, ang: Math.atan2(e.y - t.y, e.x - t.x) + (Math.random() - .5) * .1, speed: 650, life: (R + 30) / 650, pierce: 2, dmg: 1,
        kind: t.bf.armor ? 'normal' : 'sharp', src: t, spr: 273 });
      play('shoot', .25, .08);
    }
  }
  if ((t.cd -= dt) > 0) return;
  if (t.mode === 'proj') {
    const e = target(t, t.x, t.y, R, t.kind === 'glue' ? x => !(x.glueT > 1 && x.glueF <= t.glueF) && (!BT[x.t].blimp || t.glueBlimp) : undefined);
    if (!e) return;
    t.cd = eRate(t); t.ang = Math.atan2(e.y - t.y, e.x - t.x);
    const n = t.multi || 1;
    for (let i = 0; i < n; i++) {
      if (t.twin) {
        const o = (i - .5) * 14, px = -Math.sin(t.ang) * o, py = Math.cos(t.ang) * o;
        towerShot(t, t.ang, { x: t.x + px + Math.cos(t.ang) * 22, y: t.y + py + Math.sin(t.ang) * 22, tgt: e });
      } else if (t.orbit) {
        const cx = (t.x + e.x) / 2, cy = (t.y + e.y) / 2, r = Math.max(30, Math.hypot(e.x - t.x, e.y - t.y) / 2);
        towerShot(t, t.ang, { life: .9, rad: 7, orb: { cx, cy, r, a0: Math.atan2(t.y - cy, t.x - cx), dir: i ? -1 : 1, T: .9 } });
      } else towerShot(t, t.ang + (i - (n - 1) / 2) * .16, { tgt: e });
    }
    play(t.snd ?? 'shoot', .45);
  } else if (t.mode === 'burst') {
    if (!target(t, t.x, t.y, R)) return;
    t.cd = eRate(t); t.spin += .2;
    for (let i = 0; i < t.burst; i++) towerShot(t, t.spin + i * TAU / t.burst, { life: R / t.speed + .05 });
    play('shoot', .35);
  } else if (t.mode === 'ring') {
    if (!target(t, t.x, t.y, R)) return;
    t.cd = eRate(t);
    let n = 0;
    for (const e of S.enemies) if (e.alive && n < 60 && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 < (R + BT[e.t].r) ** 2 && hit(e, eDmg(t), eKind(t), t)) n++;
    fx({ k: 'ring', x: t.x, y: t.y, r: R, t: .25, c: '#ff8a2a', fill: 'rgba(255,120,30,.18)' });
  } else if (t.mode === 'pulse') {
    const ok = (e: Enemy) => e.alive && e.frz <= 0 && e.d > 8 && !BT[e.t].boss && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 < (R + BT[e.t].r) ** 2 &&
      (BT[e.t].blimp ? t.deep : t.deep || !BT[e.t].immune.includes('cold'));
    const list = S.enemies.filter(ok).slice(0, ePierce(t));
    if (!list.length) return;
    t.cd = eRate(t);
    for (const e of list) {
      if (BT[e.t].blimp) { e.slowT = 2; e.slowF = .55; hit(e, eDmg(t), 'normal', t); continue; }
      hit(e, eDmg(t), t.deep ? 'normal' : 'cold', t);
      e.frz = t.freeze; e.chill = t.chill;
    }
    fx({ k: 'ring', x: t.x, y: t.y, r: R, t: .35, c: '#e6fbff', fill: 'rgba(170,235,255,.22)' });
    play('frost', .35, .2);
  } else if (t.mode === 'hitscan') {
    let e = target(t, t.x, t.y, R);
    if (!e) return;
    t.cd = eRate(t); t.ang = Math.atan2(e.y - t.y, e.x - t.x);
    const done = new Set<number>();
    for (let k = 0; k < ePierce(t) && e; k++) {
      fx({ k: 'line', x: t.x + Math.cos(t.ang) * 20, y: t.y + Math.sin(t.ang) * 20, x2: e.x, y2: e.y, t: .09, c: '#fff3b0' });
      done.add(e.id); hit(e, eDmg(t), eKind(t), t, t.blimpMul);
      e = k + 1 < ePierce(t) ? target(t, t.x, t.y, R, x => !done.has(x.id)) : null;
    }
    play('snipe', .4, .08);
  } else if (t.mode === 'factory') {
    pileSpots(t);
    if (!t.spots!.length || !S.running || S.traps.filter(x => x.src === t).length >= 25) return;
    t.cd = eRate(t); dropPile(t);
  } else if (t.mode === 'mortar') {
    if (!S.enemies.some(e => e.d > 8)) return;
    t.cd = eRate(t); fireShell(t);
  } else if (t.mode === 'flame') {
    const e = target(t, t.x, t.y, R);
    if (!e) return;
    t.cd = eRate(t); t.ang = Math.atan2(e.y - t.y, e.x - t.x);
    let n = 0;
    for (const o of S.enemies) {
      if (n >= ePierce(t) || !o.alive || (o.camo && !eCamo(t))) continue;
      const dx = o.x - t.x, dy = o.y - t.y, dd = Math.hypot(dx, dy);
      if (dd > R + BT[o.t].r) continue;
      const da = Math.abs(((Math.atan2(dy, dx) - t.ang + Math.PI * 3) % TAU) - Math.PI);
      if (da > t.cone && dd > 22) continue;
      if (hit(o, eDmg(t), eKind(t), t, t.blimpMul)) { n++; if (t.burn && o.alive) burn(o, t.burn, t); }
    }
    for (let i = 0; i < 5 && S.parts.length < 400; i++) {
      const a = t.ang + (Math.random() - .5) * t.cone * 2, v = 170 + Math.random() * 130;
      S.parts.push({ x: t.x + Math.cos(t.ang) * 20, y: t.y + Math.sin(t.ang) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: R / v, c: ['#ffe27a', '#ffa21a', '#ff5a1a'][i % 3], sz: 8 });
    }
    play('rocket', .12, .3);
  } else if (t.mode === 'beam') {
    const used = new Set<number>();
    t.beams = [];
    for (let k = 0; k < (t.multi || 1); k++) {
      const e = target(t, t.x, t.y, R, x => !used.has(x.id));
      if (!e) break;
      used.add(e.id);
      if (k === 0) { t.heat = e.id === t.lastT ? Math.min(t.heatMax, (t.heat || 0) + eRate(t) * 1.5) : 0; t.lastT = e.id; t.ang = Math.atan2(e.y - t.y, e.x - t.x); }
      const a = Math.atan2(e.y - t.y, e.x - t.x), cx = Math.cos(a), cy = Math.sin(a), L = R + 10, hits: [number, Enemy][] = [];
      for (const o of S.enemies) {
        if (!o.alive || (o.camo && !eCamo(t))) continue;
        const dx = o.x - t.x, dy = o.y - t.y, al = dx * cx + dy * cy;
        if (al >= 0 && al <= L && Math.abs(dx * cy - dy * cx) < BT[o.t].r + 4) hits.push([al, o]);
      }
      hits.sort((p, q) => p[0] - q[0]);
      const dmg = Math.max(1, Math.floor(eDmg(t) * (1 + (t.heat || 0))));
      for (const [, o] of hits.slice(0, ePierce(t))) hit(o, dmg, eKind(t), t, t.blimpMul);
      t.beams.push([t.x + cx * L, t.y + cy * L]);
    }
    if (!t.beams.length) { t.heat = 0; return; }
    t.cd = eRate(t); t.beamT = .2;
    play('zap', .1, .35);
  } else if (t.mode === 'push') {
    const ok = (e: Enemy) => e.alive && e.d > 8 && !BT[e.t].boss && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 < (R + BT[e.t].r) ** 2 && (BT[e.t].blimp ? t.pushB : e.pushed < 8);
    const list = S.enemies.filter(ok).slice(0, ePierce(t));
    if (!list.length) return;
    t.cd = eRate(t);
    for (const e of list) {
      if (BT[e.t].blimp) { e.d = Math.max(0, e.d - 15); posAt(S.m.P[e.p], e.d, e); continue; }
      e.d = Math.max(0, e.d - t.push); e.pushed++; // plafond de 8 poussées : évite de bloquer une bulle à l'infini
      if (t.strip) { e.camo = false; e.rg = null; }
      posAt(S.m.P[e.p], e.d, e);
      if (t.dmg) hit(e, eDmg(t), 'normal', t);
    }
    fx({ k: 'ring', x: t.x, y: t.y, r: R, t: .3, c: 'rgba(230,250,255,.9)', fill: 'rgba(230,250,255,.12)' });
    play('frost', .2, .3);
  } else if (t.mode === 'chain') {
    let cur = target(t, t.x, t.y, R);
    if (!cur) return;
    t.cd = eRate(t);
    const pts: [number, number][] = [[t.x, t.y - 14]], done = new Set<number>();
    for (let k = 0; k < ePierce(t) && cur; k++) {
      pts.push([cur.x, cur.y]); done.add(cur.id);
      hit(cur, eDmg(t), 'magic', t, t.blimpMul);
      let nb: Enemy | null = null, nd = 95 * 95;
      for (const o of S.enemies) { if (!o.alive || done.has(o.id) || o.phase > 0) continue; const dd = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2; if (dd < nd) { nd = dd; nb = o; } }
      cur = nb;
    }
    fx({ k: 'zap', pts, t: .14 });
    play('zap', .35, .07);
  }
}
function pileSpots(t: Tower) {
  const R = eRange(t);
  if (t.spots && t.spotsR === R) return;
  t.spotsR = R; t.spots = [];
  for (const P of S.m.P) for (let d = 20; d < P.len; d += 8) {
    const q = posAt(P, d, pt());
    if (q.x > 8 && q.y > 8 && q.x < W - 8 && q.y < H - 8 && Math.hypot(q.x - t.x, q.y - t.y) < R) t.spots.push({ x: q.x, y: q.y, f: d / P.len });
  }
  t.spots.sort((a, b) => b.f - a.f);
}
function dropPile(t: Tower) {
  pileSpots(t);
  const spots = t.spots!;
  if (!spots.length) return;
  const n = t.smart ? Math.max(1, Math.floor(spots.length * .25)) : spots.length, sp = spots[Math.random() * n | 0];
  S.traps.push({ k: 'clous', x: sp.x + (Math.random() - .5) * 14, y: sp.y + (Math.random() - .5) * 14, x0: t.x, y0: t.y, fly: .35, F: .35,
    left: ePierce(t), dmg: eDmg(t), kind: eKind(t) ?? 'sharp', src: t, boom: t.pileBoom, hits: new Set() });
}
function fireShell(t: Tower, spread?: number) {
  if (t.tx == null || t.ty == null) { const P = S.m.P[0], q = posAt(P, P.len * .5, pt()); t.tx = q.x; t.ty = q.y; }
  const a = Math.random() * TAU, r = Math.random() * (spread ?? t.spread), x = t.tx + Math.cos(a) * r, y = t.ty + Math.sin(a) * r;
  t.ang = Math.atan2(y - t.y, x - t.x);
  fx({ k: 'shell', x0: t.x, y0: t.y, x1: x, y1: y, t: .8 });
  S.timers.push({ at: S.clock + .8, fn: () => explode(x, y, t.blast, eDmg(t), 'explo', t, 1, 40, e => {
    if (t.burn) burn(e, t.burn, t);
    if (t.stun && !BT[e.t].boss) e.stunT = Math.max(e.stunT, t.stun);
  }) });
  play('boom', .2, .2);
}
function planeAct(t: Tower, dt: number) {
  t.pa += dt * .9;
  const a = t.pa;
  t.px = Math.max(20, Math.min(W - 20, t.x + 150 * Math.sin(a)));
  t.py = Math.max(20, Math.min(H - 20, t.y + 80 * Math.sin(2 * a)));
  t.hd = Math.atan2(160 * Math.cos(2 * a), 150 * Math.cos(a));
  if (!S.enemies.length) return;
  if ((t.cd -= dt) <= 0) {
    t.cd = eRate(t);
    for (let i = 0; i < t.burst; i++) shoot({ x: t.px, y: t.py, ang: t.hd + i * TAU / t.burst, speed: t.speed, life: .7, pierce: ePierce(t), dmg: eDmg(t), kind: eKind(t), src: t, spr: t.proj });
    play('shoot', .25, .1);
  }
  if (t.missiles && (t.cd2 -= dt) <= 0) {
    const e = target(t, t.px, t.py, 380);
    if (e) { t.cd2 = .9 * (eRate(t) / t.rate); shoot({ x: t.px, y: t.py, ang: t.hd, speed: 380, life: 2, dmg: 3, kind: 'explo', blast: 35, src: t, spr: 253, homing: true, tgt: e, bm: 2 }); play('rocket', .3, .15); }
  }
  if (t.bombs && (t.cd3 -= dt) <= 0) {
    let any = false; near(t.px, t.py, 70, e => { any ||= e.alive && (e.x - t.px) ** 2 + (e.y - t.py) ** 2 < 70 * 70; });
    if (any) { t.cd3 = 1.3; const x = t.px, y = t.py; S.timers.push({ at: S.clock + .25, fn: () => explode(x, y, 55, 2 + (t.up[1] > 3 ? 2 : 0), 'explo', t) }); }
  }
}
function droneAct(t: Tower, dt: number) {
  const list = t.droneList ??= [];
  while (list.length < t.drones) list.push({ a: 0, x: t.x, y: t.y, cd: Math.random() * .5 });
  const R = eRange(t);
  list.forEach((d, i) => {
    d.a += dt * 1.6;
    const a = d.a + i * TAU / list.length;
    d.x = t.x + Math.cos(a) * 48; d.y = t.y + Math.sin(a) * 48;
    if ((d.cd -= dt) > 0) return;
    const e = target(t, t.x, t.y, R);
    if (!e) return;
    d.cd = eRate(t);
    const ang = Math.atan2(e.y - d.y, e.x - d.x);
    shoot({ x: d.x, y: d.y, ang, speed: t.speed, life: (R + 60) / t.speed, pierce: ePierce(t), dmg: eDmg(t), kind: eKind(t), src: t, spr: t.proj, bm: t.blimpMul });
    play('shoot', .15, .12);
  });
}

// ---------- Capacités ----------
export function abilityGroups() {
  const groups: { k: string; towers: Tower[]; ready: boolean; frac: number; type: string }[] = [];
  if (!active) return groups;
  for (const t of S.towers) {
    if (!t.ab) continue;
    let g = groups.find(x => x.k === t.ab);
    if (!g) groups.push(g = { k: t.ab, towers: [], ready: false, frac: 1, type: t.type });
    g.towers.push(t);
    const f = Math.max(0, t.abCd) / ABIL[t.ab].cd;
    g.frac = Math.min(g.frac, f); g.ready ||= f <= 0;
  }
  return groups;
}
export function useAbilityGroup(k: string) {
  const t = S.towers.filter(x => x.ab === k).sort((a, b) => a.abCd - b.abCd)[0];
  if (t) useAbility(t);
}
function useAbility(t: Tower) {
  if (!active || S.over || !t.ab || t.abCd > 0) return;
  t.abCd = ABIL[t.ab].cd; play('ability');
  profile.stats.abilities++;
  S.banner = { txt: ABIL[t.ab].n + ' !', t: 1.4 };
  switch (t.ab) {
    case 'rafale': t.boostT = 8; t.boostMul = .25; break;
    case 'tempete': t.boostT = 10; t.boostMul = .2; break;
    case 'solaire': t.boostT = 6; t.boostMul = .25; break;
    case 'mortel': t.boostT = 10; t.boostMul = 1; break;
    case 'lames':
      for (let w = 0; w < 3; w++) S.timers.push({ at: S.clock + w * .25, fn: () => {
        for (let i = 0; i < 24; i++) shoot({ x: t.x, y: t.y, ang: i * TAU / 24 + w * .13, speed: 450, life: .9, pierce: 6, dmg: 2, kind: 'normal', src: t, spr: 'blade' });
        play('shoot');
      } });
      break;
    case 'orbitale':
      for (const e of S.enemies) if (e.alive && BT[e.t].blimp) { fx({ k: 'beam', x: e.x, y: e.y, t: .5 }); hit(e, 1000, 'magic', t); }
      play('bigboom'); break;
    case 'glaciaire': for (const e of S.enemies) if (!BT[e.t].boss) { e.frz = 6; e.hard = true; } S.flash = -.6; play('frost'); break;
    case 'zero':
      for (const e of S.enemies) { if (!BT[e.t].boss) { e.frz = 4; e.hard = true; } hit(e, 3, 'normal', t); }
      S.flash = -.6; play('frost'); break;
    case 'ravitaillement': { const v = 400 + 20 * S.wave; S.money += v; floatTxt(t.x, t.y - 30, '+' + v + ' $', '#ffe066', 1.5); play('coin'); break; }
    case 'maree': for (const e of S.enemies) if (!BT[e.t].boss) { e.glueT = 10; e.glueF = .3; e.acid = 1; e.glueSrc = t; } play('glue'); break;
    case 'bombard':
      for (const P of S.m.P) for (let d = 0; d < P.len; d += 45) {
        const p = posAt(P, d, pt());
        S.timers.push({ at: S.clock + d / 900, fn: () => explode(p.x, p.y, 48, 10, 'explo', t, 1, 60) });
      }
      break;
    case 'salve':
      for (let i = 0; i < 10; i++) S.timers.push({ at: S.clock + i * .12, fn: () => {
        const e = target(t, t.x, t.y, 9999, undefined, 2);
        if (e) { t.ang = Math.atan2(e.y - t.y, e.x - t.x); explode(e.x, e.y, 40, eDmg(t), 'normal', t, 2, 20); }
      } });
      break;
    case 'commandement': S.cmdT = 10; break;
    case 'disque': shoot({ x: t.x, y: t.y, ang: 0, life: 4, pierce: 400, dmg: 3, kind: 'normal', src: t, spr: 'bigdisc', rad: 22, orb: { cx: t.x, cy: t.y, r: 110, a0: 0, dir: 1, T: 4, loops: 4 } }); break;
    case 'fournaise':
      for (const e of S.enemies) if (e.alive && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 < 180 * 180) { hit(e, 6, 'fire', t, 3); if (e.alive) burn(e, 4, t); }
      fx({ k: 'ring', x: t.x, y: t.y, r: 180, t: .6, c: '#ff7a1a', fill: 'rgba(255,120,30,.3)' }); play('bigboom'); break;
    case 'tapis': for (let i = 0; i < 15; i++) dropPile(t); break;
    case 'barrage': for (let i = 0; i < 24; i++) S.timers.push({ at: S.clock + i * .1, fn: () => fireShell(t, 70) }); break;
    case 'remorquage': {
      let b: Enemy | null = null;
      for (const e of S.enemies) if (e.alive && BT[e.t].blimp && BT[e.t].blimp < 3 && (!b || BT[e.t].rbe > BT[b.t].rbe)) b = e;
      if (!b) { t.abCd = 0; break; }
      fx({ k: 'line', x: t.x, y: t.y, x2: b.x, y2: b.y, t: .4, c: '#cfd8e0' });
      b.d = 0; posAt(S.m.P[b.p], 0, b); break;
    }
    case 'ouragan': for (const e of S.enemies) if (!BT[e.t].boss) { e.d = Math.max(0, e.d - (BT[e.t].blimp ? 60 : 250)); posAt(S.m.P[e.p], e.d, e); } S.flash = -.4; play('frost'); break;
    case 'nuee':
      for (let i = 0; i < 12; i++) shoot({ x: t.x, y: t.y, ang: i * TAU / 12, speed: 360, life: 3, dmg: 6, kind: 'explo', blast: 35, bm: 3, src: t, spr: 274, homing: true });
      play('rocket'); break;
    case 'bourse': S.money += 1500; floatTxt(t.x, t.y - 30, '+1500 $', '#ffe066', 1.5); play('coin'); break;
    case 'marche': t.bank = Math.min(t.cap, (t.bank ?? 0) * 2); floatTxt(t.x, t.y - 30, 'Coffre x2', '#ffe066', 1.5); play('coin'); touch(); break;
  }
  sync();
}

// ---------- Vagues ----------
export function startWave() {
  if (!active || S.running || S.over) return;
  S.wave++; S.queue = buildQueue(S.wave, S.m.P.length); S.wt = 0; S.running = true;
  S.banner = { txt: isBossWave(S.wave) ? 'Vague ' + S.wave + ' — BOSS !' : 'Vague ' + S.wave, t: isBossWave(S.wave) ? 2.6 : 1.6 };
  play(isBossWave(S.wave) ? 'bigboom' : 'wave'); sync(); ui.waveRev++;
}
function waveRewards() {
  const bonus = S.MD.noBonus || S.MD.noCash ? 0 : 100 + S.wave; S.money += bonus;
  for (const t of S.towers) {
    if (t.income && t.mode === 'income') { S.money += t.income; floatTxt(t.x, t.y - 24, '+' + t.income + ' $', '#ffe066', 1.4); play('coin', .6); }
    if (t.mode === 'bank') { t.bank = Math.min(t.cap, ((t.bank ?? 0) + t.income) * (1 + t.interest)); floatTxt(t.x, t.y - 24, Math.floor(t.bank) + ' $', '#ffd27a', 1.4); }
    if (t.heal) { S.lives += t.heal; floatTxt(t.x + 10, t.y - 6, '+' + t.heal + ' vies', '#ff8a8a', 1.4); }
  }
  floatTxt(W / 2, H / 2 + 40, `Vague ${S.wave} terminée` + (bonus ? `  +${bonus} $` : ''), '#ffffff', 1.8, true);
  const k = recKey();
  if (S.wave > (profile.best[k] || 0)) profile.best[k] = S.wave;
  if (S.MD.k === 'apoc') profile.stats.apocBest = Math.max(profile.stats.apocBest, S.wave);
  const r0 = rankOf(profile.xp);
  profile.xp += Math.round((10 + 2 * S.wave) * [1, 1.25, 1.5, 2][S.di]);
  const r1 = rankOf(profile.xp);
  if (r1 > r0) {
    const news = TOWER_KEYS.filter(t => TOWER_RANK[t] > r0 && TOWER_RANK[t] <= r1).map(t => TOWERS[t].name);
    S.banner = { txt: `Rang ${r1} !`, t: 2.5 };
    if (news.length && !profile.unlockAll) toast('Rang ' + r1, news.join(', ') + (news.length > 1 ? ' débloquées' : ' débloquée'), 'unlock');
    play('win'); ui.shop++;
  }
  saveProfile(); checkAchievements(); touch();
}
// Apocalypse : la vague suivante part dès que la précédente a fini d'apparaître.
function apocNext() {
  waveRewards();
  S.wave++; S.queue = buildQueue(S.wave, S.m.P.length); S.wt = 0;
  play('wave'); sync(); ui.waveRev++;
}
function endWave() {
  S.running = false;
  waveRewards();
  S.traps = [];
  saveGame();
  if (!S.freeplay && S.wave >= S.D.waves) return endGame(true);
  if (S.auto) S.autoT = 1.2;
  sync(); ui.waveRev++;
}
function endGame(win: boolean) {
  S.over = true; S.running = false; ui.placing = null; selected = null; ui.boss = null;
  const st = profile.stats;
  if (win) {
    profile.wins++; profile.medals[recKey()] = true;
    if (!st.winDiffs.includes(S.di)) st.winDiffs.push(S.di);
    if (!st.winModes.includes(S.MD.k)) st.winModes.push(S.MD.k);
    if (!st.mapsWon.includes(S.mi)) st.mapsWon.push(S.mi);
    if (S.leaked === 0) st.perfect = true;
    play('win');
  } else play('lose');
  saveProfile(); store.del('bd2-save'); checkAchievements();
  sync(); touch(); showMenu(win ? 'victory' : 'defeat');
}
export function continueFreeplay() { S.over = false; S.freeplay = true; hideMenu(); sync(); ui.waveRev++; saveGame(); }
export const restart = () => { store.del('bd2-save'); newGame(S.mi, S.di, S.mode); };
export function quitToMenu() { if (active && !S.over) saveGame(); active = false; ui.active = false; selected = null; ui.placing = null; showMenu('main'); }
export function cycleSpeed() { if (!active) return; S.speed = S.speed % 3 + 1; play('click'); sync(); }
export function toggleAuto() { if (!active) return; S.auto = !S.auto; play('click'); if (S.auto && !S.running) startWave(); sync(); }

// ---------- Boss ----------
function bossAct(e: Enemy, dt: number): number {
  const B = BT[e.t];
  e.bossT += dt;
  if (B.boss === 1 && e.bossT > 4) {
    e.bossT = 0;
    for (let i = 1; i <= 3; i++) spawn('ceramic', e.p, e.d - 30 - i * 12);
    fx({ k: 'ring', x: e.x, y: e.y, r: 70, t: .4, c: '#c2a6ff' });
  }
  if (B.boss === 2) {
    if (e.shield > 0) e.shield -= dt;
    if (e.bossT > 7) { e.bossT = 0; e.shield = 2.5; play('frost', .6); }
    return e.shield > 0 ? 2.5 : 1;
  }
  if (B.boss === 3 && e.bossT > 6) {
    e.bossT = 0;
    for (let i = 1; i <= 2; i++) spawn('d1', e.p, e.d - 40 - i * 20);
    fx({ k: 'ring', x: e.x, y: e.y, r: 90, t: .5, c: '#ff4040' });
  }
  return 1;
}

// ---------- Mise à jour ----------
function update(dt: number) {
  S.clock += dt;
  if (S.cmdT > 0) S.cmdT -= dt;
  for (let i = S.timers.length - 1; i >= 0; i--) if (S.timers[i].at <= S.clock) { const f = S.timers[i].fn; S.timers.splice(i, 1); f(); }
  if (!S.running && S.autoT > 0 && (S.autoT -= dt) <= 0) startWave();
  if (S.running) {
    S.wt += dt;
    while (S.queue.length && S.queue[0].time <= S.wt) { const q = S.queue.shift()!; spawn(q.t, q.p, 0, q.camo, q.rg ? q.t : null, q.fort); }
    if (S.MD.k === 'apoc' && !S.queue.length && S.wt > 3) apocNext();
  }
  const fast = S.MD.fastBubbles ? 1.4 : 1;
  let boss: Enemy | null = null;
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const B = BT[e.t];
    let m = 1;
    if (B.boss) { m *= bossAct(e, dt); if (!boss || BT[e.t].hp > BT[boss.t].hp) boss = e; }
    if (B.ghost) { e.bossT += dt; e.phase = e.bossT % 3.2 > 2.2 ? 1 : 0; }
    if (e.frz > 0) { e.frz -= dt; if ((!B.blimp || e.hard) && !B.boss) m = 0; if (e.frz <= 0) { e.hard = false; if (e.chill) { e.slowT = 2.5; e.slowF = .5; } } }
    if (e.slowT > 0) { e.slowT -= dt; m = Math.min(m, B.boss ? Math.max(.7, e.slowF) : e.slowF); }
    if (e.glueT > 0) {
      e.glueT -= dt; m = Math.min(m, e.glueF);
      if (e.acid && (e.acidT += dt) >= e.acid) { e.acidT = 0; hit(e, B.blimp ? 8 : 1, 'normal', e.glueSrc); }
      if (e.glueT <= 0) { e.acid = 0; e.glueF = 1; }
    }
    if (e.burnT > 0) { e.burnT -= dt; if ((e.burnC += dt) >= 1) { e.burnC = 0; hit(e, 1, 'fire', e.burnSrc); } }
    if (e.stunT > 0) { e.stunT -= dt; m = 0; }
    if (!e.alive) continue;
    if (e.rg && !BT[e.t].blimp && (e.rgT += dt) > 3) { const n = regrowNext(e.t, e.rg); if (n) { e.t = n; e.hp = e.maxHp = BT[n].hp; } e.rgT = 0; }
    const P = S.m.P[e.p];
    e.d += 50 * BT[e.t].s * m * fast * dt;
    if (e.d >= P.len) {
      e.alive = false;
      const loss = Math.max(1, BT[e.t].rbe - (BT[e.t].hp - e.hp));
      S.lives -= loss; S.leaked += loss; S.flash = .45; play('leak', .7, .1);
      floatTxt(Math.min(W - 40, Math.max(40, e.x)), Math.min(H - 20, Math.max(30, e.y)), '-' + loss + ' vies', '#ff5a5a');
      continue;
    }
    posAt(P, e.d, e);
  }
  ui.boss = boss ? { name: BT[boss.t].n, hp: boss.hp, max: boss.maxHp, shield: boss.shield > 0 } : null;
  if (S.lives <= 0) { S.lives = 0; return endGame(false); }
  buildGrid();
  applyBuffs();
  for (const t of S.towers) towerAct(t, dt);

  for (const s of S.projs) {
    if (s.homing) {
      if (!s.tgt || !s.tgt.alive) {
        let nd = 1e9; s.tgt = null;
        for (const e of S.enemies) { if (!e.alive || e.phase > 0) continue; const dd = (e.x - s.x) ** 2 + (e.y - s.y) ** 2; if (dd < nd) { nd = dd; s.tgt = e; } }
      }
      if (s.tgt) {
        const want = Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x);
        const da = ((want - s.rot + Math.PI * 3) % TAU) - Math.PI;
        s.rot += Math.max(-8 * dt, Math.min(8 * dt, da));
        s.vx = Math.cos(s.rot) * s.sp; s.vy = Math.sin(s.rot) * s.sp;
      }
    }
    if (s.orb) {
      const o = s.orb, a = o.a0 + o.dir * TAU * (o.loops || 1) * Math.min(1, (s.ot += dt) / o.T);
      s.x = o.cx + Math.cos(a) * o.r; s.y = o.cy + Math.sin(a) * o.r; s.rot += dt * 18;
    } else { s.x += s.vx * dt; s.y += s.vy * dt; }
    if ((s.life -= dt) <= 0 || (!s.orb && (s.x < -30 || s.y < -30 || s.x > W + 30 || s.y > H + 30))) { s.life = 0; continue; }
    near(s.x, s.y, 60, e => collide(s, e));
  }
  S.projs = S.projs.filter(s => s.life > 0);

  for (const tr of S.traps) {
    if (tr.fly > 0) { tr.fly -= dt; continue; }
    near(tr.x, tr.y, 40, e => {
      if (tr.left <= 0 || !e.alive || e.phase > 0 || (e.x - tr.x) ** 2 + (e.y - tr.y) ** 2 > (16 + BT[e.t].r) ** 2) return;
      if (tr.k === 'bombe') { explode(tr.x, tr.y, 75, 4, 'explo', null, 1, 50); tr.left = 0; return; }
      if (tr.hits.has(e.id)) return;
      tr.hits.add(e.id);
      if (tr.k === 'colle') { if (!BT[e.t].blimp) { applyGlue(e, 5, .4, 0, false, null); tr.left--; } return; }
      if (hit(e, tr.dmg, tr.kind, tr.src)) tr.left--;
    });
    if (tr.left <= 0 && tr.boom) explode(tr.x, tr.y, 50, 3, 'explo', tr.src, 1, 30);
  }
  S.traps = S.traps.filter(t => t.left > 0);
  S.enemies = S.enemies.filter(e => e.alive);

  for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; p.t -= dt; }
  S.parts = S.parts.filter(p => p.t > 0);
  for (const f of S.fx) f.t -= dt;
  S.fx = S.fx.filter(f => f.t > 0);
  for (const f of S.floats) { f.y -= 28 * dt; f.t -= dt; }
  S.floats = S.floats.filter(f => f.t > 0);
  if (S.running && !S.queue.length && !S.enemies.length) endWave();
}
function collide(s: Shot, e: Enemy) {
  if (s.life <= 0 || !e.alive || s.hits.has(e.id) || e.phase > 0) return;
  const rr = BT[e.t].r + s.rad;
  if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > rr * rr) return;
  s.hits.add(e.id);
  if (s.glue) {
    const g = s.glue;
    applyGlue(e, g.glueT, g.glueF, g.acid, g.glueBlimp, g);
    if (--s.pierce <= 0) s.life = 0;
    fx({ k: 'splat', x: e.x, y: e.y, t: .3 });
    return;
  }
  if (s.blast) {
    if (s.kind !== 'explo') hit(e, s.dmg, s.kind, s.src, s.bm);
    explode(s.x, s.y, s.blast, s.bdmg, 'explo', s.src, s.bm);
    for (let i = 0; i < s.frags; i++) shoot({ x: s.x, y: s.y, ang: i * TAU / s.frags, speed: 380, life: .25, pierce: 1, dmg: 1, kind: 'sharp', src: s.src, spr: 'spike' });
    s.life = 0; return;
  }
  const ok = hit(e, s.dmg, s.kind, s.src, s.bm);
  if (ok && e.alive && s.winch && BT[e.t].blimp && !BT[e.t].boss) { e.slowT = 3; e.slowF = .5; }
  if (ok && e.alive && s.slow) { e.slowT = 2; e.slowF = BT[e.t].blimp ? Math.max(s.slow + .3, .6) : s.slow; }
  if (s.shatter && s.frags) {
    for (let i = 0; i < s.frags; i++) shoot({ x: s.x, y: s.y, ang: s.rot + (i - 2) * .5, speed: 380, life: .25, pierce: 1, dmg: 1, kind: s.kind, src: s.src, spr: 'ice', slow: s.slow });
    s.frags = 0;
  }
  if (!ok || --s.pierce <= 0) s.life = 0; // une pointe rebondit sur le blindage
}

// ---------- Placement ----------
export function canPlace(x: number, y: number) {
  if (x < 18 || y < 18 || x > W - 18 || y > H - 18) return false;
  if (pathDist(S.m, x, y) < 40) return false;
  if (S.m.decorObjs!.some(d => Math.hypot(d.x - x, d.y - y) < d.r + 14)) return false;
  return S.towers.every(t => Math.hypot(t.x - x, t.y - y) > 34);
}
const onPath = (x: number, y: number) => pathDist(S.m, x, y) < 20 && x > 0 && y > 0 && x < W && y < H;
export function selectPlace(k: string | null) {
  if (!active || S.over || !k) { ui.placing = null; return; }
  const trap = k.startsWith('trap:'), cost = trap ? TRAPS[k.slice(5)].cost : TOWERS[k].cost;
  if (S.money < priceOf(cost) || (!trap && !towerOk(k))) { play('error'); return; }
  ui.placing = ui.placing === k ? null : k; selected = null; play('click'); touch();
}
export function placeTower(k: string, x: number, y: number): Tower | null {
  const c = priceOf(TOWERS[k].cost);
  if (S.money < c || !canPlace(x, y)) return null;
  S.money -= c;
  const t = makeTower(k, x, y); t.spent = c; S.towers.push(t);
  profile.stats.towers++;
  play('place'); fx({ k: 'ring', x, y, r: 26, t: .3, c: '#fff' });
  return t;
}
export function placeTrap(k: Trap['k'], x: number, y: number) {
  const c = priceOf(TRAPS[k].cost);
  if (S.money < c || !onPath(x, y)) return false;
  S.money -= c;
  S.traps.push({ k, x, y, left: k === 'clous' ? 20 : k === 'colle' ? 30 : 1, hits: new Set(), dmg: 1, kind: 'sharp', src: null, boom: false, x0: x, y0: y, fly: 0, F: 1 });
  play('place');
  return true;
}

function clickBoard(x: number, y: number, shift: boolean) {
  if (S.aim) { S.aim.tx = x; S.aim.ty = y; S.aim = null; play('click'); return; }
  const placing = ui.placing;
  if (placing?.startsWith('trap:')) {
    const k = placing.slice(5) as Trap['k'];
    if (placeTrap(k, x, y)) { if (!shift || S.money < priceOf(TRAPS[k].cost)) ui.placing = null; } else play('error');
  } else if (placing) {
    const t = placeTower(placing, x, y);
    if (t) { if (!shift || S.money < priceOf(TOWERS[placing].cost)) { ui.placing = null; selected = t; } }
    else play('error');
  } else {
    selected = S.towers.find(t => Math.hypot(t.x - x, t.y - y) < 24) || S.towers.find(t => t.mode === 'plane' && Math.hypot(t.px - x, t.py - y) < 26) || null;
    if (selected) play('click');
  }
  sync(); touch();
}

// ---------- Rendu de la partie ----------
function draw(now: number) {
  const tm = now / 1000, g = ctx;
  g.drawImage(S.bg, 0, 0);
  for (const tr of S.traps) {
    g.save();
    if (tr.fly > 0) { const q = 1 - tr.fly / tr.F; g.translate((tr.x0 - tr.x) * (1 - q), (tr.y0 - tr.y) * (1 - q) - Math.sin(q * Math.PI) * 40); }
    if (tr.k === 'clous') {
      g.fillStyle = '#555';
      for (let i = 0; i < 9; i++) { const a = i * 2.4; g.beginPath(); g.arc(tr.x + Math.cos(a) * 9 * (i % 3) / 2, tr.y + Math.sin(a) * 9 * (i % 3) / 2, 2.6, 0, TAU); g.fill(); }
      g.fillStyle = '#ddd'; for (let i = 0; i < tr.left; i += 4) g.fillRect(tr.x - 9 + i, tr.y + 13, 2, 2);
    } else if (tr.k === 'colle') {
      g.fillStyle = 'rgba(120,220,60,.7)'; g.beginPath(); g.ellipse(tr.x, tr.y, 18, 11, .3, 0, TAU); g.fill();
    } else {
      g.fillStyle = '#333'; g.beginPath(); g.arc(tr.x, tr.y, 10, 0, TAU); g.fill();
      g.fillStyle = Math.sin(tm * 8) > 0 ? '#ff3b3b' : '#7a1d1d'; g.beginPath(); g.arc(tr.x, tr.y, 3.5, 0, TAU); g.fill();
    }
    g.restore();
  }
  const s = selected;
  if (s && eRange(s) > 0 && eRange(s) < 2000) {
    g.beginPath(); g.arc(s.x, s.y, eRange(s), 0, TAU);
    g.fillStyle = s.mode === 'support' ? 'rgba(120,255,120,.1)' : 'rgba(255,255,255,.12)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.stroke();
  }
  for (const t of [...S.towers].sort((a, b) => a.y - b.y)) drawTower(g, t, t.x, t.y, tm, t === s);
  const blimps: Enemy[] = [];
  for (const e of S.enemies) {
    const B = BT[e.t];
    if (B.blimp) { blimps.push(e); continue; }
    if (e.phase > 0) g.globalAlpha = .3;
    const c = bubbleSprite(e.t, e.camo, !!e.rg);
    g.drawImage(c, e.x - c.width / 2, e.y - c.height / 2 + 2);
    g.globalAlpha = 1;
    if (e.fort) { g.strokeStyle = '#d7dde3'; g.lineWidth = 3; g.beginPath(); g.ellipse(e.x, e.y, B.r + 2, B.r * 1.15 + 2, 0, 0, TAU); g.stroke(); }
    if (e.t === 'ceramic' && e.hp < e.maxHp) {
      g.strokeStyle = 'rgba(40,20,5,.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(e.x - 6, e.y - 8); g.lineTo(e.x, e.y - 1); g.lineTo(e.x - 3, e.y + 6);
      if (e.hp < e.maxHp / 2) { g.moveTo(e.x, e.y - 1); g.lineTo(e.x + 7, e.y + 2); }
      g.stroke();
    }
    if (e.frz > 0) { g.fillStyle = 'rgba(190,240,255,.55)'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.rect(e.x - B.r - 2, e.y - B.r * 1.2 - 2, B.r * 2 + 4, B.r * 2.4 + 4); g.fill(); g.stroke(); }
    else if (e.slowT > 0) { g.strokeStyle = 'rgba(170,230,255,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(e.x, e.y, B.r + 3, 0, TAU); g.stroke(); }
    if (e.glueT > 0) { g.fillStyle = e.acid ? 'rgba(170,240,40,.6)' : 'rgba(120,220,60,.55)'; g.beginPath(); g.arc(e.x - 3, e.y + 3, B.r * .6, 0, TAU); g.arc(e.x + 4, e.y - 2, B.r * .45, 0, TAU); g.fill(); }
    if (e.burnT > 0) spr(g, 296, e.x + 4, e.y - B.r, 0, .3);
    if (e.stunT > 0) { g.fillStyle = '#ffe066'; for (let i = 0; i < 3; i++) { const a = tm * 6 + i * 2.1; g.beginPath(); g.arc(e.x + Math.cos(a) * 10, e.y - B.r - 6 + Math.sin(a) * 3, 2, 0, TAU); g.fill(); } }
  }
  for (const e of blimps) {
    const B = BT[e.t], c = blimpSprite(e.t);
    g.save(); g.translate(e.x, e.y); g.rotate(e.a);
    g.drawImage(c, -c.width / 2 - B.r * .12, -c.height / 2);
    if (e.fort) { g.strokeStyle = '#d7dde3'; g.lineWidth = 4; g.beginPath(); g.ellipse(0, 0, B.r * 1.25, B.r * .65, 0, 0, TAU); g.stroke(); }
    if (e.glueT > 0) { g.fillStyle = 'rgba(120,220,60,.45)'; g.beginPath(); g.ellipse(0, 0, B.r, B.r * .5, 0, 0, TAU); g.fill(); }
    if (e.frz > 0 || e.slowT > 0) { g.fillStyle = 'rgba(190,240,255,.35)'; g.beginPath(); g.ellipse(0, 0, B.r * 1.2, B.r * .6, 0, 0, TAU); g.fill(); }
    if (e.shield > 0) { g.strokeStyle = `rgba(120,240,255,${.6 + .3 * Math.sin(tm * 12)})`; g.lineWidth = 5; g.beginPath(); g.ellipse(0, 0, B.r * 1.5, B.r * .95, 0, 0, TAU); g.stroke(); }
    g.restore();
    if (!B.boss) {
      const w = B.r * 1.6;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(e.x - w / 2 - 1, e.y - B.r - 13, w + 2, 7);
      g.fillStyle = e.hp / e.maxHp > .5 ? '#5ee05e' : e.hp / e.maxHp > .25 ? '#f2d03b' : '#ff4b4b';
      g.fillRect(e.x - w / 2, e.y - B.r - 12, w * e.hp / e.maxHp, 5);
    }
  }
  for (const p of S.projs) drawShot(g, p);
  for (const t of S.towers) {
    if (t.mode === 'plane') drawPlane(g, t);
    if (t.droneList) for (const d of t.droneList) {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(d.x + 6, d.y + 8, 7, 4, 0, 0, TAU); g.fill();
      g.fillStyle = t.dmg > 3 ? '#c94a2a' : '#f2c12e'; g.strokeStyle = '#3a2a00'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(d.x, d.y, 6, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(d.x - 9, d.y - 5); g.lineTo(d.x + 9, d.y - 5); g.stroke();
    }
    if (t.beamT && t.beamT > 0 && t.beams) for (const [bx, by] of t.beams) {
      const w = 3 + (t.heat || 0) * 2;
      g.strokeStyle = 'rgba(255,50,120,.35)'; g.lineWidth = w * 2.5; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(bx, by); g.stroke();
      g.strokeStyle = '#ffd6e6'; g.lineWidth = w * .6; g.stroke();
    }
  }
  const aimT = S.aim || (s?.mode === 'mortar' ? s : null);
  if (aimT) {
    const ax = S.aim ? mouse.x : aimT.tx ?? -99, ay = S.aim ? mouse.y : aimT.ty ?? -99;
    g.strokeStyle = '#ff4040'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(ax, ay, 16, 0, TAU); g.moveTo(ax - 24, ay); g.lineTo(ax + 24, ay); g.moveTo(ax, ay - 24); g.lineTo(ax, ay + 24); g.stroke();
  }
  drawFx(g);
  for (const p of S.parts) { g.globalAlpha = Math.min(1, p.t * 3); g.fillStyle = p.c; const z = p.sz || 4; g.fillRect(p.x - z / 2, p.y - z / 2, z, z); }
  g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  for (const f of S.floats) {
    g.globalAlpha = Math.min(1, f.t * 2); g.font = `800 ${f.big ? 26 : 16}px system-ui`;
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(f.txt, f.x, f.y); g.fillStyle = f.c; g.fillText(f.txt, f.x, f.y);
  }
  g.globalAlpha = 1;
  const placing = ui.placing;
  if (mouse.in && placing) {
    if (placing.startsWith('trap:')) {
      const ok = onPath(mouse.x, mouse.y);
      g.globalAlpha = .7; g.fillStyle = ok ? '#fff' : '#f33'; g.beginPath(); g.arc(mouse.x, mouse.y, 12, 0, TAU); g.fill(); g.globalAlpha = 1;
    } else {
      const ok = canPlace(mouse.x, mouse.y), ghost = ghostTower(placing, mouse.x, mouse.y);
      if (ghost.range > 0 && ghost.range < 2000) {
        g.beginPath(); g.arc(mouse.x, mouse.y, ghost.range, 0, TAU);
        g.fillStyle = ok ? 'rgba(255,255,255,.15)' : 'rgba(255,0,0,.2)'; g.fill();
        g.strokeStyle = ok ? 'rgba(255,255,255,.5)' : 'rgba(255,60,60,.6)'; g.stroke();
      }
      if (placing === 'avion') {
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([6, 6]); g.beginPath();
        for (let a = 0; a <= TAU + .01; a += .1) g.lineTo(mouse.x + 150 * Math.sin(a), mouse.y + 80 * Math.sin(2 * a));
        g.stroke(); g.setLineDash([]);
      }
      g.globalAlpha = ok ? .8 : .4; drawTower(g, ghost, mouse.x, mouse.y, tm); g.globalAlpha = 1;
    }
  }
  if (S.banner && (S.banner.t -= 1 / 60) > 0) {
    g.globalAlpha = Math.min(1, S.banner.t * 2); g.font = '900 44px system-ui';
    const bw = g.measureText(S.banner.txt).width; if (bw > W - 60) g.font = `900 ${Math.floor(44 * (W - 60) / bw)}px system-ui`;
    g.lineWidth = 7; g.strokeStyle = '#2a1a00'; g.strokeText(S.banner.txt, W / 2, ui.boss ? 110 : 70); g.fillStyle = '#ffd84a'; g.fillText(S.banner.txt, W / 2, ui.boss ? 110 : 70);
    g.globalAlpha = 1;
  }
  if (S.flash > 0) { g.fillStyle = `rgba(255,0,0,${S.flash * .35})`; g.fillRect(0, 0, W, H); S.flash -= 1 / 60; }
  if (S.flash < 0) { g.fillStyle = `rgba(180,240,255,${-S.flash * .5})`; g.fillRect(0, 0, W, H); S.flash = Math.min(0, S.flash + 1 / 60); }
  if (S.cmdT > 0) { g.strokeStyle = `rgba(255,220,60,${.4 + .2 * Math.sin(tm * 8)})`; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8); }
  if (S.paused && !S.over) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H); }
}
function drawShot(g: CanvasRenderingContext2D, s: Shot) {
  const k = s.spr;
  if (typeof k === 'number') { spr(g, k, s.x, s.y, s.rot + Math.PI / 2, k >= 252 && k <= 253 ? .55 : .5); return; }
  g.save(); g.translate(s.x, s.y); g.rotate(s.rot);
  if (k === 'glue') { g.fillStyle = '#7ad84a'; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill(); g.strokeStyle = '#3d7a1f'; g.lineWidth = 1.5; g.stroke(); }
  else if (k === 'fire') { g.restore(); spr(g, 297, s.x, s.y, s.rot + Math.PI / 2, .35); return; }
  else if (k === 'disc' || k === 'bigdisc') {
    const r = k === 'disc' ? 7 : 22;
    g.fillStyle = s.kind === 'normal' ? '#d8433a' : '#c9d2da'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = '#333'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#333'; g.beginPath(); g.arc(0, 0, r * .3, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.fillRect(r * .4, -1, r * .5, 2);
  } else if (k === 'harpoon' || k === 'bolt') {
    g.strokeStyle = k === 'bolt' ? '#5a3a1a' : '#6b4a2b'; g.lineWidth = k === 'bolt' ? 2.5 : 3;
    g.beginPath(); g.moveTo(k === 'bolt' ? -12 : -18, 0); g.lineTo(6, 0); g.stroke();
    g.fillStyle = '#cfd8e0'; g.beginPath(); g.moveTo(14, 0); g.lineTo(4, -5); g.lineTo(4, 5); g.fill();
    if (k === 'bolt') { g.fillStyle = '#e04a3a'; g.fillRect(-13, -3, 4, 6); }
  } else if (k === 'ice') {
    g.fillStyle = '#c8f2ff'; g.strokeStyle = '#4ab8e0'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(9, 0); g.lineTo(0, -4); g.lineTo(-7, 0); g.lineTo(0, 4); g.closePath(); g.fill(); g.stroke();
  } else {
    g.fillStyle = k === 'blade' ? '#dfe6ee' : '#3b3b42';
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -3); g.lineTo(-5, 3); g.closePath(); g.fill();
    if (k === 'blade') { g.strokeStyle = '#6c7884'; g.lineWidth = 1; g.stroke(); }
  }
  g.restore();
}
function drawFx(g: CanvasRenderingContext2D) {
  for (const f of S.fx) {
    const p = 1 - f.t / f.T;
    g.globalAlpha = Math.max(0, 1 - p);
    if (f.k === 'boom') {
      g.fillStyle = 'rgba(255,170,50,.5)'; g.beginPath(); g.arc(f.x, f.y, f.r * (.5 + .6 * p), 0, TAU); g.fill();
      spr(g, 21, f.x, f.y, f.x, f.r / 26 * (.6 + .7 * p));
      if (p < .5) spr(g, 298, f.x, f.y, 0, f.r / 40);
    } else if (f.k === 'pop') {
      g.fillStyle = '#fff'; g.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16, rr = (i % 2 ? .5 : 1) * (f.r + 4 + p * 6); g.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr); }
      g.fill();
    } else if (f.k === 'ring') {
      g.beginPath(); g.arc(f.x, f.y, f.r * (.4 + .6 * p), 0, TAU);
      if (f.fill) { g.fillStyle = f.fill; g.fill(); }
      g.strokeStyle = f.c; g.lineWidth = 3; g.stroke();
    } else if (f.k === 'line') {
      g.strokeStyle = f.c; g.lineWidth = 2.5; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x2, f.y2); g.stroke();
    } else if (f.k === 'zap') {
      for (const [w, c] of [[5, 'rgba(80,160,255,.6)'], [2, '#eaf6ff']] as const) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath();
        f.pts.forEach((q, i) => {
          if (!i) { g.moveTo(q[0], q[1]); return; }
          const o = f.pts[i - 1];
          g.lineTo((o[0] + q[0]) / 2 + (Math.random() - .5) * 14, (o[1] + q[1]) / 2 + (Math.random() - .5) * 14); g.lineTo(q[0], q[1]);
        });
        g.stroke();
      }
    } else if (f.k === 'beam') {
      g.fillStyle = 'rgba(255,240,150,.7)'; g.fillRect(f.x - 10 * (1 - p), 0, 20 * (1 - p), f.y);
      spr(g, 21, f.x, f.y, 0, 2 + p);
    } else if (f.k === 'shell') {
      g.globalAlpha = 1;
      const x = f.x0 + (f.x1 - f.x0) * p, y = f.y0 + (f.y1 - f.y0) * p;
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y, 6, 3, 0, 0, TAU); g.fill();
      spr(g, 275, x, y - Math.sin(p * Math.PI) * 140, 0, .5 + Math.sin(p * Math.PI) * .4);
    } else if (f.k === 'spark') {
      g.strokeStyle = '#fff6b0'; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + .7; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + Math.cos(a) * 10, f.y + Math.sin(a) * 10); g.stroke(); }
    } else if (f.k === 'splat') { g.fillStyle = '#7ad84a'; g.beginPath(); g.arc(f.x, f.y, 8 + p * 8, 0, TAU); g.fill(); }
  }
  g.globalAlpha = 1;
}

// ---------- Menus ----------
export function showMenu(kind: MenuKind) {
  ui.menu = kind;
  if (active) S.paused = true;
  if (kind === 'main') { music('title'); active = false; ui.active = false; selected = null; ui.placing = null; ui.boss = null; }
}
export function hideMenu() { ui.menu = null; if (active) S.paused = false; }
export const openPause = () => { if (active && !S.over) showMenu('pause'); };

// ---------- Entrées et boucle ----------
function canvasPos(ev: MouseEvent) { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height }; }
function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'INPUT' || !active) return;
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (S.over) return;
    if (ui.menu) hideMenu();
    else if (e.key === 'Escape' && (ui.placing || selected || S.aim)) { ui.placing = null; selected = null; S.aim = null; touch(); }
    else showMenu('pause');
    return;
  }
  if (ui.menu || S.over) return;
  if (e.key === ' ') { e.preventDefault(); if (!S.running) startWave(); else cycleSpeed(); return; }
  const ai = ABKEYS.indexOf(e.code);
  if (ai >= 0) { const g = abilityGroups()[ai]; if (g) useAbilityGroup(g.k); return; }
  if (e.key === ',' || e.key === '?') return buyUpgrade(selected, 0);
  if (e.key === '.' || e.key === ';') return buyUpgrade(selected, 1);
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); return sell(selected); }
  if (e.key === 'Tab' && selected) { e.preventDefault(); cyclePrio(selected); return; }
  const i = HOTKEYS.indexOf(e.code);
  if (i >= 0 && TOWER_KEYS[i]) selectPlace(TOWER_KEYS[i]);
}

let last = performance.now(), uiClock = 0, achClock = 0;
function loop(now: number) {
  const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (active) {
    if (!S.paused && !S.over) for (let i = 0; i < S.speed && !S.over; i++) update(dt);
    draw(now);
    if (S.money !== ui.money || S.lives !== ui.lives) sync();
    if ((uiClock += dt) > .15) { uiClock = 0; ui.tick++; }
    if ((achClock += dt) > 1) { achClock = 0; profile.stats.maxMoney = Math.max(profile.stats.maxMoney, S.money); checkAchievements(); }
  } else {
    const th = MAPS[ui.mapSel].thumb;
    if (th) ctx.drawImage(th, 0, 0);
  }
  requestAnimationFrame(loop);
}

// Branche le moteur sur le canvas ; appelé une fois par App.svelte.
export function attach(canvas: HTMLCanvasElement) {
  cv = canvas; ctx = ctx2d(canvas);
  cv.addEventListener('pointermove', ev => { Object.assign(mouse, canvasPos(ev)); mouse.in = true; });
  cv.addEventListener('pointerleave', () => { mouse.in = false; });
  cv.addEventListener('contextmenu', ev => { ev.preventDefault(); ui.placing = null; selected = null; if (active) S.aim = null; touch(); });
  cv.addEventListener('click', ev => { if (active && !S.over && !ui.menu) { const p = canvasPos(ev); clickBoard(p.x, p.y, ev.shiftKey); } });
  addEventListener('keydown', onKey);
  const boot = () => {
    for (const m of MAPS) m.thumb = buildBg(m);
    showMenu('main');
    requestAnimationFrame(loop);
  };
  if (SHEET.complete && SHEET.naturalWidth) boot();
  else { SHEET.onload = boot; SHEET.onerror = () => { ui.menu = 'loading'; }; }
}
export { AUD };

// ---------- Accès de test (exposé uniquement avec ?debug, voir main.ts) ----------
export const debug = {
  step(dt: number) { if (active && !S.over) update(dt); },
  place(type: string, x: number, y: number) { const t = makeTower(type, x, y); t.spent = 100; S.towers.push(t); return t; },
  ability: (t: Tower) => useAbility(t),
  draw: () => draw(performance.now()),
  select(t: Tower | null) { selected = t; touch(); },
};

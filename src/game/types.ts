// Types partagés du jeu.
export type Kind = 'sharp' | 'explo' | 'cold' | 'normal' | 'magic' | 'glue' | 'fire';
export type Mode = 'proj' | 'burst' | 'ring' | 'pulse' | 'hitscan' | 'chain' | 'plane' | 'support' | 'income'
  | 'factory' | 'mortar' | 'flame' | 'beam' | 'push' | 'drone' | 'bank';
export type ProjSprite = number | 'spike' | 'blade' | 'fire' | 'glue' | 'disc' | 'bigdisc' | 'harpoon' | 'ice' | 'bolt';
export type Pt = [number, number];

export interface BubbleType {
  k: string; n: string; c: string; s: number; r: number; hp: number;
  kids: string[]; immune: Kind[]; blimp: number; rbe: number;
  boss: number; gold: boolean; ghost: boolean; dark: string; light: string;
}

// Valeurs par défaut de toutes les stats de tour : une tour = TDEF + base + améliorations.
export const TDEF = {
  range: 0, rate: 1, dmg: 0, pierce: 1, speed: 500, blast: 0, burst: 0, frags: 0, blimpMul: 1, multi: 1,
  homing: false, twin: false, coax: false, orbit: false, winch: false, freeze: 0, chill: false, deep: false, camo: false,
  glueT: 0, glueF: 1, acid: 0, glueBlimp: false, bRate: 0, bPierce: 0, bArmor: false, bRange: 0, bDmg: 0, decamo: false,
  income: 0, heal: 0, missiles: false, bombs: false, cone: 0, burn: 0, pileBoom: false, smart: false, spread: 0, stun: 0,
  heatMax: 0, push: 0, pushB: false, strip: false, drones: 0, interest: 0, cap: 0, slow: 0, shatter: false, critChance: 0,
  roam: false,
};
export type Stats = typeof TDEF & { kind?: Kind; proj?: ProjSprite; mode: Mode; snd?: string; ab?: string };

export interface Buffs { range: number; rate: number; camo: boolean; pierce: number; dmg: number; armor: boolean }
export interface Spot { x: number; y: number; f: number }
export interface Drone { a: number; x: number; y: number; cd: number }

export interface Tower extends Stats {
  type: string; name: string; id: number; x: number; y: number; up: [number, number];
  spent: number; pops: number; dealt: number; dps: number; dacc: number; prio: number; cd: number; cd2: number; cd3: number;
  ang: number; body: number; abCd: number; boostT: number; boostMul: number; bf: Buffs;
  pa: number; px: number; py: number; hd: number; spin: number;
  spots?: Spot[]; spotsR?: number; tx?: number; ty?: number;
  heat?: number; lastT?: number; beams?: Pt[]; beamT?: number; droneList?: Drone[]; bank?: number;
}
export type Upgrade = [string, number, string, (t: Tower) => void];
export type Terrain = 'herbe' | 'terre' | 'roche' | 'sable' | 'eau';
export interface Zone { k: Terrain; c: [number, number, number][] } // tache de terrain : union de cercles [x, y, r]
export interface TowerDef {
  name: string; cost: number; desc: string; cat: 'tir' | 'zone' | 'soutien'; terrain?: Terrain; // terrain imposé
  base: Partial<Stats> & { mode: Mode }; paths: [Upgrade[], Upgrade[]];
}

export interface Path { pts: Pt[]; seg: number[]; len: number }
export interface Decor { x: number; y: number; s: number; n: number; rot: number; r: number }
export interface MapDef {
  name: string; level: string; ground: number; road: number; edge: string; decor: number[];
  paths: Pt[][]; P: Path[]; zones: Zone[]; decorObjs?: Decor[]; thumb?: HTMLCanvasElement;
}
export interface Diff { name: string; lives: number; money: number; cost: number; waves: number; sell: number; boss: number }
export interface GameMode {
  k: string; name: string; desc: string; ban?: string[]; money?: number; noCash?: boolean; cashMul?: number; noBonus?: boolean;
  noSell?: boolean; maxTier?: number; fastBubbles?: boolean;
}
export interface Group { t: string; c: number; camo?: boolean; rg?: boolean; fort?: boolean }
export interface QueueItem { t: string; time: number; camo?: boolean; rg?: boolean; fort?: boolean; p: number }

export interface Enemy {
  id: number; t: string; hp: number; p: number; d: number; camo: boolean; rg: string | null; rgT: number; alive: boolean;
  frz: number; hard: boolean; chill: boolean; slowT: number; slowF: number;
  glueT: number; glueF: number; acid: number; acidT: number; glueSrc: Tower | null;
  burnT: number; burnC: number; burnSrc: Tower | null; stunT: number; pushed: number; x: number; y: number; a: number;
  fort: boolean; maxHp: number; bossT: number; shield: number; phase: number;
}
export interface Orbit { cx: number; cy: number; r: number; a0: number; dir: number; T: number; loops?: number }
export interface Shot {
  x: number; y: number; vx: number; vy: number; sp: number; life: number; pierce: number; dmg: number; kind?: Kind;
  blast: number; bdmg: number; frags: number; bm: number; src: Tower | null; hits?: Set<number>; spr?: ProjSprite; rot: number;
  homing: boolean; rad: number; glue: Tower | null; tgt: Enemy | null; orb: Orbit | null; ot: number; winch: boolean;
  slow: number; shatter: boolean;
}
export interface ShotOpts {
  x: number; y: number; ang: number; life: number; dmg: number; src: Tower | null; speed?: number; pierce?: number; kind?: Kind;
  blast?: number; bdmg?: number; frags?: number; bm?: number; spr?: ProjSprite; homing?: boolean; rad?: number;
  glue?: Tower | null; tgt?: Enemy | null; orb?: Orbit | null; winch?: boolean; slow?: number; shatter?: boolean;
}
export interface Trap {
  k: 'clous' | 'bombe' | 'colle'; x: number; y: number; left: number; hits: Set<number>; dmg: number; kind: Kind;
  src: Tower | null; boom: boolean; x0: number; y0: number; fly: number; F: number;
}
export type FxKind = 'boom' | 'pop' | 'ring' | 'line' | 'zap' | 'beam' | 'shell' | 'spark' | 'splat';
export interface Fx {
  k: FxKind; x: number; y: number; t: number; T: number; r: number; c: string; fill: string;
  x2: number; y2: number; x0: number; y0: number; x1: number; y1: number; pts: Pt[];
}
export interface Part { x: number; y: number; vx: number; vy: number; t: number; c: string; sz?: number }
export interface Float { x: number; y: number; txt: string; t: number; c: string; big?: boolean }
export interface Timer { at: number; fn: () => void }

export interface Game {
  mi: number; di: number; mode: number; MD: GameMode; m: MapDef; D: Diff;
  money: number; lives: number; wave: number; enemies: Enemy[]; towers: Tower[]; projs: Shot[]; fx: Fx[];
  parts: Part[]; floats: Float[]; traps: Trap[]; timers: Timer[]; queue: QueueItem[];
  wt: number; clock: number; running: boolean; speed: number; auto: boolean; paused: boolean; over: boolean; freeplay: boolean;
  cashF: number; pops: number; flash: number; cmdT: number; autoT: number; banner: { txt: string; t: number } | null;
  bg: HTMLCanvasElement; aim: Tower | null; leaked: number;
  xp0: number; daily: number; // XP au lancement (bilan de fin de partie) ; jour du défi relevé, 0 hors défi
  perks: string[]; pick: string[] | null; tok0: number; // bonus de vague pris ; choix en attente ; jetons au lancement
}
// Bonus cumulés d'une partie : laboratoire (permanent) + bonus de vague.
export interface Bonus { rate: number; range: number; pierce: number; cash: number; cost: number; bonus: number; blimp: number }
export type QuestKey = 'pops' | 'blimps' | 'bosses' | 'abilities' | 'golds' | 'towers' | 'waves' | 'wins';

export interface Stats2 {
  pops: number; blimps: number; bosses: number; hydra: number; towers: number; abilities: number; sold: number; golds: number; waves: number;
  maxMoney: number; apocBest: number; t4types: string[]; mapsWon: number[]; winModes: string[]; winDiffs: number[]; perfect: boolean; combo: number;
}
export interface Profile {
  best: Record<string, number>; medals: Record<string, boolean>; wins: number; xp: number; unlockAll: boolean;
  ach: Record<string, number>; stats: Stats2;
  tuto: boolean; daily: { last: number; streak: number }; // conseils de prise en main terminés ; dernier défi du jour réussi
  tokens: number; lab: Record<string, number>; mast: Record<string, number>; // jetons ; niveaux du laboratoire ; bulles éclatées par type de tour
  quest: { day: number; base: number[]; done: boolean[] }; // missions du jour : valeurs de départ et missions réussies
}
export interface Achievement { id: string; n: string; d: string; icon: string; secret?: boolean; test: (s: Stats2, p: Profile) => boolean }

// Pont réactif entre le moteur (TypeScript pur, 60 i/s) et les composants Svelte.
// Le moteur garde son état en objets simples ; il ne pousse ici que des valeurs primitives
// et des compteurs de révision que les composants lisent pour se rafraîchir.
export type MenuKind = 'loading' | 'main' | 'maps' | 'pause' | 'victory' | 'defeat' | 'options' | 'help' | 'credits' | 'achievements' | 'bestiary';

export const ui = $state({
  menu: 'loading' as MenuKind | null,
  active: false,
  money: 0, lives: 0, maxLives: 0, wave: 0, waves: 0, freeplay: false, running: false, speed: 1, auto: false, bot: false, turbo: false, dps: 0, showDps: true, showStats: true, showLive: false,
  live: { pps: 0, cps: 0, fps: 0, en: 0, towers: 0, dealt: 0, top: [] as { id: number; name: string; dps: number; share: number }[] },
  placing: null as string | null,
  hover: null as string | null,
  sel: 0,    // révision de la tour sélectionnée (sélection, amélioration, cible)
  shop: 0,   // révision de la boutique (rang, mode de jeu)
  tick: 0,   // horloge d'interface (~7 Hz) : recharges des capacités
  waveRev: 0,
  mapSel: 0, diffSel: 1, modeSel: 0,
  boss: null as null | { name: string; hp: number; max: number; shield: boolean },
  hint: '',  // conseil de prise en main affiché sur le terrain (vide : rien)
});

export interface Toast { id: number; title: string; text: string; icon: string }
export const toasts: Toast[] = $state([]);
let tid = 0;
export function toast(title: string, text: string, icon = 'star') {
  const id = ++tid;
  if (toasts.length >= 3) toasts.shift(); // 3 notifications max à l'écran
  toasts.push({ id, title, text, icon });
  setTimeout(() => { const i = toasts.findIndex(x => x.id === id); if (i >= 0) toasts.splice(i, 1); }, 4500);
}

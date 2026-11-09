// Sprites (planche Kenney, tuiles 64 px sur 23 colonnes) et sons.
export const SHEET = new Image();
SHEET.src = 'assets/img/tilesheet.png';

const tileXY = (n: number) => [((n - 1) % 23) * 64, Math.floor((n - 1) / 23) * 64];
export function mkCanvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d')!;

const tileCache: Record<string, HTMLCanvasElement> = {};
// Tuile seule (éventuellement teintée) dans un canvas 64x64, réutilisable par drawImage et createPattern.
export function tile(n: number, tint?: string, a = .5) {
  const key = n + (tint || '');
  if (tileCache[key]) return tileCache[key];
  const c = mkCanvas(64, 64), g = ctx2d(c), [sx, sy] = tileXY(n);
  g.drawImage(SHEET, sx, sy, 64, 64, 0, 0, 64, 64);
  if (tint) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = tint; g.fillRect(0, 0, 64, 64); }
  return tileCache[key] = c;
}
export function spr(g: CanvasRenderingContext2D, n: number, x: number, y: number, ang = 0, s = 1, tint?: string) {
  g.save(); g.translate(x, y); if (ang) g.rotate(ang);
  g.drawImage(tile(n, tint), -32 * s, -32 * s, 64 * s, 64 * s);
  g.restore();
}

// ---------- Audio : petits pools d'éléments <audio> ----------
const SFX_LIST: Record<string, number> = {
  pop1: 6, pop2: 6, pop3: 6, bigpop: 3, shoot: 5, zap: 3, snipe: 3, boom: 4, bigboom: 2, metal: 2, frost: 2, glue: 3,
  rocket: 4, click: 2, upgrade: 2, place: 2, error: 2, wave: 1, ability: 2, coin: 3, leak: 2, win: 1, lose: 1, sell: 2,
};
const MUSIC: Record<string, string> = { title: 'title', level1: 'level1', level2: 'level2', level3: 'level3' };
const saved = (() => { try { return JSON.parse(localStorage.getItem('bd2-audio') || '{}'); } catch { return {}; } })();
export const AUD = { sfx: (saved.sfx ?? .55) as number, mus: (saved.mus ?? .35) as number };
const pools: Record<string, HTMLAudioElement[]> = {}, idx: Record<string, number> = {}, last: Record<string, number> = {};
let musicEl: HTMLAudioElement | null = null, track = '';

for (const [k, n] of Object.entries(SFX_LIST)) {
  pools[k] = Array.from({ length: n }, () => { const a = new Audio('assets/sfx/' + k + '.ogg'); a.preload = 'auto'; return a; });
  idx[k] = 0;
}
export function play(k: string, vol = 1, gap = .05) {
  if (!AUD.sfx || !pools[k]) return;
  const now = performance.now() / 1000;
  if (now - (last[k] || 0) < gap) return;
  last[k] = now;
  const a = pools[k][idx[k]++ % pools[k].length];
  try { a.currentTime = 0; a.volume = Math.min(1, AUD.sfx * vol); a.play().catch(() => {}); } catch { /* audio indisponible */ }
}
export const popSound = () => play('pop' + (1 + Math.floor(Math.random() * 3)), .7, .035);
export function music(t: string) {
  if (track === t && musicEl) { setMusicVolume(AUD.mus); return; }
  musicEl?.pause();
  track = t;
  musicEl = new Audio('assets/music/' + MUSIC[t] + '.ogg'); musicEl.loop = true; musicEl.volume = AUD.mus;
  if (AUD.mus) musicEl.play().catch(() => {}); // bloqué tant que le joueur n'a pas cliqué : relancé au premier clic
}
export function setMusicVolume(v: number) {
  AUD.mus = v;
  if (!musicEl) return;
  musicEl.volume = v;
  if (v && musicEl.paused) musicEl.play().catch(() => {});
}
export function saveAudio() { try { localStorage.setItem('bd2-audio', JSON.stringify(AUD)); } catch { /* stockage indisponible */ } }
addEventListener('pointerdown', () => { if (musicEl && AUD.mus && musicEl.paused) musicEl.play().catch(() => {}); });

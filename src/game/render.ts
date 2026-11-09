// Dessin hors état de partie : sprites pré-rendus des bulles, décor des cartes, tours, icônes.
import { ctx2d, mkCanvas, spr, tile } from './assets';
import { BT, H, MAPS, TAU, TOWERS, W, pathDist } from './data';
import { TDEF, type MapDef, type Tower } from './types';

// ---------- Bulles ----------
const bubCache: Record<string, HTMLCanvasElement> = {};
export function bubbleSprite(t: string, camo: boolean, rg: boolean) {
  const key = t + +camo + +rg;
  if (bubCache[key]) return bubCache[key];
  const B = BT[t], r = B.r, S = Math.ceil(r * 2.8 + 10), c = mkCanvas(S, S), g = ctx2d(c);
  g.translate(S / 2, S / 2 - 2);
  const body = () => { g.beginPath(); g.ellipse(0, 0, r, r * 1.15, 0, 0, TAU); };
  body();
  if (t === 'rainbow') {
    const lg = g.createLinearGradient(-r, -r, r, r);
    ['#ff3b3b', '#ff9a1f', '#ffe23b', '#3bd15a', '#2f8ae6', '#a24ae6'].forEach((col, i) => lg.addColorStop(i / 5, col));
    g.fillStyle = lg;
  } else if (t === 'lead' || t === 'gold') {
    const lg = g.createLinearGradient(-r, -r, r, r);
    if (t === 'lead') { lg.addColorStop(0, '#d5dbe1'); lg.addColorStop(.5, '#8f99a4'); lg.addColorStop(1, '#5c646d'); }
    else { lg.addColorStop(0, '#fff3a0'); lg.addColorStop(.5, '#ffc61a'); lg.addColorStop(1, '#b07800'); }
    g.fillStyle = lg;
  } else g.fillStyle = B.c;
  g.fill();
  if (t === 'zebra' || t === 'ceramic' || t === 'swift' || t === 'purple' || camo) {
    g.save(); body(); g.clip();
    if (t === 'zebra') { g.strokeStyle = '#1e1e24'; g.lineWidth = 3.2; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-r * 1.5, i * 7 - r); g.lineTo(r * 1.5, i * 7 + r * .4); g.stroke(); } }
    if (t === 'ceramic') {
      g.fillStyle = 'rgba(80,40,10,.35)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(Math.sin(i * 7.3) * r, Math.cos(i * 3.1) * r, 1.6, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(255,220,170,.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, r * .62, r * .72, 0, 0, TAU); g.stroke();
    }
    if (t === 'swift') { g.fillStyle = '#ffd34a'; for (const y of [-r * .4, r * .15]) { g.beginPath(); g.moveTo(-r, y); g.lineTo(r * .3, y + 2); g.lineTo(-r, y + 5); g.fill(); } }
    if (t === 'purple') { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * .55, 0, TAU); g.stroke(); }
    if (camo) for (const [ox, oy, rr, col] of [[-.5, .2, .4, '#4e6b25'], [.45, -.3, .35, '#6b5a2a'], [.2, .65, .3, '#2f4a1c'], [-.25, -.7, .3, '#3e5a22'], [.6, .5, .22, '#6b5a2a']] as const) {
      g.fillStyle = col; g.globalAlpha = .8; g.beginPath(); g.arc(ox * r, oy * r, rr * r, 0, TAU); g.fill(); g.globalAlpha = 1;
    }
    g.restore();
  }
  const sh = g.createRadialGradient(-r * .35, -r * .45, 1, 0, 0, r * 1.25);
  sh.addColorStop(0, 'rgba(255,255,255,.55)'); sh.addColorStop(.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
  body(); g.fillStyle = sh; g.fill();
  g.lineWidth = t === 'lead' ? 2.5 : 1.5;
  g.strokeStyle = t === 'lead' ? '#3f464d' : t === 'black' ? '#000' : t === 'gold' ? '#8a5a00' : 'rgba(0,0,0,.45)';
  g.stroke();
  g.beginPath(); g.moveTo(0, r * 1.12); g.lineTo(-3, r * 1.15 + 5); g.lineTo(3, r * 1.15 + 5); g.closePath(); g.fillStyle = t === 'rainbow' ? '#a24ae6' : B.c; g.fill();
  g.beginPath(); g.ellipse(-r * .38, -r * .48, r * .17, r * .3, -.5, 0, TAU); g.fillStyle = 'rgba(255,255,255,.75)'; g.fill();
  if (t === 'lead') { g.fillStyle = '#4a525a'; for (const a of [0, 1.57, 3.14, 4.71]) { g.beginPath(); g.arc(Math.cos(a) * r * .7, Math.sin(a) * r * .8, 1.4, 0, TAU); g.fill(); } }
  if (t === 'gold') { g.fillStyle = '#7a4a00'; g.font = `bold ${r}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 1); }
  if (t === 'ghost') { g.fillStyle = '#334'; for (const x of [-r * .3, r * .3]) { g.beginPath(); g.ellipse(x, -r * .1, 2, 3.2, 0, 0, TAU); g.fill(); } }
  if (rg) {
    g.strokeStyle = '#ff4fd8'; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.ellipse(0, 0, r + 3, r * 1.15 + 3, 0, 0, TAU); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ff4fd8'; g.fillRect(r * .55, -r * 1.2, 6, 2); g.fillRect(r * .55 + 2, -r * 1.2 - 2, 2, 6);
  }
  return bubCache[key] = c;
}

// ---------- Dirigeables et boss (orientés vers la droite) ----------
export function blimpSprite(t: string) {
  const key = 'b' + t;
  if (bubCache[key]) return bubCache[key];
  const B = BT[t], a = B.r * 1.2, b = B.r * .58, c = mkCanvas(Math.ceil(a * 2.9), Math.ceil(b * 3.4)), g = ctx2d(c);
  g.translate(c.width / 2 + a * .1, c.height / 2);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(6, 10, a, b, 0, 0, TAU); g.fill();
  g.fillStyle = B.dark;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-a * .7, 0); g.lineTo(-a * 1.25, s * b * 1.35); g.lineTo(-a * 1.05, 0); g.closePath(); g.fill(); }
  if (B.boss === 1) for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * a * .22 - 6, -b * .9); g.lineTo(i * a * .22, -b * 1.35); g.lineTo(i * a * .22 + 6, -b * .9); g.fill(); g.beginPath(); g.moveTo(i * a * .22 - 6, b * .9); g.lineTo(i * a * .22, b * 1.35); g.lineTo(i * a * .22 + 6, b * .9); g.fill(); }
  if (B.boss === 3) for (const s of [-1, 0, 1]) { g.beginPath(); g.ellipse(a * .95, s * b * .6, b * .42, b * .3, s * .4, 0, TAU); g.fill(); }
  const lg = g.createLinearGradient(0, -b, 0, b); lg.addColorStop(0, B.light); lg.addColorStop(.45, B.c); lg.addColorStop(1, B.dark);
  g.beginPath(); g.ellipse(0, 0, a, b, 0, 0, TAU); g.fillStyle = lg; g.fill();
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2.5; g.stroke();
  g.save(); g.clip(); g.fillStyle = 'rgba(255,255,255,.18)';
  for (const x of [-a * .45, 0, a * .45]) g.fillRect(x - 3, -b, 6, b * 2);
  if (B.blimp >= 2) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-a, -3, a * 2, 6); }
  if (B.boss === 2) { g.strokeStyle = '#eaffff'; g.lineWidth = 3; g.beginPath(); g.moveTo(-a * .6, -b * .6); g.lineTo(-a * .2, 0); g.lineTo(-a * .4, 0); g.lineTo(0, b * .6); g.stroke(); }
  g.restore();
  g.fillStyle = B.dark; g.beginPath(); g.roundRect(-a * .25, -b * .28, a * .5, b * .56, 5); g.fill();
  g.fillStyle = '#ffe9a8'; for (const x of [-a * .15, 0, a * .15]) { g.beginPath(); g.arc(x, 0, 2.2, 0, TAU); g.fill(); }
  if (B.blimp === 3 || B.boss) {
    g.fillStyle = B.boss ? '#ff4040' : '#ffe14a'; g.font = `bold ${b * .9}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(B.boss ? '☠' : '★', a * .62, 0);
  }
  return bubCache[key] = c;
}

// ---------- Décor des cartes ----------
function seeded(s: number) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }
export function buildBg(m: MapDef) {
  const c = mkCanvas(W, H), g = ctx2d(c), rnd = seeded(11 + MAPS.indexOf(m) * 97);
  g.fillStyle = g.createPattern(tile(m.ground), 'repeat')!; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,.045)';
    g.beginPath(); g.arc(rnd() * W, rnd() * H, 10 + rnd() * 40, 0, TAU); g.fill();
  }
  g.lineCap = g.lineJoin = 'round';
  for (const P of m.P) {
    const line = () => { g.beginPath(); P.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
    line(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 62; g.stroke();
    line(); g.strokeStyle = m.edge; g.lineWidth = 56; g.stroke();
    line(); g.strokeStyle = g.createPattern(tile(m.road), 'repeat')!; g.lineWidth = 46; g.stroke();
    line(); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.setLineDash([10, 18]); g.stroke(); g.setLineDash([]);
    const end = P.pts[P.pts.length - 1];
    if (end[0] > 0 && end[0] < W && end[1] > 0 && end[1] < H) {
      g.fillStyle = '#1d140c'; g.beginPath(); g.arc(end[0], end[1], 30, 0, TAU); g.fill();
      g.strokeStyle = m.edge; g.lineWidth = 6; g.stroke();
    }
  }
  if (!m.decorObjs) {
    m.decorObjs = [];
    for (let i = 0; i < 600 && m.decorObjs.length < 22; i++) {
      const x = 30 + rnd() * (W - 60), y = 30 + rnd() * (H - 60), s = .55 + rnd() * .4, n = m.decor[Math.floor(rnd() * m.decor.length)], rot = rnd() * TAU;
      if (pathDist(m, x, y) < 62 || m.decorObjs.some(d => Math.hypot(d.x - x, d.y - y) < 70)) continue;
      m.decorObjs.push({ x, y, s, n, rot, r: 26 * s });
    }
  }
  for (const d of m.decorObjs) {
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(d.x + 5, d.y + 7, 24 * d.s, 18 * d.s, 0, 0, TAU); g.fill();
    spr(g, d.n, d.x, d.y, d.rot, d.s * 1.1);
  }
  return c;
}

// ---------- Tours ----------
interface Look { base?: number; top?: number; tint?: string; spin?: boolean; soldier?: number; fixed?: boolean }
const TV: Record<string, Look> = {
  mitra: { base: 181, top: 204 }, herisson: { base: 182, top: 229, tint: '#8b5fbf', spin: true }, roquette: { base: 181, top: 205 },
  givre: { base: 183, top: 227, tint: '#6fd3f5' }, sniper: { base: 184, soldier: 246 }, glu: { base: 182, top: 250 },
  tesla: { base: 183, top: 228, tint: '#3d9bff' }, avion: { base: 184 }, char: {}, radar: { base: 184, top: 230, tint: '#7fcf5a', fixed: true },
  mine: { base: 183, top: 229, tint: '#e7b53a', fixed: true },
  disque: { base: 182, top: 204, tint: '#e0503a' }, flamme: { base: 182, top: 251 }, usine: { base: 183, top: 228, tint: '#c98a3a', fixed: true },
  mortier: { base: 181, top: 207 }, harpon: { base: 184, top: 204, tint: '#2f5f8f' }, laser: { base: 183, top: 230, tint: '#ff3a7a' },
  vent: { base: 184, top: 229, tint: '#bfe6ff', fixed: true }, ruche: { base: 183, top: 228, tint: '#f2c12e', fixed: true },
  glacon: { base: 182, top: 204, tint: '#8fe3ff' }, arbalete: { base: 184, top: 205, tint: '#8a5a2b' }, coffre: { base: 183, top: 228, tint: '#d9a43a', fixed: true },
};
export function drawTower(g: CanvasRenderingContext2D, t: Tower, x: number, y: number, tm: number, sel = false) {
  const v = TV[t.type], s = .7 + .025 * (t.up[0] + t.up[1]), lvl = Math.max(t.up[0], t.up[1]);
  if (lvl >= 3) {
    g.fillStyle = lvl === 5 ? 'rgba(255,230,80,.55)' : t.up[0] >= 3 ? 'rgba(255,170,40,.35)' : 'rgba(60,200,255,.35)';
    g.beginPath(); g.arc(x, y, (lvl === 5 ? 36 : 30) + Math.sin(tm * 4) * 2, 0, TAU); g.fill();
  }
  if (sel) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 28, 0, TAU); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + 3, y + 6, 22 * s, 16 * s, 0, 0, TAU); g.fill();
  if (t.type === 'char') {
    spr(g, t.twin ? 270 : 269, x, y, t.body, s * 1.05);
    spr(g, t.twin ? 293 : 292, x, y, t.ang, s * 1.05);
  } else {
    if (v.base) spr(g, v.base, x, y, 0, s);
    if (t.type === 'avion') { g.fillStyle = '#fff'; g.font = 'bold 18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', x, y + 1); }
    else if (v.soldier) spr(g, v.soldier, x, y, t.ang, s * 1.35);
    else if (v.spin && v.top) {
      g.save(); g.translate(x, y); g.rotate(tm * (t.mode === 'ring' ? 4 : 1));
      g.fillStyle = t.mode === 'ring' ? '#ff7a1a' : t.proj === 'fire' ? '#e8692a' : '#5b3a85';
      const n = t.burst || 8;
      for (let i = 0; i < n; i++) { g.rotate(TAU / n); g.beginPath(); g.moveTo(14 * s, -3); g.lineTo(26 * s, 0); g.lineTo(14 * s, 3); g.fill(); }
      g.restore();
      spr(g, v.top, x, y, tm, s, v.tint);
    } else if (v.top) {
      let top = v.top;
      if (t.type === 'roquette' && t.homing) top = 206;
      if (t.type === 'mitra' && t.multi > 1) top = 251;
      spr(g, top, x, y, v.fixed ? 0 : t.ang + Math.PI / 2, s, t.type === 'mitra' && t.multi > 1 ? '#7d8790' : v.tint);
    }
    if (t.type === 'tesla') {
      const gl = g.createRadialGradient(x, y, 1, x, y, 13);
      gl.addColorStop(0, '#ffffff'); gl.addColorStop(.4, 'rgba(120,200,255,.9)'); gl.addColorStop(1, 'rgba(60,140,255,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(x, y, 11 + Math.sin(tm * 9) * 2, 0, TAU); g.fill();
    }
    if (t.type === 'radar') {
      g.save(); g.translate(x, y); g.rotate(tm * 2);
      g.strokeStyle = '#e6ffe0'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 11, -.9, .9); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(11, 0); g.stroke(); g.restore();
    }
    if (t.type === 'vent') {
      g.save(); g.translate(x, y); g.rotate(tm * 9); g.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.beginPath(); g.ellipse(7, 0, 8, 3.5, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    if (t.type === 'usine') { g.fillStyle = '#3b3b42'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x - 6 + (i % 3) * 6, y - 3 + (i / 3 | 0) * 6, 2.2, 0, TAU); g.fill(); } }
    if (t.type === 'ruche') { g.fillStyle = '#5a3a00'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x, y - 6 + i * 6, 9 - Math.abs(i - 1) * 2, 2, 0, 0, TAU); g.fill(); } }
    if (t.type === 'coffre') { g.fillStyle = '#4a3000'; g.font = 'bold 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', x, y + 1); }
    if (t.type === 'mine') for (let i = 0; i <= Math.min(5, t.up[0] + t.up[1]); i++) spr(g, 273, x - 14 + i * 6, y + 12 - (i % 2) * 4, 0, .5);
  }
  for (let p = 0; p < 2; p++) for (let i = 0; i < t.up[p]; i++) {
    g.fillStyle = i === 4 ? '#fff27a' : p ? '#3cc8ff' : '#ffaa28'; g.strokeStyle = '#111'; g.lineWidth = 1;
    g.beginPath(); g.rect(x - 30 + i * 6 + p * 31, y + 22, 5, 5); g.fill(); g.stroke();
  }
}
export function drawPlane(g: CanvasRenderingContext2D, t: Tower) {
  const big = t.kind === 'normal';
  g.globalAlpha = .3; spr(g, 294, t.px + 14, t.py + 18, t.hd, .85); g.globalAlpha = 1;
  spr(g, big ? 272 : 271, t.px, t.py, t.hd, big ? 1.05 : .9);
}

// Tour « fantôme » sans état de partie : sert à l'aperçu de placement et aux icônes.
let ghostId = -1;
export function ghostTower(type: string, x = 0, y = 0): Tower {
  return { ...TDEF, ...TOWERS[type].base, type, name: TOWERS[type].name, id: ghostId--, x, y, up: [0, 0], spent: 0, pops: 0, prio: 0,
    cd: .2, cd2: 0, cd3: 0, ang: -Math.PI / 2, body: -Math.PI / 2, abCd: 0, boostT: 0, boostMul: 1,
    bf: { range: 1, rate: 1, camo: false, pierce: 0, dmg: 0, armor: false }, pa: Math.random() * TAU, px: x, py: y, hd: 0, spin: 0 };
}

// ---------- Icônes pour l'interface (canvas haute densité) ----------
export function paintTowerIcon(c: HTMLCanvasElement, type: string) {
  const g = ctx2d(c);
  g.setTransform(c.width / 64, 0, 0, c.height / 64, 0, 0);
  g.clearRect(0, 0, 64, 64);
  if (type === 'avion') { spr(g, 184, 32, 32, 0, .8); spr(g, 271, 32, 30, -Math.PI / 2, .85); }
  else drawTower(g, ghostTower(type, 32, 30), 32, 30, 0);
}
export function paintBubbleIcon(c: HTMLCanvasElement, t: string, camo = false, rg = false) {
  const g = ctx2d(c), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const b = BT[t].blimp ? blimpSprite(t) : bubbleSprite(t, camo, rg);
  const s = BT[t].blimp ? (w - 2) / b.width : Math.min(1, (h - 2) / b.height) * w / 30;
  g.drawImage(b, w / 2 - b.width * s / 2, h / 2 - b.height * s / 2, b.width * s, b.height * s);
}

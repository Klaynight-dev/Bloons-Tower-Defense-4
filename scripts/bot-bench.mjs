// Banc d'essai de l'IA : joue des parties complètes sans navigateur et affiche le taux de victoire.
// Usage : node scripts/bot-bench.mjs [cartes=all] [difficultés=0,1,2,3] [modes=0] [parties=1]
//   ex. node scripts/bot-bench.mjs all 3 0,2,5 2
import { createServer } from 'vite';

// ---------- Navigateur factice : canvas, audio et stockage muets ----------
const noop = () => {};
const ctx = new Proxy(function () {}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 }) : ctx), apply: () => ctx, set: () => true });
const canvas = () => ({ width: 0, height: 0, getContext: () => ctx, addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) });
const mem = new Map();
Object.assign(globalThis, {
  Image: class { complete = true; naturalWidth = 1; },
  Audio: class { play() { return Promise.resolve(); } pause() {} },
  document: { createElement: canvas },
  localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) },
  addEventListener: noop, requestAnimationFrame: noop, location: { reload: noop },
});

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const E = await vite.ssrLoadModule('/src/game/engine.ts');
const D = await vite.ssrLoadModule('/src/game/data.ts');
const { ui } = await vite.ssrLoadModule('/src/game/ui.svelte.ts');
const { diag } = await vite.ssrLoadModule('/src/game/bot.ts');

const list = (s, n) => (!s || s === 'all' ? [...Array(n).keys()] : s.split(',').map(Number));
const [maps, diffs, modes] = [list(process.argv[2], D.MAPS.length), list(process.argv[3] ?? '0,1,2,3', 4), list(process.argv[4] ?? '0', D.MODES.length)];
const runs = +(process.argv[5] ?? 1), VERBOSE = process.argv.includes('-v') || process.argv.includes('-vv'), VERBOSE2 = process.argv.includes('-vv');

E.profile.unlockAll = true; E.profile.ach.konami = 1;
let wins = 0, total = 0;
for (const di of diffs) for (const mo of modes) for (const mi of maps) for (let r = 0; r < runs; r++) {
  const t0 = Date.now();
  E.newGame(mi, di, mo); E.hideMenu();
  if (!ui.bot) E.toggleBot();
  const S = E.game(), target = D.MODES[mo].k === 'apoc' ? 100 : D.DIFFS[di].waves;
  let minLives = S.lives;
  let lastW = 0;
  while (!S.over && S.wave <= target && S.clock < 20000) {
    E.debug.step(1 / 30); minLives = Math.min(minLives, S.lives);
    if (VERBOSE && S.wave !== lastW && (S.wave % 10 === 0 || VERBOSE2)) {
      lastW = S.wave;
      const army = Object.entries(S.towers.reduce((a, t) => ((a[t.type] = (a[t.type] ?? '') + t.up.join('')), a), {})).map(([k, v]) => k + ':' + v.match(/../g).join(',')).join(' ');
      const f = v => v.map(x => x.toFixed(0)).join('/');
      console.log(`   v${S.wave} besoin ${f(diag.need)}  dispo ${f(diag.have)}`);
      console.log(`   v${S.wave} ${((Date.now() - t0) / 1000).toFixed(0)}s  $${S.money} vies ${S.lives}  ${army}`);
    }
  }
  const win = ui.menu === 'victory' || (D.MODES[mo].k === 'apoc' && S.wave > target);
  wins += +win; total++;
  console.log(`${win ? 'GAGNÉ ' : 'PERDU '} ${D.MAPS[mi].name.padEnd(12)} ${D.DIFFS[di].name.padEnd(10)} ${D.MODES[mo].name.padEnd(12)} vague ${String(S.wave).padStart(3)}/${target}  vies ${S.lives} (min ${minLives})  tours ${S.towers.length}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`\n${wins} / ${total} victoires`);
await vite.close();

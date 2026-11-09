// Réglage automatique de l'IA : joue beaucoup de parties (cartes, difficultés, modes variés) et garde
// les réglages (TUNE dans src/game/bot.ts) qui vont le plus loin. Recherche simple : on modifie
// quelques réglages au hasard, on rejoue le même lot de parties (hasard fixé), on garde si c'est mieux.
// Usage : node scripts/bot-tune.mjs [essais=30] [parties=14] [processus=4] [vague max=fin] [difficultés=1,2,3]
//   ex. node scripts/bot-tune.mjs 60 12 6 32 1 : passer le premier boss en Moyen, vite.
// Résultat : scripts/bot-tune.json (meilleurs réglages), à recopier dans TUNE.
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);

if (process.env.BOT_TUNE_WORKER) {
  // ---------- Processus de jeu : navigateur factice, puis une partie par message ----------
  const noop = () => {};
  const canvas = () => ({ width: 0, height: 0, getContext: () => ctx, addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) });
  const mem = new Map();
  Object.assign(globalThis, {
    Image: class { complete = true; naturalWidth = 1; },
    Audio: class { play() { return Promise.resolve(); } pause() {} },
    document: { createElement: canvas },
    localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) },
    addEventListener: noop, requestAnimationFrame: noop, location: { reload: noop },
  });
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  const E = await vite.ssrLoadModule('/src/game/engine.ts');
  const D = await vite.ssrLoadModule('/src/game/data.ts');
  const { ui } = await vite.ssrLoadModule('/src/game/ui.svelte.ts');
  const { TUNE } = await vite.ssrLoadModule('/src/game/bot.ts');
  E.profile.unlockAll = true; E.profile.ach.konami = 1;
  const rnd = Math.random;
  process.on('message', ({ id, g, tune }) => {
    Object.assign(TUNE, tune);
    let s = g.seed >>> 0; // hasard fixé : chaque réglage joue exactement les mêmes parties
    Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    E.newGame(g.mi, g.di, g.mo); E.hideMenu();
    if (!ui.bot) E.toggleBot();
    const S = E.game();
    S.money = g.money ?? D.MODES[g.mo].money ?? 650; // argent de départ normal, quoi que dise la copie locale
    const target = Math.min(D.DIFFS[g.di].waves, g.maxW ?? Infinity), lives0 = S.lives;
    while (!S.over && S.wave <= target && S.clock < 20000) E.debug.step(1 / 30);
    const win = ui.menu === 'victory' || (!S.over && S.wave > target);
    Math.random = rnd;
    // Victoire : 1 + bonus de vies gardées ; défaite : part des vagues tenues.
    process.send({ id, fit: win ? 1 + .2 * S.lives / lives0 : Math.min(1, (S.wave - 1) / target), win });
  });
  process.send({ ready: true, tune: { ...TUNE } });
} else {
  // ---------- Chef d'orchestre ----------
  const [tries, nGames, nProc] = [+(process.argv[2] ?? 30), +(process.argv[3] ?? 14), +(process.argv[4] ?? 4)];
  const maxW = process.argv[5] ? +process.argv[5] : undefined, DI = (process.argv[6] ?? '1,2,3').split(',').map(Number);
  let best; // valeurs de départ : TUNE de bot.ts, envoyé par le premier processus prêt

  // Lot de parties varié : 12 cartes, Moyen à Impossible, plusieurs modes (pas l'Apocalypse, sans fin).
  const MAPS = 12, MODES = [0, 0, 0, 2, 3, 4, 5, 6];
  const games = Array.from({ length: nGames }, (_, i) => ({
    mi: (i * 5) % MAPS, di: DI[i % DI.length], mo: maxW ? 0 : MODES[i % MODES.length], seed: 1000 + i * 7919, maxW,
  }));
  if (!maxW) games.push({ mi: 0, di: 3, mo: 0, seed: 42, money: 1e7 }); // une partie très riche : ne pas remplir la carte

  const workers = await Promise.all(Array.from({ length: nProc }, () => new Promise(res => {
    const w = fork(self, [], { env: { ...process.env, BOT_TUNE_WORKER: '1' }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    w.once('message', m => { best ??= m.tune; res(w); });
  })));
  let nextId = 0;
  const run = (w, g, tune) => new Promise(res => {
    const id = nextId++;
    const on = m => { if (m.id === id) { w.off('message', on); res(m); } };
    w.on('message', on); w.send({ id, g, tune });
  });
  async function evaluate(tune) {
    const queue = games.map((g, i) => [g, i]), out = [];
    await Promise.all(workers.map(async w => {
      for (let job; (job = queue.shift());) out[job[1]] = await run(w, job[0], tune);
    }));
    return { fit: out.reduce((a, r) => a + r.fit, 0), wins: out.filter(r => r.win).length };
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const mutate = t => {
    const c = { ...t }, keys = Object.keys(c);
    const pick = keys.filter(() => Math.random() < .3);
    if (!pick.length) pick.push(keys[Math.floor(Math.random() * keys.length)]);
    for (const k of pick) c[k] = +(c[k] * Math.exp(gauss() * .25)).toPrecision(3);
    return c;
  };

  const t0 = Date.now();
  let bestR = await evaluate(best);
  console.log(`départ : ${bestR.fit.toFixed(2)} / ${games.length * 1.2}  victoires ${bestR.wins}/${games.length}  (${((Date.now() - t0) / 1000).toFixed(0)} s par lot)`);
  for (let i = 1; i <= tries; i++) {
    const cand = mutate(best), r = await evaluate(cand);
    const diff = Object.keys(cand).filter(k => cand[k] !== best[k]).map(k => `${k} ${best[k]}→${cand[k]}`).join(', ');
    const better = r.fit > bestR.fit + 1e-9;
    console.log(`${String(i).padStart(3)} ${better ? 'MIEUX' : '     '} ${r.fit.toFixed(2)}  victoires ${r.wins}  [${diff}]`);
    if (better) { best = cand; bestR = r; writeFileSync(new URL('./bot-tune.json', import.meta.url), JSON.stringify(best, null, 2) + '\n'); }
  }
  console.log(`\nmeilleur : ${bestR.fit.toFixed(2)}  victoires ${bestR.wins}/${games.length}\nTUNE = ${JSON.stringify(best)}`);
  for (const w of workers) w.kill();
}

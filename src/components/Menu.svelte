<script lang="ts">
  import { ABKEYS, ABLABEL, ACHIEVEMENTS, BOSS_TEXT, BOSS_WAVES, BT, CATS, DIFFS, HOTLABEL, KIND, MAPS, MODES, TOWER_KEYS, TOWER_RANK, TOWERS, TRAPS, rankOf, xpFor } from '../game/data';
  import {
    AUD, OPT, bindKey, continueFreeplay, exportProfile, game, hideMenu, importProfile, loadGame, newGame, profile, quitToMenu, resetKeys, resetProfile, restart, saveOpts, saveProfile, savedGame, showMenu, store,
  } from '../game/engine';
  import { play, saveAudio, setMusicVolume } from '../game/assets';
  import { ic } from '../game/icons';
  import { toast, ui } from '../game/ui.svelte';
  import { bubbleIcon, mapThumb, towerIcon } from '../lib/actions';

  const go = (fn: () => void) => () => { play('click'); fn(); };
  // profile et game() sont des objets simples : on les relit à chaque changement d'écran.
  const rk = $derived.by(() => { void ui.menu; return rankOf(profile.xp); });
  const sv = $derived(ui.menu === 'main' ? savedGame() : null);
  const recKey = (m: number, d: number, mode: number) => m + '-' + d + (mode ? '-' + MODES[mode].k : '');
  const IMMUNE: Record<string, string> = { explo: 'explosions', cold: 'gel', sharp: 'pointes', magic: 'énergie', fire: 'feu' };
  let unlockAll = $state(profile.unlockAll);
  let sfx = $state(AUD.sfx), mus = $state(AUD.mus);
  const g = $derived.by(() => { void ui.menu; void ui.active; return game(); });
  const OTABS: [string, string, string, string][] = [
    ['jeu', 'Jeu', 'gears', 'Affichage en partie, performances et confort.'],
    ['son', 'Son', 'volume', 'Volume des effets et de la musique.'],
    ['stats', 'Statistiques', 'star', 'Ta partie en cours et ta progression totale.'],
    ['keys', 'Raccourcis', 'grid', 'Choisis une touche pour chaque tour et chaque capacité.'],
    ['data', 'Données', 'paper', 'Sauvegarde, transfert et remise à zéro.'],
  ];
  const tabOf = (k: string) => OTABS.find(t => t[0] === k)!;
  const HTABS: [string, string, string, string][] = [
    ['base', 'Les bases', 'play', 'Le but du jeu et le déroulement d\'une partie.'],
    ['tours', 'Tours', 'grid', 'Poser, améliorer, cibler et vendre.'],
    ['bulles', 'Bulles', 'sparkles', 'Qui résiste à quoi, et les variantes à surveiller.'],
    ['boss', 'Boss', 'crown', 'Les vagues spéciales et comment les passer.'],
    ['touches', 'Raccourcis', 'card', 'Tes touches actuelles (modifiables dans Options).'],
    ['prog', 'Progression', 'star', 'Rangs, succès, médailles et modes de jeu.'],
  ];
  let htab = $state('base');
  const helpOf = (k: string) => HTABS.find(t => t[0] === k)!;
  // Bulles qui demandent un type de dégât précis (les immunités viennent des données).
  const TOUGH = ['black', 'white', 'purple', 'zebra', 'lead', 'ghost', 'gold', 'ceramic'];
  const SPECIAL: Record<string, string> = { ghost: 'Devient intangible par moments : rien ne la touche.', gold: "Rapporte beaucoup d'argent si tu l'éclates.", ceramic: '10 points de vie avant de céder.' };
  const BOSSES = Object.entries(BOSS_WAVES).map(([w, l]) => ({ w: +w, t: l[0][0], boss: BT[l[0][0]].boss > 0, extra: l.length > 1 ? BT[l[1][0]].n : '' }));
  let otab = $state('jeu');
  let fileEl = $state<HTMLInputElement>();
  let opt = $state({ floats: OPT.floats, parts: OPT.parts, autopause: OPT.autopause, dps: OPT.dps, tstats: OPT.tstats, live: OPT.live });
  const flip = (k: keyof typeof opt) => { opt[k] = OPT[k] = !OPT[k]; saveOpts(); };
  // Raccourcis : les tableaux du moteur sont des objets simples, on les relit à chaque changement (ui.shop).
  const keys = $derived.by(() => { void ui.shop; return { h: [...HOTLABEL], a: [...ABLABEL] }; });
  let listening = $state<{ k: 'h' | 'a'; i: number } | null>(null);
  function cap(e: KeyboardEvent) {
    if (!listening) return;
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { listening = null; return; }
    if (/^(Shift|Control|Alt|Meta)/.test(e.code)) return;
    const err = bindKey(listening.k, listening.i, e);
    if (err) toast('Raccourci refusé', err, 'lock'); else { play('click'); listening = null; }
  }
  const n = (v: number) => Math.round(v).toLocaleString('fr');
  const achDone = $derived.by(() => { void ui.menu; return Object.keys(profile.ach).length; });
</script>

{#snippet sliders()}
  <div class="sliders sheet">
    <label><span>{@html ic('volume')} Effets</span>
      <input type="range" min="0" max="1" step=".05" bind:value={sfx} oninput={() => { AUD.sfx = sfx; saveAudio(); }} onchange={() => play('pop1')} />
      <output>{Math.round(sfx * 100)} %</output>
    </label>
    <label><span>{@html ic('volume-half')} Musique</span>
      <input type="range" min="0" max="1" step=".05" bind:value={mus} oninput={() => { setMusicVolume(mus); saveAudio(); }} />
      <output>{Math.round(mus * 100)} %</output>
    </label>
  </div>
{/snippet}

{#snippet toggle(title: string, desc: string, on: boolean, fn: () => void, extra = '')}
  <button class="row flat" role="switch" aria-checked={on} onclick={go(fn)}>
    <span class="rt"><b>{title}{#if extra}<kbd>{extra}</kbd>{/if}</b><small>{desc}</small></span><i class="sw" class:on></i>
  </button>
{/snippet}

<svelte:window onkeydowncapture={cap} />

<div class="overlay">
  {#if ui.menu === 'loading'}
    <h2>Chargement…</h2>
  {:else if ui.menu === 'main'}
    <div class="brand"><img src="./logo.svg" alt="" /><h1>Bulle Défense</h1></div>
    <p class="stats">
      {@html ic('sparkles')} {profile.stats.pops.toLocaleString('fr')} bulles éclatées · {@html ic('crown')} {profile.wins} victoires ·
      {@html ic('star')} {achDone} / {ACHIEVEMENTS.length} succès
    </p>
    <div class="rank">
      <b>Rang {rk}</b><span class="bar"><i style:width="{Math.min(100, ((profile.xp - xpFor(rk)) / (xpFor(rk + 1) - xpFor(rk))) * 100)}%"></i></span>
      <small>{profile.xp - xpFor(rk)} / {xpFor(rk + 1) - xpFor(rk)} XP</small>
    </div>
    <button class="mbtn big g-green" onclick={go(() => showMenu('maps'))}>{@html ic('play')} Jouer</button>
    {#if sv}
      <button class="mbtn" onclick={go(() => loadGame())}>
        {@html ic('arrow-right')} Continuer — {MAPS[sv.mi].name}, {DIFFS[sv.di].name}{sv.mode ? ', ' + MODES[sv.mode].name : ''}, vague {sv.wave}
      </button>
    {/if}
    <div class="btnrow">
      <button class="mbtn half" onclick={go(() => showMenu('achievements'))}>{@html ic('crown')} Succès</button>
      <button class="mbtn half" onclick={go(() => showMenu('bestiary'))}>{@html ic('ghost')} Bestiaire</button>
    </div>
    <div class="btnrow">
      <button class="mbtn half" onclick={go(() => showMenu('options'))}>{@html ic('gears')} Options</button>
      <button class="mbtn half" onclick={go(() => showMenu('help'))}>{@html ic('info')} Aide</button>
    </div>
    <button class="mbtn" onclick={go(() => showMenu('credits'))}>{@html ic('paper')} Crédits</button>

  {:else if ui.menu === 'maps'}
    <h2>Choisis une carte</h2>
    <div class="maps">
      {#each MAPS as m, i (m.name)}
        <button class="map" class:on={i === ui.mapSel} onclick={go(() => (ui.mapSel = i))}>
          <canvas use:mapThumb={i} width="256" height="160"></canvas>
          <b>{m.name}</b>
          <small>{m.level}{m.P.length > 1 ? ` · ${m.P.length} chemins` : ''}</small>
          <span class="med">{#each DIFFS as d, j (d.name)}<i class={profile.medals[i + '-' + j] ? 'got d' + j : ''} title={d.name}></i>{/each}</span>
        </button>
      {/each}
    </div>
    <div class="diffs">
      {#each DIFFS as d, j (d.name)}
        <button class="diff" class:on={j === ui.diffSel} onclick={go(() => (ui.diffSel = j))}>
          <b>{d.name}</b><small>{d.waves} vagues · {d.lives} vies · prix x{d.cost}</small>
        </button>
      {/each}
    </div>
    <div class="diffs modes">
      {#each MODES as md, j (md.k)}
        {@const rec = profile.best[recKey(ui.mapSel, ui.diffSel, j)]}
        <button class="diff" class:on={j === ui.modeSel} title={md.desc} onclick={go(() => (ui.modeSel = j))}>
          <b>{md.name}</b><small>{rec ? 'Record : ' + rec : '—'}{profile.medals[recKey(ui.mapSel, ui.diffSel, j)] ? ' · gagné' : ''}</small>
        </button>
      {/each}
    </div>
    <p class="sub small">{MODES[ui.modeSel].desc}</p>
    <div class="btnrow">
      <button class="mbtn big g-green" onclick={go(() => { store.del('bd2-save'); newGame(ui.mapSel, ui.diffSel, ui.modeSel); })}>{@html ic('play')} Lancer la partie</button>
      <button class="mbtn" onclick={go(() => showMenu('main'))}>{@html ic('arrow-left')} Retour</button>
    </div>

  {:else if ui.menu === 'pause' && g}
    <h2>Pause</h2>
    <p class="sub">{g.m.name} · {g.D.name} · {g.MD.name} · vague {g.wave}</p>
    <button class="mbtn big g-green" onclick={go(hideMenu)}>{@html ic('play')} Reprendre</button>
    {@render sliders()}
    <div class="btnrow">
      <button class="mbtn half" onclick={go(() => showMenu('options'))}>{@html ic('gears')} Options</button>
      <button class="mbtn half" onclick={go(() => showMenu('help'))}>{@html ic('info')} Aide</button>
    </div>
    <button class="mbtn" onclick={go(restart)}>{@html ic('arrow-left')} Recommencer la carte</button>
    <button class="mbtn" onclick={go(quitToMenu)}>{@html ic('menu')} Menu principal{g.MD.k === 'apoc' ? '' : ' (partie sauvegardée)'}</button>

  {:else if (ui.menu === 'victory' || ui.menu === 'defeat') && g}
    {@const win = ui.menu === 'victory'}
    <h1>{@html win ? ic('crown') + ' Victoire !' : ic('ghost') + ' Défaite'}</h1>
    <p class="sub">
      {g.m.name} · {g.D.name} · {g.MD.name} · vague {g.wave}{win ? ' — médaille obtenue !' : ''}
      {g.MD.k === 'apoc' ? ` (record : ${profile.best[recKey(g.mi, g.di, g.mode)] ?? 0})` : ''}
    </p>
    <p class="stats">{g.pops.toLocaleString('fr')} bulles éclatées · {g.towers.length} tours · {g.leaked} vies perdues</p>
    {#if win}<button class="mbtn big g-green" onclick={go(continueFreeplay)}>{@html ic('sparkles')} Continuer en mode libre</button>{/if}
    <button class={win ? 'mbtn' : 'mbtn big g-green'} onclick={go(restart)}>{@html ic('arrow-left')} Rejouer</button>
    <button class="mbtn" onclick={go(quitToMenu)}>{@html ic('menu')} Menu principal</button>

  {:else if ui.menu === 'options'}
    <h2>Options</h2>
    <div class="opt">
      <nav class="onav" aria-label="Catégories">
        {#each OTABS as [k, l, i] (k)}
          <button class="flat" class:cur={otab === k} aria-current={otab === k} onclick={go(() => { otab = k; listening = null; })}>{@html ic(i)}<span>{l}</span></button>
        {/each}
      </nav>
      <section class="obody">
        <header><b>{tabOf(otab)[1]}</b><small>{tabOf(otab)[3]}</small></header>
        {#if otab === 'jeu'}
          <h3>Statistiques à l'écran</h3>
          <div class="group">
            {@render toggle('Stats en temps réel', 'Panneau sur le terrain : dégâts/s, éclatées/s, argent/s, meilleures tours, images/s', opt.live, () => flip('live'), 'F2')}
            {@render toggle('Dégâts par seconde', 'Total de tes tours, sous les vies', opt.dps, () => flip('dps'))}
            {@render toggle('Statistiques des tours', 'Dégâts/s, bulles éclatées et rendement dans le panneau de tour', opt.tstats, () => flip('tstats'))}
          </div>
          <h3>Effets</h3>
          <div class="group">
            {@render toggle('Textes flottants', 'Gains et vies perdues au-dessus du terrain', opt.floats, () => flip('floats'))}
            {@render toggle('Particules', 'Éclats des bulles et explosions (coupe-les si le jeu rame)', opt.parts, () => flip('parts'))}
          </div>
          <h3>Partie</h3>
          <div class="group">
            {@render toggle('Pause automatique', "Met la partie en pause quand tu quittes l'onglet", opt.autopause, () => flip('autopause'))}
            {@render toggle('Toutes les tours débloquées', 'Ignore les rangs dans la boutique', unlockAll, () => { profile.unlockAll = unlockAll = !unlockAll; saveProfile(); ui.shop++; })}
          </div>
        {:else if otab === 'son'}
          <div class="group">
            <label class="row"><span class="rt"><b>{@html ic('volume')} Effets</b></span>
              <input type="range" min="0" max="1" step=".05" bind:value={sfx} oninput={() => { AUD.sfx = sfx; saveAudio(); }} onchange={() => play('pop1')} />
              <output>{Math.round(sfx * 100)} %</output>
            </label>
            <label class="row"><span class="rt"><b>{@html ic('volume-half')} Musique</b></span>
              <input type="range" min="0" max="1" step=".05" bind:value={mus} oninput={() => { setMusicVolume(mus); saveAudio(); }} />
              <output>{Math.round(mus * 100)} %</output>
            </label>
          </div>
        {:else if otab === 'stats'}
          {#if g}
            <h3>Partie en cours</h3>
            <div class="cards">
              {#each [[n(ui.dps), 'dégâts / s', 'sparkles'], [n(g.pops), 'bulles éclatées', 'star'], [n(g.towers.reduce((a, t) => a + t.dealt, 0)), 'dégâts infligés', 'alert-triangle'],
                [n(g.towers.length), 'tours', 'grid'], [n(g.leaked), 'vies perdues', 'heart']] as [v, l, i] (l)}
                <span>{@html ic(i)}<b>{v}</b><small>{l}</small></span>
              {/each}
            </div>
          {/if}
          <h3>Progression</h3>
          <div class="cards">
            {#each [[n(profile.stats.pops), 'bulles éclatées', 'sparkles'], [n(profile.stats.blimps), 'dirigeables', 'ghost'], [n(profile.stats.bosses), 'boss vaincus', 'crown'],
              [n(profile.stats.hydra), 'hydres', 'butterfly'], [n(profile.stats.towers), 'tours posées', 'grid'], [n(profile.stats.sold), 'tours vendues', 'card'],
              [n(profile.stats.abilities), 'capacités lancées', 'star'], [n(profile.stats.golds), 'bulles dorées', 'piggy-bank'], [n(profile.stats.maxMoney) + ' $', 'argent maximum', 'piggy-bank'],
              [n(profile.wins), 'victoires', 'crown'], ['Rang ' + rk, n(profile.xp) + ' XP', 'star'], [achDone + ' / ' + ACHIEVEMENTS.length, 'succès', 'check']] as [v, l, i] (l)}
              <span>{@html ic(i)}<b>{v}</b><small>{l}</small></span>
            {/each}
          </div>
        {:else if otab === 'keys'}
          <p class="hint">Clique sur une action, puis appuie sur la nouvelle touche. <kbd>Échap</kbd> annule. Si la touche est déjà prise, les deux actions s'échangent.</p>
          <h3>Capacités</h3>
          <div class="keys">
            {#each ABKEYS as _, i (i)}
              {@const w = listening?.k === 'a' && listening.i === i}
              <button class="krow flat" class:wait={w} onclick={go(() => (listening = { k: 'a', i }))}>
                <span>Capacité {i + 1}</span><kbd>{w ? '…' : keys.a[i]}</kbd>
              </button>
            {/each}
          </div>
          <h3>Tours</h3>
          <div class="keys">
            {#each TOWER_KEYS as k, i (k)}
              {@const w = listening?.k === 'h' && listening.i === i}
              <button class="krow flat" class:wait={w} onclick={go(() => (listening = { k: 'h', i }))}>
                <canvas use:towerIcon={k} width="68" height="68"></canvas><span>{TOWERS[k].name}</span><kbd>{w ? '…' : keys.h[i]}</kbd>
              </button>
            {/each}
          </div>
          <h3>Touches fixes</h3>
          <p class="hint"><kbd>Espace</kbd> vague / vitesse · <kbd>,</kbd> <kbd>.</kbd> améliorer · <kbd>Tab</kbd> cible · <kbd>Suppr</kbd> vendre · <kbd>P</kbd> pause · <kbd>F2</kbd> stats en temps réel</p>
          <button class="mbtn" onclick={go(() => { resetKeys(); listening = null; })}>{@html ic('arrow-left')} Touches par défaut</button>
        {:else}
          <div class="group">
            <div class="row"><span class="rt"><b>Exporter</b><small>Télécharge un fichier .bulle avec ta progression</small></span>
              <button class="g-blue small" onclick={go(exportProfile)}>{@html ic('arrow-up')} Exporter</button></div>
            <div class="row"><span class="rt"><b>Importer</b><small>Remplace ta progression par celle d'un fichier</small></span>
              <button class="g-blue small" onclick={go(() => fileEl?.click())}>{@html ic('paper')} Importer</button>
              <input bind:this={fileEl} type="file" accept=".bulle" hidden onchange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = '';
                if (f && confirm('Remplacer ta progression actuelle par celle du fichier ?')) importProfile(f); }} /></div>
            <div class="row"><span class="rt"><b>Effacer la progression</b><small>{g ? 'Disponible depuis le menu principal' : 'Records, succès, médailles et sauvegarde : définitif'}</small></span>
              <button class="g-red small" disabled={!!g} onclick={go(() => { if (confirm('Effacer records, succès, médailles et sauvegarde ?')) { resetProfile(); unlockAll = false; showMenu('main'); } })}>{@html ic('trash')} Effacer</button></div>
          </div>
        {/if}
      </section>
    </div>
    <button class="mbtn" onclick={go(() => { listening = null; showMenu(g ? 'pause' : 'main'); })}>{@html ic('arrow-left')} Retour</button>

  {:else if ui.menu === 'achievements'}
    <h2>Succès ({achDone} / {ACHIEVEMENTS.length})</h2>
    <div class="ach">
      {#each ACHIEVEMENTS as a (a.id)}
        <div class="sheet" class:done={profile.ach[a.id]}>
          <span class="ai">{@html ic(profile.ach[a.id] ? a.icon : 'lock')}</span>
          <span>{#if a.secret && !profile.ach[a.id]}<b>???</b><small>Succès secret</small>{:else}<b>{a.n}</b><small>{a.d}</small>{/if}</span>
        </div>
      {/each}
    </div>
    <button class="mbtn" onclick={go(() => showMenu('main'))}>{@html ic('arrow-left')} Retour</button>

  {:else if ui.menu === 'bestiary'}
    <h2>Bestiaire</h2>
    <div class="enc">
      {#each Object.values(BT) as B (B.k)}
        <div class:bossrow={B.boss}>
          <canvas use:bubbleIcon={{ t: B.k }} width="36" height="36"></canvas>
          <span>
            <b>{B.n}{B.boss ? ' — BOSS' : ''}</b>
            <small>
              {B.hp > 1 ? B.hp + ' PV · ' : ''}{B.rbe} couche{B.rbe > 1 ? 's' : ''} · vitesse {B.s}
              {B.immune.length ? ' · insensible : ' + B.immune.map(x => IMMUNE[x] ?? x).join(', ') : ''}
              {B.gold ? ' · rapporte beaucoup d\'argent' : ''}{B.ghost ? ' · devient intangible par moments' : ''}
              {B.boss ? ' · ' + BOSS_TEXT[B.boss] : ''}
              {B.kids.length ? ' · libère ' + B.kids.length + ' : ' + [...new Set(B.kids)].map(c => BT[c].n.toLowerCase()).join(' + ') : ''}
            </small>
          </span>
        </div>
      {/each}
    </div>
    <p class="sub small">Modificateurs : camouflée (taches vertes), régénérante (contour rose pointillé), fortifiée (anneau d'acier, vie doublée).</p>
    <button class="mbtn" onclick={go(() => showMenu('main'))}>{@html ic('arrow-left')} Retour</button>

  {:else if ui.menu === 'help'}
    <h2>Comment jouer</h2>
    <div class="opt">
      <nav class="onav" aria-label="Chapitres">
        {#each HTABS as [k, l, i] (k)}
          <button class="flat" class:cur={htab === k} aria-current={htab === k} onclick={go(() => (htab = k))}>{@html ic(i)}<span>{l}</span></button>
        {/each}
      </nav>
      <section class="obody help2">
        <header><b>{helpOf(htab)[1]}</b><small>{helpOf(htab)[3]}</small></header>
        {#if htab === 'base'}
          <ol class="steps">
            <li><b>Choisis une carte</b><span>Une difficulté et un mode. Chaque carte a 1 ou 2 chemins.</span></li>
            <li><b>Pose des tours</b><span>Clique une tour dans la boutique, puis sur le terrain, hors du chemin.</span></li>
            <li><b>Lance la vague</b><span>Bouton vert ou <kbd>Espace</kbd>. Pendant la vague, <kbd>Espace</kbd> change la vitesse.</span></li>
            <li><b>Améliore et tiens bon</b><span>Survis à toutes les vagues pour gagner la médaille de la difficulté.</span></li>
          </ol>
          <h3>Vies et argent</h3>
          <div class="group">
            <div class="row"><span class="rt"><b>{@html ic('heart')} Vies</b><small>Une bulle qui s'échappe retire autant de vies que de couches qu'elle contient : une céramique coûte 104 vies.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('piggy-bank')} 1 $ par couche</b><small>Chaque couche éclatée rapporte. Après la vague 50, puis 100, les gains baissent.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('star')} Bonus de fin de vague</b><small>100 $ + le numéro de la vague, sauf dans certains modes.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('clock')} Auto</b><small>Enchaîne les vagues seul. Pratique en fin de partie, risqué avant un boss.</small></span></div>
          </div>
        {:else if htab === 'tours'}
          <h3>Trois familles</h3>
          <div class="cards">
            {#each CATS as [c, l] (c)}
              {@const ex = TOWER_KEYS.filter(k => TOWERS[k].cat === c).slice(0, 3)}
              <span class="fam"><b>{l}</b><small>{c === 'tir' ? 'Visent une bulle à la fois' : c === 'zone' ? 'Touchent tout ce qui est autour' : 'Boostent les tours voisines ou rapportent'}</small>
                <i>{#each ex as k (k)}<canvas use:towerIcon={k} width="68" height="68" title={TOWERS[k].name}></canvas>{/each}</i></span>
            {/each}
          </div>
          <h3>Améliorations</h3>
          <div class="group">
            <div class="row"><span class="rt"><b><i class="pip a"></i><i class="pip b"></i> Deux voies de 5 niveaux</b><small>Une seule voie peut dépasser le niveau 2 : l'autre se bloque. Les touches <kbd>,</kbd> et <kbd>.</kbd> achètent dans chaque voie.</small></span></div>
            <div class="row"><span class="rt"><b><i class="pip s"></i> Super évolution (niveau 5)</b><small>Très puissante, mais une seule par voie et par type de tour sur la carte.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('sparkles')} Capacités</b><small>Beaucoup de niveaux 4 débloquent une capacité, à lancer depuis la barre sous le terrain ({keys.a.slice(0, 3).join(', ')}…).</small></span></div>
          </div>
          <h3>Gérer ses tours</h3>
          <div class="group">
            <div class="row"><span class="rt"><b>{@html ic('filter')} Ciblage</b><small>Premier, Dernier, Fort ou Proche. <kbd>Tab</kbd> pour changer.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('map-pin')} Terrains</b><small>Navire sur l'eau, Plante carnivore sur l'herbe, Ver des sables sur le sable.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('arrow-up')} Poser en série</b><small><kbd>Maj</kbd> + clic garde la tour en main. Clic droit ou <kbd>Échap</kbd> annule.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('card')} Vendre</b><small>Rend de 70 à 80 % de ce que tu as dépensé selon la difficulté. <kbd>Suppr</kbd>.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('piggy-bank')} Cas particuliers</b><small>Le Mortier tire où tu vises (« Viser » puis clic). Le Coffre-fort accumule avec intérêts : « Retirer » pour encaisser.</small></span></div>
          </div>
          <h3>Pièges</h3>
          <div class="group">
            {#each Object.values(TRAPS) as T (T.name)}
              <div class="row"><span class="rt"><b>{@html ic(T.icon)} {T.name}</b><small>{T.desc}</small></span></div>
            {/each}
          </div>
        {:else if htab === 'bulles'}
          <p class="hint">Chaque tour inflige un type de dégât : {Object.values(KIND).join(', ').toLowerCase()}. Certaines bulles y sont insensibles : mélange les types.</p>
          <div class="bubs">
            {#each TOUGH as k (k)}
              {@const B = BT[k]}
              <div class="bub">
                <canvas use:bubbleIcon={{ t: k }} width="36" height="36"></canvas>
                <span><b>{B.n}</b>
                  {#if B.immune.length}<small class="imm">{#each B.immune as x (x)}<em>{KIND[x]}</em>{/each}</small>{/if}
                  {#if SPECIAL[k]}<small>{SPECIAL[k]}</small>{/if}
                </span>
              </div>
            {/each}
          </div>
          <h3>Variantes</h3>
          <div class="bubs">
            <div class="bub"><canvas use:bubbleIcon={{ t: 'green', camo: true }} width="36" height="36"></canvas><span><b>Camouflée</b><small>Dès la vague 20. Invisible sans tour qui voit le camouflage (ou un soutien).</small></span></div>
            <div class="bub"><canvas use:bubbleIcon={{ t: 'pink', rg: true }} width="36" height="36"></canvas><span><b>Régénérante</b><small>Dès la vague 25. Regagne une couche toutes les 3 s si on ne la touche plus.</small></span></div>
            <div class="bub"><canvas use:bubbleIcon={{ t: 'ceramic' }} width="36" height="36"></canvas><span><b>Fortifiée</b><small>Dès la vague 55. Anneau d'acier : vie doublée.</small></span></div>
          </div>
          <p class="hint">Toutes les bulles, couches et vitesses sont dans le <b>Bestiaire</b> du menu principal.</p>
        {:else if htab === 'boss'}
          <div class="bubs">
            {#each BOSSES as x (x.w)}
              <div class="bub" class:bossrow={x.boss}>
                <canvas use:bubbleIcon={{ t: x.t }} width="36" height="36"></canvas>
                <span><b>Vague {x.w} · {BT[x.t].n}{x.extra ? ' + ' + x.extra : ''}</b>
                  <small>{x.boss ? BOSS_TEXT[BT[x.t].boss] : BT[x.t].hp + ' PV, se brise en plus petits dirigeables.'}</small></span>
              </div>
            {/each}
          </div>
          <h3>Conseils</h3>
          <div class="group">
            <div class="row"><span class="rt"><b>{@html ic('sparkles')} Dégâts concentrés</b><small>Harpons, rayons et tours anti-dirigeables font la différence sur les grosses cibles.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('clock')} Garde tes capacités</b><small>Lance-les quand le boss entre à portée, pas avant.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('alert-triangle')} Anticipe les enfants</b><small>Un boss vaincu libère des dirigeables : il faut encore du dégât de zone derrière.</small></span></div>
          </div>
        {:else if htab === 'touches'}
          <h3>Partie</h3>
          <div class="keys">
            {#each [['Espace', 'Vague / vitesse'], ['P', 'Pause'], [',', 'Voie 1'], ['.', 'Voie 2'], ['Tab', 'Ciblage'], ['Suppr', 'Vendre'], ['F2', 'Stats en direct'], ['Maj + clic', 'Poser en série']] as [k, l] (l)}
              <div class="krow"><span>{l}</span><kbd>{k}</kbd></div>
            {/each}
          </div>
          <h3>Capacités</h3>
          <div class="keys">
            {#each keys.a as k, i (i)}<div class="krow"><span>Capacité {i + 1}</span><kbd>{k}</kbd></div>{/each}
          </div>
          <h3>Tours</h3>
          <div class="keys">
            {#each TOWER_KEYS as k, i (k)}
              <div class="krow"><canvas use:towerIcon={k} width="68" height="68"></canvas><span>{TOWERS[k].name}</span><kbd>{keys.h[i] ?? '—'}</kbd></div>
            {/each}
          </div>
        {:else}
          <div class="group">
            <div class="row"><span class="rt"><b>{@html ic('star')} Rangs</b><small>Chaque vague rapporte de l'XP. Monter de rang débloque de nouvelles tours (jusqu'au rang {Math.max(...Object.values(TOWER_RANK))}).</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('crown')} Succès</b><small>{ACHIEVEMENTS.length} succès, dont quelques secrets. Chacun rapporte 100 XP.</small></span></div>
            <div class="row"><span class="rt"><b>{@html ic('check')} Médailles</b><small>Une par carte et par difficulté, en gagnant la partie.</small></span></div>
          </div>
          <h3>Difficultés</h3>
          <div class="cards">
            {#each DIFFS as d (d.name)}<span class="fam"><b>{d.name}</b><small>{d.waves} vagues · {d.lives} vie{d.lives > 1 ? 's' : ''} · prix x{d.cost}</small></span>{/each}
          </div>
          <h3>Modes</h3>
          <div class="group">
            {#each MODES as m (m.k)}<div class="row"><span class="rt"><b>{m.name}</b><small>{m.desc}</small></span></div>{/each}
          </div>
        {/if}
      </section>
    </div>
    <button class="mbtn" onclick={go(() => showMenu(g ? 'pause' : 'main'))}>{@html ic('arrow-left')} Retour</button>

  {:else if ui.menu === 'credits'}
    <div class="kn">
      <p class="kn-tag">Crédits</p>
      <h2>Bulle Défense</h2>
      <p class="kn-by">Jeu original en TypeScript + Svelte, made by <a href="https://klaynight.fr" target="_blank" rel="noopener">Klaynight.fr</a></p>
      <dl>
        <div><dt>Sprites</dt><dd><b><a href="https://opengameart.org/content/tower-defense-300-tilessprites" target="_blank" rel="noopener">Tower Defense (top-down)</a></b><span><a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a> · CC0</span></dd></div>
        <div><dt>Interface</dt><dd><b><a href="https://opengameart.org/content/ui-pack" target="_blank" rel="noopener">UI Pack</a>, <a href="https://opengameart.org/content/ui-pack-rpg-extension" target="_blank" rel="noopener">UI Pack RPG Expansion</a></b><span><a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a> · CC0</span><b><a href="https://opengameart.org/content/ui-pack" target="_blank" rel="noopener">Police Kenney Future</a></b><span><a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a> · CC0</span></dd></div>
        <div><dt>Sons</dt><dd><b><a href="https://opengameart.org/content/sci-fi-sounds" target="_blank" rel="noopener">Sci-fi Sounds</a>, <a href="https://opengameart.org/content/interface-sounds" target="_blank" rel="noopener">Interface Sounds</a></b><span><a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a> · CC0</span><b>Bruits d'éclatement : <a href="https://opengameart.org/content/3-pop-sounds" target="_blank" rel="noopener">3 Pop Sounds</a>, <a href="https://opengameart.org/content/balloon-sounds" target="_blank" rel="noopener">Balloon Sounds</a></b><span><a href="https://opengameart.org" target="_blank" rel="noopener">OpenGameArt.org</a> · CC0</span></dd></div>
        <div><dt>Musique</dt><dd><b><a href="https://opengameart.org/content/5-chiptunes-action" target="_blank" rel="noopener">5 Action Chiptunes</a></b><span>Juhani Junkala · CC0</span></dd></div>
        <div><dt>Icônes</dt><dd><b><a href="https://github.com/PapillonApp/Papicons" target="_blank" rel="noopener">Papicons</a></b><span>Association Papillon · MIT</span></dd></div>
      </dl>
    </div>
    <button class="mbtn" onclick={go(() => showMenu('main'))}>{@html ic('arrow-left')} Retour</button>
  {/if}
</div>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@600&display=swap" rel="stylesheet">
</svelte:head>

<style>
  /* Options : navigation à gauche, contenu en groupes à plat (pas de sprite par ligne) */
  .opt { display: grid; grid-template-columns: 170px 1fr; width: min(760px, 100%); text-align: left; color: var(--ink);
         border: 10px solid; border-image: url('/assets/ui/panel_beigeLight.png') 12 fill / 10px; }
  .flat { border: 0; border-image: none; padding: 0; background: none; }
  .flat:active:not(:disabled) { border-image: none; translate: none; }
  .onav { display: flex; flex-direction: column; gap: 2px; padding: 4px 8px 4px 2px; border-right: 2px solid rgba(122, 95, 64, .2); }
  .onav button { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px; font-size: 14px; color: var(--ink2); text-align: left; }
  .onav button:hover { background: rgba(122, 95, 64, .1); color: var(--ink); }
  .onav button.cur { background: var(--ink); color: #fff3d6; box-shadow: inset 3px 0 0 var(--gold); }
  .obody { display: flex; flex-direction: column; gap: 6px; padding: 2px 4px 4px 14px; height: min(56vh, 470px); overflow-y: auto; scrollbar-width: thin; }
  .obody > * { flex: none; } /* sinon les groupes rétrécissent au lieu de faire défiler */
  .obody header { display: flex; flex-direction: column; padding-bottom: 6px; margin-bottom: 2px; border-bottom: 2px solid rgba(122, 95, 64, .2); }
  .obody header b { font: 400 20px var(--title); }
  .obody header small, .hint { color: var(--ink2); font-size: 12.5px; }
  .hint { margin: 0; line-height: 1.9; }
  h3 { margin: 8px 0 0; font: 400 12px var(--title); color: var(--ink2); letter-spacing: .08em; text-transform: uppercase; }
  .group { display: flex; flex-direction: column; border-radius: 10px; background: rgba(255, 255, 255, .45); box-shadow: inset 0 0 0 1px rgba(122, 95, 64, .22); overflow: hidden; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 12px; text-align: left; color: var(--ink); }
  .row + .row { border-top: 1px solid rgba(122, 95, 64, .16); }
  button.row:hover { background: rgba(255, 255, 255, .5); filter: none; }
  .rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .rt b { display: flex; align-items: center; gap: 6px; font-weight: 600; }
  .rt small { color: var(--ink2); font-size: 12px; }
  .row input[type=range] { flex: 1.4; accent-color: #2fbf71; }
  .row output { width: 46px; text-align: right; font: 400 14px var(--title); }
  .row :global(.small) { font-size: 12px; padding: 2px 10px; white-space: nowrap; }
  .sw { flex: none; position: relative; width: 44px; height: 24px; border-radius: 12px; background: #c9b896; box-shadow: inset 0 1px 3px rgba(0, 0, 0, .25); transition: background .15s; }
  .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .35); transition: transform .15s; }
  .sw.on { background: #2fbf71; } .sw.on::after { transform: translateX(20px); }
  kbd { display: inline-block; font: 700 11.5px/1 system-ui, sans-serif; padding: 4px 7px; border-radius: 6px; background: #fff8e8; border: 1px solid #b99a66; border-bottom-width: 3px; color: var(--ink); min-width: 24px; text-align: center; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
  .cards span { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; padding: 8px 10px; border-radius: 10px;
                background: rgba(255, 255, 255, .45); box-shadow: inset 0 0 0 1px rgba(122, 95, 64, .22); }
  .cards span :global(.ic) { grid-row: span 2; width: 22px; height: 22px; color: var(--money); }
  .cards b { font: 400 18px/1.1 var(--title); }
  .cards small { color: var(--ink2); font-size: 11.5px; }
  .keys { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px; }
  .krow { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 8px; border-radius: 8px; text-align: left; font-size: 13px;
          background: rgba(255, 255, 255, .45); box-shadow: inset 0 0 0 1px rgba(122, 95, 64, .22); }
  .krow:hover { background: rgba(255, 255, 255, .7); }
  .krow span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .krow canvas { width: 24px; height: 24px; flex: none; }
  .krow.wait { box-shadow: inset 0 0 0 2px #e0a800; background: #fff3c4; animation: wait .8s ease-in-out infinite alternate; }
  .krow.wait kbd { background: #ffe680; }
  @keyframes wait { to { background: #ffe68a; } }
  @media (prefers-reduced-motion: reduce) { .krow.wait { animation: none; } .sw, .sw::after { transition: none; } }
  /* Comment jouer */
  .steps { margin: 0; padding: 0; list-style: none; counter-reset: st; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
  .steps li { counter-increment: st; position: relative; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px 10px 46px; border-radius: 10px;
              background: rgba(255, 255, 255, .45); box-shadow: inset 0 0 0 1px rgba(122, 95, 64, .22); }
  .steps li::before { content: counter(st); position: absolute; left: 10px; top: 10px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
                      background: #2fbf71; color: #fff; font: 400 14px var(--title); box-shadow: inset 0 -2px 0 rgba(0, 0, 0, .2); }
  .steps span { color: var(--ink2); font-size: 12px; }
  .cards .fam { display: flex; flex-direction: column; gap: 2px; }
  .fam i { display: flex; gap: 2px; margin-top: 4px; } .fam canvas { width: 30px; height: 30px; }
  .pip { display: inline-block; width: 10px; height: 10px; border-radius: 3px; } .pip.a { background: var(--a); } .pip.b { background: var(--b); } .pip.s { background: #ffd83a; outline: 1px solid #e0b400; }
  .bubs { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; }
  .bub { display: flex; gap: 10px; align-items: center; padding: 7px 10px; border-radius: 10px; background: rgba(255, 255, 255, .45); box-shadow: inset 0 0 0 1px rgba(122, 95, 64, .22); }
  .bub.bossrow { box-shadow: inset 4px 0 0 #c0201a, inset 0 0 0 1px rgba(122, 95, 64, .22); }
  .bub canvas { width: 36px; height: 36px; flex: none; }
  .bub span { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .bub small { color: var(--ink2); font-size: 12px; }
  .imm { display: flex; flex-wrap: wrap; gap: 3px; } .imm em { font-style: normal; font-size: 11px; padding: 0 6px; border-radius: 99px; background: #e8d3c9; color: #8a2a1a; }
  .imm em::before { content: 'insensible : '; } .imm em + em::before { content: none; }
  .help2 .krow { cursor: default; }
  .sliders label span { min-width: 96px; } .sliders input { flex: 1; } .sliders output { width: 44px; text-align: right; font-family: var(--title); }
  @media (max-width: 640px) {
    .opt { grid-template-columns: 1fr; }
    .onav { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 2px solid rgba(122, 95, 64, .2); padding: 0 0 6px; }
    .onav button { flex: none; padding: 6px 9px; }
    .obody { padding: 8px 0 0; height: auto; max-height: 60vh; }
  }
  .brand { display: flex; align-items: center; justify-content: center; gap: clamp(8px, 2vw, 18px); }
  .brand img { height: clamp(52px, 9vw, 104px); filter: drop-shadow(0 8px 14px rgba(0, 0, 0, .5)); }
  @media (max-width: 480px) { .brand { flex-direction: column; gap: 4px; } }
  /* Crédits : charte de klaynight.fr (Fraunces + IBM Plex, crème et violet) */
  .kn { --kbg: #f6f4ef; --kborder: #e4e0d6; --kink: #17151d; --kmuted: #615e6a; --kaccent: #8a55ae; --ksoft: #efe7f4;
        width: min(600px, 100%); padding: 28px 28px 24px; text-align: left; background: var(--kbg); color: var(--kink);
        border: 1px solid var(--kborder); border-radius: 1.5rem; box-shadow: 0 20px 50px rgba(0, 0, 0, .35);
        font: 15px/1.6 'IBM Plex Sans', system-ui, sans-serif; }
  .kn h2 { margin: 0; font: 600 clamp(28px, 5vw, 40px)/1.1 'Fraunces', Georgia, serif; color: var(--kink); text-shadow: none; letter-spacing: -.025em; }
  .kn-tag { display: inline-block; margin: 0 0 10px; padding: 3px 10px; border-radius: 99px; background: var(--ksoft); color: var(--kaccent);
            font: 600 12px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: .05em; }
  .kn-by { margin: 6px 0 18px; color: var(--kmuted); }
  .kn a { color: var(--kaccent); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .kn a:hover, .kn a:focus-visible { text-decoration-thickness: 2px; }
  .kn dl { margin: 0; }
  .kn dl > div { display: grid; grid-template-columns: 96px 1fr; gap: 16px; padding: 12px 0; border-top: 1px solid var(--kborder); }
  .kn dt { font-size: 13px; line-height: 22px; color: var(--kmuted); }
  .kn dd { margin: 0; display: flex; flex-direction: column; }
  .kn dd b { font-weight: 600; font-size: 15px; line-height: 22px; }
  .kn dd span { font-size: 13px; line-height: 20px; color: var(--kmuted); }
  .kn dd span:not(:last-child) { margin-bottom: 6px; }
  /* Liens de la liste : couleur du texte, soulignement discret qui passe au violet au survol */
  .kn dd a { color: inherit; font-weight: inherit; text-decoration-color: #b3adbd; text-decoration-thickness: 1.5px; }
  .kn dd a:hover, .kn dd a:focus-visible { color: var(--kaccent); text-decoration-color: currentColor; }
  @media (max-width: 480px) { .kn { padding: 22px 18px; } .kn dl > div { grid-template-columns: 1fr; gap: 2px; } }
</style>

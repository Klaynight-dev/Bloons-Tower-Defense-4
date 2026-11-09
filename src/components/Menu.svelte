<script lang="ts">
  import { ACHIEVEMENTS, BOSS_TEXT, BT, DIFFS, MAPS, MODES, TOWER_KEYS, rankOf, xpFor } from '../game/data';
  import {
    AUD, continueFreeplay, exportProfile, game, hideMenu, importProfile, loadGame, newGame, profile, quitToMenu, resetProfile, restart, saveProfile, savedGame, showMenu, store,
  } from '../game/engine';
  import { play, saveAudio, setMusicVolume } from '../game/assets';
  import { ic } from '../game/icons';
  import { ui } from '../game/ui.svelte';
  import { bubbleIcon, mapThumb } from '../lib/actions';

  const go = (fn: () => void) => () => { play('click'); fn(); };
  // profile et game() sont des objets simples : on les relit à chaque changement d'écran.
  const rk = $derived.by(() => { void ui.menu; return rankOf(profile.xp); });
  const sv = $derived(ui.menu === 'main' ? savedGame() : null);
  const recKey = (m: number, d: number, mode: number) => m + '-' + d + (mode ? '-' + MODES[mode].k : '');
  const IMMUNE: Record<string, string> = { explo: 'explosions', cold: 'gel', sharp: 'pointes', magic: 'énergie', fire: 'feu' };
  let unlockAll = $state(profile.unlockAll);
  let sfx = $state(AUD.sfx), mus = $state(AUD.mus);
  const g = $derived.by(() => { void ui.menu; void ui.active; return game(); });
  const achDone = $derived.by(() => { void ui.menu; return Object.keys(profile.ach).length; });
</script>

{#snippet sliders()}
  <div class="sliders sheet">
    <label>{@html ic('volume')} Effets
      <input type="range" min="0" max="1" step=".05" bind:value={sfx} oninput={() => { AUD.sfx = sfx; saveAudio(); }} onchange={() => play('pop1')} />
    </label>
    <label>{@html ic('volume-half')} Musique
      <input type="range" min="0" max="1" step=".05" bind:value={mus} oninput={() => { setMusicVolume(mus); saveAudio(); }} />
    </label>
  </div>
{/snippet}

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
    <button class="mbtn" onclick={go(() => showMenu('help'))}>{@html ic('info')} Aide</button>
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
    {@render sliders()}
    <button class="mbtn" onclick={go(() => { profile.unlockAll = unlockAll = !unlockAll; saveProfile(); ui.shop++; })}>
      {@html ic(unlockAll ? 'unlock' : 'lock')} Toutes les tours débloquées : {unlockAll ? 'oui' : 'non'}
    </button>
    <div class="btnrow">
      <button class="mbtn half" onclick={go(exportProfile)}>{@html ic('arrow-up')} Exporter</button>
      <label class="mbtn half">{@html ic('paper')} Importer
        <input type="file" accept=".bulle" hidden onchange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = '';
          if (f && confirm('Remplacer ta progression actuelle par celle du fichier ?')) importProfile(f); }} />
      </label>
    </div>
    <button class="mbtn" onclick={go(() => { if (confirm('Effacer records, succès, médailles et sauvegarde ?')) { resetProfile(); unlockAll = false; showMenu('main'); } })}>
      {@html ic('trash')} Effacer la progression
    </button>
    <button class="mbtn" onclick={go(() => showMenu('main'))}>{@html ic('arrow-left')} Retour</button>

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
    <div class="help sheet">
      <p>Les bulles suivent le chemin : chaque bulle qui s'échappe retire autant de vies que de couches qu'elle contient. Chaque couche éclatée rapporte 1 $.</p>
      <p><b>Tours</b> — 2 voies de 4 niveaux. Une seule voie peut dépasser le niveau 2. Les niveaux 4 donnent souvent une capacité, à lancer depuis la barre sous le terrain. Le Mortier tire où tu vises (« Viser » puis clic). Le Coffre-fort accumule de l'argent avec intérêts : « Retirer » pour l'encaisser.</p>
      <p><b>Boss</b> — Vagues 25, 50, 75 et 100 : Colosse, Tempête et Hydre, chacun avec sa mécanique. Les harpons et les tours anti-dirigeables sont tes meilleurs alliés.</p>
      <p><b>Rangs et succès</b> — Chaque vague rapporte de l'XP ; monter de rang débloque des tours. Les succès rapportent 100 XP chacun.</p>
      <p><b>Raccourcis</b> — 1-9, 0, ), U I O G H J K L B N V : acheter une tour · Maj+clic : en poser plusieurs · , et . : améliorer · Tab : cible · Suppr : vendre · Espace : lancer / accélérer · A Z E R T Y : capacités · P ou Échap : pause · clic droit : annuler.</p>
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

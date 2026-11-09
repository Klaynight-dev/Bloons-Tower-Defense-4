<script lang="ts">
  import { ui } from '../game/ui.svelte';
  // Valeurs rafraîchies une fois par seconde de jeu par le moteur (ui.live).
  const f = (n: number) => n >= 100 ? Math.round(n).toLocaleString('fr') : n.toFixed(1).replace('.', ',');
  const L = $derived(ui.live);
</script>

<div class="live" aria-label="Statistiques en temps réel">
  <div class="big"><b>{ui.dps.toLocaleString('fr')}</b><small>dégâts / s</small></div>
  <dl>
    <div><dt>Éclatées / s</dt><dd>{f(L.pps)}</dd></div>
    <div><dt>Argent / s</dt><dd>{f(L.cps)} $</dd></div>
    <div><dt>Bulles en jeu</dt><dd>{L.en}</dd></div>
    <div><dt>Dégâts totaux</dt><dd>{Math.round(L.dealt).toLocaleString('fr')}</dd></div>
    <div><dt>Images / s</dt><dd class:warn={L.fps > 0 && L.fps < 45}>{L.fps || '—'}</dd></div>
  </dl>
  {#if L.top.length}
    <p class="tt">Meilleures tours</p>
    <ol>
      {#each L.top as t (t.id)}
        <li><span>{t.name}</span><em>{f(t.dps)}</em><i style:width="{Math.round(t.share * 100)}%"></i></li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .live { position: absolute; top: 8px; left: 8px; width: 178px; padding: 8px 10px 9px; pointer-events: none; z-index: 2;
          background: rgba(20, 14, 6, .72); border: 1px solid rgba(255, 216, 74, .25); border-radius: 10px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, .35); color: #f3e6cf; font-size: 11.5px; line-height: 1.3; backdrop-filter: blur(3px); }
  .big { display: flex; align-items: baseline; gap: 6px; padding-bottom: 5px; margin-bottom: 4px; border-bottom: 1px solid rgba(255, 255, 255, .12); }
  .big b { font: 400 22px var(--title); color: var(--gold); font-variant-numeric: tabular-nums; }
  .big small { color: #d9c7a5; }
  dl { margin: 0; display: flex; flex-direction: column; gap: 1px; }
  dl div { display: flex; justify-content: space-between; gap: 8px; }
  dt { color: #bfae8e; }
  dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
  dd.warn { color: #ff8a7a; }
  .tt { margin: 6px 0 2px; font: 400 10px var(--title); letter-spacing: .08em; text-transform: uppercase; color: #bfae8e; }
  ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; }
  li { position: relative; display: flex; justify-content: space-between; gap: 6px; padding: 1px 5px; border-radius: 4px; overflow: hidden; }
  li span { position: relative; z-index: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li em { position: relative; z-index: 1; font-style: normal; font-weight: 700; font-variant-numeric: tabular-nums; }
  li i { position: absolute; inset: 0 auto 0 0; background: rgba(47, 191, 113, .35); transition: width .4s; }
  @media (max-width: 900px) { .live { width: 150px; font-size: 10.5px; padding: 6px 8px; } .tt, ol { display: none; } }
</style>

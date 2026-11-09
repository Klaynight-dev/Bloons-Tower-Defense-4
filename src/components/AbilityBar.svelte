<script lang="ts">
  import { ABIL, ABLABEL } from '../game/data';
  import { abilityGroups, useAbilityGroup } from '../game/engine';
  import { ui } from '../game/ui.svelte';
  import { towerIcon } from '../lib/actions';

  // Une capacité par type (et non par tour) : le bouton déclenche la première tour prête.
  const groups = $derived.by(() => { void ui.tick; void ui.sel; return abilityGroups(); });
</script>

<div class="abil">
  {#each groups as g, i (g.k)}
    <button class="ab" class:ready={g.ready} onclick={() => useAbilityGroup(g.k)} title="{ABIL[g.k].n}{i < ABLABEL.length ? ` (touche ${ABLABEL[i]})` : ''}">
      <canvas use:towerIcon={g.type} width="56" height="56"></canvas>
      {#if groups.length <= 5}<span class="name">{ABIL[g.k].n}</span>{/if}
      {#if g.towers.length > 1}<span class="count">×{g.towers.length}</span>{/if}
      {#if i < ABLABEL.length}<span class="key">{ABLABEL[i]}</span>{/if}
      <i class="cd" style:width="{g.frac * 100}%"></i>
    </button>
  {:else}
    <span class="abil-empty">Les capacités des tours de niveau 4 apparaîtront ici.</span>
  {/each}
</div>

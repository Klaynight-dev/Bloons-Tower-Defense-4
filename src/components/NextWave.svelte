<script lang="ts">
  import { BT, isBossWave, waveGroups } from '../game/data';
  import { ui } from '../game/ui.svelte';
  import { bubbleIcon } from '../lib/actions';

  const n = $derived(ui.wave + 1);
  const groups = $derived.by(() => { void ui.waveRev; return waveGroups(n); });
</script>

<div class="next sheet" class:boss={isBossWave(n)}>
  <div class="lbl">Prochaine vague ({n}){isBossWave(n) ? ' — BOSS' : ''}</div>
  <div class="grp">
    {#each groups as g, i (i)}
      <span class="g" title="{BT[g.t].n}{g.camo ? ' camouflée' : ''}{g.rg ? ' régénérante' : ''}{g.fort ? ' fortifiée' : ''}">
        <canvas use:bubbleIcon={{ t: g.t, camo: g.camo, rg: g.rg }} width="30" height="30"></canvas>×{g.c}
      </span>
    {/each}
  </div>
</div>

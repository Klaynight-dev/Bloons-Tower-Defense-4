<script lang="ts">
  import { ui } from '../game/ui.svelte';
  import { ic } from '../game/icons';
</script>

<div class="hud">
  <div class="m">{@html ic('piggy-bank')}<b>{ui.money}</b></div>
  <div class="l">{@html ic('heart')}<b>{ui.lives}</b></div>
  {#if ui.dps && ui.showDps}<div class="d" title="Dégâts par seconde de toutes tes tours">{ui.dps} dgt/s</div>{/if}
  <div class="w">{@html ic('star')}Vague {ui.wave}{ui.freeplay ? '' : ' / ' + ui.waves}</div>
</div>

<script lang="ts">
  import { cycleSpeed, openPause, startWave, toggleAuto } from '../game/engine';
  import { ic } from '../game/icons';
  import { ui } from '../game/ui.svelte';
</script>

<div class="ctrl">
  <button class="g-green start" disabled={ui.running} onclick={startWave}>
    {#if ui.running}{@html ic('clock')} Vague en cours{:else}{@html ic('play')} Vague {ui.wave + 1}{/if}
  </button>
  <button class="g-blue small" title="Vitesse (Espace pendant une vague)" onclick={cycleSpeed}>{@html ic('arrow-right')} x{ui.speed}</button>
  <button class={ui.auto ? 'g-yellow small' : 'g-blue small'} title="Enchaîner les vagues automatiquement" onclick={toggleAuto}>{@html ic('clock')} Auto</button>
  <button class="g-blue small" title="Pause (P ou Échap)" onclick={openPause}>{@html ic('pause')} Pause</button>
</div>

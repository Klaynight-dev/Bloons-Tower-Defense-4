<script lang="ts">
  import { ic } from '../game/icons';
  import { toasts } from '../game/ui.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast sheet">
      <span class="ti">{@html ic(t.icon)}</span>
      <span><b>{t.title}</b><small>{t.text}</small></span>
    </div>
  {/each}
</div>

<script lang="ts">
  import { ui } from '../game/ui.svelte';
</script>

{#if ui.boss}
  <div class="bossbar" class:shield={ui.boss.shield}>
    <b>{ui.boss.name}</b>
    <span class="bar"><i style:width="{(ui.boss.hp / ui.boss.max) * 100}%"></i></span>
    <small>{Math.ceil(ui.boss.hp)} / {ui.boss.max}{ui.boss.shield ? ' · bouclier' : ''}</small>
  </div>
{/if}

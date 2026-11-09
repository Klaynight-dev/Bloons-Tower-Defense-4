<script lang="ts">
  import { onMount } from 'svelte';
  import { attach } from './game/engine';
  import { W, H } from './game/data';
  import { ui } from './game/ui.svelte';
  import Hud from './components/Hud.svelte';
  import Shop from './components/Shop.svelte';
  import Info from './components/Info.svelte';
  import TowerPanel from './components/TowerPanel.svelte';
  import NextWave from './components/NextWave.svelte';
  import Controls from './components/Controls.svelte';
  import AbilityBar from './components/AbilityBar.svelte';
  import BossBar from './components/BossBar.svelte';
  import Menu from './components/Menu.svelte';
  import Toasts from './components/Toasts.svelte';
  import LiveStats from './components/LiveStats.svelte';

  let canvas: HTMLCanvasElement;
  let view: HTMLDivElement;
  let size = $state({ w: W, h: H });

  onMount(() => {
    attach(canvas);
    // Le terrain occupe toute la place disponible en gardant son rapport 16/10 (cadre de 10 px de chaque côté).
    const fit = () => {
      const s = Math.max(.2, Math.min((view.clientWidth - 20) / W, (view.clientHeight - 20) / H));
      size = { w: Math.floor(W * s), h: Math.floor(H * s) };
    };
    const ro = new ResizeObserver(fit);
    ro.observe(view);
    return () => ro.disconnect();
  });
</script>

<div class="app">
  <main class="stage">
    <div class="view" bind:this={view}>
      <div class="board" style:width="{size.w}px" style:height="{size.h}px">
        <canvas bind:this={canvas} width={W} height={H}></canvas>
        {#if ui.boss && !ui.menu}<BossBar />{/if}
        {#if ui.active && ui.showLive && !ui.menu}<LiveStats />{/if}
        {#if ui.active && ui.hint && !ui.menu}<p class="tip" role="status">{ui.hint}</p>{/if}
        {#if ui.menu}<Menu />{/if}
      </div>
    </div>
    {#if ui.active}
      <div class="bottombar"><Controls /><AbilityBar /></div>
    {/if}
  </main>
  <aside class="side">
    {#if ui.active}
      <Hud />
      <Shop />
      <Info />
      <TowerPanel />
      <NextWave />
    {:else}
      <div class="side-idle sheet">Choisis une carte pour commencer.</div>
    {/if}
  </aside>
  <Toasts />
</div>

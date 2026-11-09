<script lang="ts">
  import { CATS, HOTLABEL, TOWER_KEYS, TOWER_RANK, TOWERS, TRAPS } from '../game/data';
  import { priceOf, selectPlace, towerBanned, towerOk } from '../game/engine';
  import { ic } from '../game/icons';
  import { ui } from '../game/ui.svelte';
  import { towerIcon } from '../lib/actions';

  let cat = $state<'all' | 'tir' | 'zone' | 'soutien'>('all');
  const items = $derived.by(() => {
    void ui.shop;
    return TOWER_KEYS.map((k, i) => ({ k, i, T: TOWERS[k], ok: towerOk(k), banned: towerBanned(k), price: priceOf(TOWERS[k].cost) }))
      .filter(x => cat === 'all' || x.T.cat === cat);
  });
  const tabs: ['all' | 'tir' | 'zone' | 'soutien', string][] = [['all', 'Toutes'], ...CATS];
</script>

<div class="tabs">
  {#each tabs as [k, label] (k)}
    <button class:on={cat === k} onclick={() => (cat = k)}>{label}</button>
  {/each}
</div>
<div class="shop">
  {#each items as it (it.k)}
    <button
      class="tbtn"
      class:locked={!it.ok}
      class:poor={it.ok && ui.money < it.price}
      class:on={ui.placing === it.k}
      title={it.ok ? `${it.T.name} (touche ${HOTLABEL[it.i] ?? '—'})` : it.banned ? `${it.T.name} : interdite dans ce mode` : `${it.T.name} : débloquée au rang ${TOWER_RANK[it.k]}`}
      aria-label={it.ok ? `${it.T.name}, ${it.price} $` : it.banned ? `${it.T.name}, interdite dans ce mode` : `${it.T.name}, débloquée au rang ${TOWER_RANK[it.k]}`}
      aria-pressed={ui.placing === it.k}
      onclick={() => selectPlace(it.k)}
      onmouseenter={() => (ui.hover = it.k)}
      onmouseleave={() => (ui.hover = null)}
    >
      <canvas use:towerIcon={it.k} width="68" height="68"></canvas>
      {#if it.ok}
        <span class="pr">{it.price} $</span>
        {#if HOTLABEL[it.i]}<span class="hk">{HOTLABEL[it.i]}</span>{/if}
      {:else}
        <span class="pr">{it.banned ? 'Interdite' : 'Rang ' + TOWER_RANK[it.k]}</span>
      {/if}
    </button>
  {/each}
</div>
<div class="traps">
  {#each Object.entries(TRAPS) as [k, T] (k)}
    <button
      class="trbtn"
      class:poor={ui.money < priceOf(T.cost)}
      class:on={ui.placing === 'trap:' + k}
      title={T.name}
      onclick={() => selectPlace('trap:' + k)}
      onmouseenter={() => (ui.hover = 'trap:' + k)}
      onmouseleave={() => (ui.hover = null)}
    ><span>{@html ic(T.icon)} {T.short}</span><b>{priceOf(T.cost)} $</b></button>
  {/each}
</div>

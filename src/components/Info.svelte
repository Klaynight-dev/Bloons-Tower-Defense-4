<script lang="ts">
  import { KIND, TOWERS, TRAPS } from '../game/data';
  import { priceOf } from '../game/engine';
  import { ui } from '../game/ui.svelte';

  const info = $derived.by(() => {
    const k = ui.hover ?? ui.placing; // au doigt, pas de survol : on décrit la tour en cours de pose
    if (!k) return null;
    if (k.startsWith('trap:')) { const T = TRAPS[k.slice(5)]; return { name: T.name, cost: priceOf(T.cost), desc: T.desc, stats: '' }; }
    const T = TOWERS[k], b = T.base;
    const stats = b.mode === 'income' || b.mode === 'bank' ? '' : b.mode === 'support' ? `Portée de soutien ${b.range}`
      : `${(b.range ?? 0) > 2000 ? 'Portée ∞' : b.range ? 'Portée ' + b.range : 'Patrouille'} · ${(1 / (b.rate ?? 1)).toFixed(1)} tir/s · ${b.dmg ?? 0} dégât${b.kind ? ' · ' + KIND[b.kind] : ''}`;
    return { name: T.name, cost: priceOf(T.cost), desc: T.desc, stats };
  });
</script>

{#if info}
  <div class="info sheet">
    <b>{info.name}</b> — {info.cost} $
    <p>{info.desc}</p>
    {#if info.stats}<small>{info.stats}</small>{/if}
  </div>
{/if}

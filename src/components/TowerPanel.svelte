<script lang="ts">
  import { KIND, TOWERS } from '../game/data';
  import {
    PRIO, aimMortar, buyUpgrade, cyclePrio, eCamo, eDmg, eKind, ePierce, eRange, eRate, game, priceOf, sel, sell, sellValue, upState, withdraw,
  } from '../game/engine';
  import { ic } from '../game/icons';
  import { ui } from '../game/ui.svelte';

  // Vue recalculée à chaque révision (sélection, amélioration, argent) : la tour elle-même est un objet non réactif.
  const v = $derived.by(() => {
    void ui.sel; void ui.money;
    const t = sel(), g = game();
    if (!t || !g) return null;
    const stats = t.mode === 'income' ? `Rapporte ${t.income} $ par vague${t.heal ? ` et ${t.heal} vies` : ''}`
      : t.mode === 'bank' ? `Coffre : ${Math.floor(t.bank ?? 0)} / ${t.cap} $ · +${t.income} $ par vague · intérêts ${Math.round(t.interest * 100)} %`
      : t.mode === 'support' ? `Soutien à ${t.range} px : camouflage${t.bRate ? ', cadence' : ''}${t.bPierce ? ', perforation' : ''}${t.bArmor ? ', blindage' : ''}${t.bRange ? ', portée' : ''}${t.bDmg ? ', dégâts' : ''}`
      : `${eRange(t) > 2000 ? 'Portée ∞' : t.mode === 'plane' ? 'Patrouille' : 'Portée ' + Math.round(eRange(t))} · ${(1 / eRate(t)).toFixed(1)} tir/s · ${eDmg(t) || '—'} dégât · perfo ${ePierce(t)}`
        + `${eKind(t) ? ' · ' + KIND[eKind(t)!] : ''}${eCamo(t) ? ' · voit le camouflage' : ''}${t.critChance ? ` · critique ${Math.round(t.critChance * 100)} %` : ''}`;
    const ups = [0, 1].map(p => {
      const state = upState(t, p), u = TOWERS[t.type].paths[p][t.up[p]];
      return { p, state, level: t.up[p], name: u?.[0] ?? '', desc: u?.[2] ?? '', cost: u ? priceOf(u[1]) : 0 };
    });
    const prio = !['income', 'support', 'plane', 'pulse', 'ring', 'factory', 'mortar', 'push', 'bank'].includes(t.mode) || (t.mode === 'plane' && t.missiles);
    return { t, stats, ups, prio, sell: g.MD.noSell ? null : sellValue(t) };
  });
</script>

{#if v}
  <div class="panel sheet">
    <div class="ph"><b>{v.t.name}</b><small>{v.t.pops} éclatées</small></div>
    <div class="st">{v.stats}</div>
    <div class="ups">
      {#each v.ups as u (u.p)}
        <button class="up p{u.p}" disabled={!!u.state || ui.money < u.cost} onclick={() => buyUpgrade(v.t, u.p)} title="Touche {u.p ? '.' : ','}">
          <span class="pips">{#each [0, 1, 2, 3] as i (i)}<i class:f={i < u.level}></i>{/each}</span>
          {#if u.state === 'max'}{@html ic('check')} <b>Voie complète</b>
          {:else if u.state === 'lock'}{@html ic('lock')} <b>Voie bloquée</b><small>L'autre voie dépasse le niveau 2</small>
          {:else if u.state === 'mode'}{@html ic('lock')} <b>Limite du mode</b><small>Niveau 3 maximum</small>
          {:else}<b>{u.name}</b><small>{u.desc}</small><span class="c">{u.cost} $</span>{/if}
        </button>
      {/each}
    </div>
    <div class="row">
      {#if v.t.mode === 'mortar'}<button onclick={() => aimMortar(v.t)}>{@html ic('map-pin')} Viser</button>{/if}
      {#if v.t.mode === 'bank'}<button disabled={!v.t.bank} onclick={() => withdraw(v.t)}>{@html ic('piggy-bank')} Retirer</button>{/if}
      {#if v.prio}<button onclick={() => cyclePrio(v.t)}>{@html ic('filter')} {PRIO[v.t.prio]}</button>{/if}
      {#if v.sell !== null}<button class="g-red" onclick={() => sell(v.t)}>{@html ic('card')} Vendre {v.sell} $</button>{/if}
    </div>
  </div>
{/if}

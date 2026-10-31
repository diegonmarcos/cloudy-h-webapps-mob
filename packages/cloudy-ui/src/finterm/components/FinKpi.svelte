<script lang="ts">
  // 2.8 KPI tiles: 2 per row (3 >= 480px), 72px, raised fill, label + sparkline, value + signed change, as-of.
  import Spark from './Spark.svelte';
  import { dirOf, tone, DASH } from '../fin';
  export type Kpi = { label: string; value: string; chg: string; unit: string; asOf: string; spark: number[] | null; flash?: string; lower?: boolean };
  let { tiles, onOpen }: { tiles: Kpi[]; onOpen: (i: number) => void } = $props();
</script>
<div class="kpis" data-testid="finterm-quotes">
  {#each tiles as t, i (t.label)}
    <button type="button" class="kpi {t.flash ?? ''}" data-testid="fin-kpi" onclick={() => onOpen(i)}>
      <span class="l1"><span class="lbl">{t.label}</span>{#if t.spark}<Spark values={t.spark} w={40} h={16} />{/if}</span>
      <span class="l2"><span class="v num">{t.value}</span>{#if t.chg && t.chg !== DASH}<span class="c num {tone(dirOf(t.chg), !!t.lower)}">{t.chg}{t.unit ? ` ${t.unit}` : ''}</span>{/if}</span>
      <span class="cap">{t.asOf}</span>
    </button>
  {/each}
</div>
<style>
  .kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  @media (min-width: 480px) { .kpis { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 900px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
  .kpi { all: unset; box-sizing: border-box; cursor: pointer; height: 72px; padding: 8px 10px; border-radius: 8px; background: var(--fin-raised); display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
  .kpi:focus-visible { outline: 2px solid var(--fin-accent); }
  .l1, .l2 { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .l2 { align-items: baseline; }
  .v { font: 600 20px/24px var(--fin-sans); font-variant-numeric: tabular-nums; color: var(--fin-text); }
  .c { font-size: 13px; }
</style>

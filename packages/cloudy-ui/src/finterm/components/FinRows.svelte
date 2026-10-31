<script lang="ts">
  // 2.2 market-monitor rows: SYMBOL | sparkline | last | chg | chg% (fixed widths; chg drops under 360px). Tap = quote detail; star = watchlist.
  import Spark from './Spark.svelte';
  import { dirOf, tone, DASH } from '../fin';
  export type Row = { sym: string; name: string; last: string; chg: string; pct: string; spark: number[] | null; flash?: string; lower?: boolean };
  let { rows, watched, onOpen, onStar }: { rows: Row[]; watched: Set<string>; onOpen: (i: number) => void; onStar: (sym: string) => void } = $props();
</script>
<div class="rows" data-testid="finterm-quotes" role="list">
  {#each rows as r, i (r.sym + i)}
    <div class="row {r.flash ?? ''}" role="listitem" data-testid="fin-row">
      <button type="button" class="hit" onclick={() => onOpen(i)} aria-label="Open {r.name || r.sym}">
        <span class="s"><span class="sym">{r.sym}</span>{#if r.name && r.name !== r.sym}<span class="cap nm">{r.name}</span>{/if}</span>
        <span class="sp">{#if r.spark}<Spark values={r.spark} />{/if}</span>
        <span class="num last">{r.last}</span>
        <span class="num chg {tone(dirOf(r.chg), !!r.lower)}">{r.chg || DASH}</span>
        <span class="num pct {tone(dirOf(r.pct), !!r.lower)}">{r.pct && r.pct !== DASH ? `${r.pct}%` : DASH}</span>
      </button>
      <button type="button" class="star" class:on={watched.has(r.sym)} onclick={() => onStar(r.sym)} aria-label={watched.has(r.sym) ? `Remove ${r.sym} from watchlist` : `Add ${r.sym} to watchlist`} title="Watchlist">{watched.has(r.sym) ? '★' : '☆'}</button>
    </div>
  {/each}
</div>
<style>
  .rows { display: flex; flex-direction: column; margin: 0 -12px; }
  .row { display: flex; align-items: center; border-top: 1px solid var(--fin-hairline); }
  .row:first-child { border-top: 0; }
  .hit { all: unset; box-sizing: border-box; cursor: pointer; flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(88px, 1fr) 56px 84px 64px 68px; align-items: center; gap: 8px; min-height: 40px; padding: 2px 0 2px 12px; }
  .hit:hover { background: var(--fin-raised); }
  .hit:focus-visible { outline: 2px solid var(--fin-accent); outline-offset: -2px; }
  .s { display: flex; flex-direction: column; min-width: 0; }
  .s .sym, .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm { color: var(--fin-text2); }
  .last { text-align: right; font-weight: 600; font-size: 13px; }
  .chg, .pct { text-align: right; font-size: 13px; }
  .star { all: unset; cursor: pointer; width: 32px; text-align: center; color: var(--fin-text3); font-size: 15px; }
  .star.on { color: var(--fin-accent); }
  @media (max-width: 360px) { .hit { grid-template-columns: minmax(80px, 1fr) 56px 80px 64px; } .chg { display: none; } }
</style>

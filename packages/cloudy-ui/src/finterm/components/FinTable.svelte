<script lang="ts">
  // 2.3 data table: sticky raised header, sortable (numeric desc first, text asc, third tap = source order), zebra, numbers right in mono,
  // signed change columns coloured, first column pinned when scrolling sideways, 8 rows then "Show all".
  import { dirOf, parseNum, sortRows, DASH } from '../fin';
  let { columns, rows, links = [], details = [], limit = 8, beat }: { columns: string[]; rows: string[][]; links?: string[]; details?: string[]; limit?: number; beat?: (r: string[], j: number) => string } = $props();
  // the scroll hint: a fade and a chevron at the right edge while more columns lie to the right
  let wrap = $state<HTMLDivElement>();
  let more = $state(false);
  const measure = () => { if (wrap) more = wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 2; };
  $effect(() => { void rows; void columns; measure(); });
  let open = $state(-1);
  let col = $state(-1);
  let dir = $state<'asc' | 'desc' | 'none'>('none');
  let all = $state(false);
  // the first column is the row's label (a tenor like 1M parses as a number but is text: left-aligned), as in the APK's FinLogic.colTypes
  const isNum = (j: number) => j > 0 && rows.length > 0 && rows.every((r) => parseNum(r[j]) !== null || r[j] === DASH || r[j] === '' || r[j] === '-') && !/date|period|as of|time/i.test(columns[j] ?? '');
  const isChg = (j: number) => /chg|change|bp|1d|1w|1m|diff|surprise|%\s*$/i.test(columns[j] ?? '') && !/rate %|yield %|level/i.test(columns[j] ?? '') && rows.some((r) => /^[+-]/.test(r[j] ?? ''));
  const isDate = (j: number) => /date|period|as of/i.test(columns[j] ?? '');
  function sortBy(j: number) {
    if (col !== j) { col = j; dir = isNum(j) ? 'desc' : 'asc'; return; }
    dir = dir === 'none' ? (isNum(j) ? 'desc' : 'asc') : dir === (isNum(j) ? 'desc' : 'asc') ? (isNum(j) ? 'asc' : 'desc') : 'none';
  }
  const order = $derived(rows.map((r, i) => ({ r, i })));
  const sorted = $derived(dir === 'none' || col < 0 ? order : sortRows(order.map((o) => [...o.r, String(o.i)]), col, dir).map((r) => ({ r: r.slice(0, -1), i: Number(r[r.length - 1]) })));
</script>
<div class="outer"><div class="scroll" data-testid="finterm-table-wrap" bind:this={wrap} onscroll={measure}>
  <table data-testid="finterm-table">
    <thead><tr>{#each columns as c, j}<th class:n={isNum(j) || isChg(j) || isDate(j)} aria-sort={col === j && dir !== 'none' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onclick={() => sortBy(j)}>{c}{#if col === j && dir !== 'none'}<span class="sg">{dir === 'asc' ? '▲' : '▼'}</span>{/if}</button></th>{/each}</tr></thead>
    <tbody>
      {#each sorted as { r, i }, k (i)}
        <tr class:hide={!all && k >= limit}>
          {#each r as cell, j}
            {@const b = beat?.(r, j) ?? ''}
            <td class:n={isNum(j) || isChg(j)} class:num={isNum(j) || isChg(j)} class:d={isDate(j)} class="{isChg(j) ? dirOf(cell) : ''} {b}">{#if j === 0 && links[i]}<a href={links[i]} target="_blank" rel="noopener noreferrer">{cell}</a>{:else if j === 0 && details[i]}<button type="button" class="nm" title={details[i]} data-testid="finterm-row-name" onclick={() => (open = open === i ? -1 : i)}>{cell}</button>{:else}{cell === '-' ? DASH : cell}{/if}</td>
          {/each}
        </tr>
        {#if open === i}<tr class="det" data-testid="finterm-row-detail"><td colspan={columns.length}><b>{details[i]}</b>{#each columns.slice(1) as c, j}<span>{c} {r[j + 1]}</span>{/each}</td></tr>{/if}
      {/each}
    </tbody>
  </table>
</div>{#if more}<div class="fade" data-testid="finterm-table-fade" aria-hidden="true">›</div>{/if}</div>
<svelte:window onresize={measure} />
{#if rows.length > limit}<button type="button" class="more" onclick={() => (all = !all)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>{/if}
<style>
  .outer { position: relative; }
  .scroll { overflow-x: auto; margin: 0 -12px; }
  .fade { position: absolute; top: 0; bottom: 0; right: -12px; width: 32px; pointer-events: none; text-align: right; padding: 6px 4px 0 0; box-sizing: border-box;
    color: var(--fin-accent); font: 500 18px/20px var(--fin-sans); background: linear-gradient(to right, transparent, var(--fin-surface)); }
  .nm { all: unset; cursor: pointer; }
  .det td { white-space: normal; font-size: 11px; color: var(--fin-text2); position: static; max-width: none; }
  .det b { display: block; color: var(--fin-text); font-weight: 500; }
  .det span { margin-right: 10px; display: inline-block; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; font: 400 12.5px/16px var(--fin-sans); }
  th { position: sticky; top: 0; background: var(--fin-raised); text-align: left; padding: 0; border-bottom: 1px solid var(--fin-hairline); white-space: nowrap; }
  th button { all: unset; cursor: pointer; display: block; width: 100%; box-sizing: border-box; padding: 8px; font: 500 11px/16px var(--fin-sans); letter-spacing: .4px; text-transform: uppercase; color: var(--fin-text2); }
  th.n button { text-align: right; }
  .sg { color: var(--fin-accent); margin-left: 4px; font-size: 9px; }
  td { padding: 9px 6px; white-space: nowrap; }
  td:first-child, th:first-child { position: sticky; left: 0; padding-left: 12px; max-width: 40vw; overflow: hidden; text-overflow: ellipsis; }
  td:first-child { background: var(--fin-surface); color: var(--fin-text); }
  th:first-child { z-index: 1; }
  tbody tr:nth-child(even of :not(.hide)) td { background: color-mix(in srgb, var(--fin-raised) 50%, var(--fin-surface)); }
  td:last-child, th:last-child { padding-right: 12px; }
  td.n { text-align: right; }
  td.d { color: var(--fin-text2); font-size: 11px; text-align: right; }
  .hide { display: none; }
  td a { color: var(--fin-accent); text-decoration: none; }
  .more { all: unset; cursor: pointer; display: block; min-height: 32px; line-height: 32px; color: var(--fin-accent); font: 500 12px/32px var(--fin-sans); }
</style>

<script lang="ts">
  // #1462 the EM Bonds CALCULATOR matrix as the owner's image: the header row and every row on ONE phone screen, no scrolling, 20px rows. Columns are fractions of
  // the width (matrixWidths) and the numerals the ramp's small mono shrunk to the widest cell (matrixFont), as the APK's FinMatrix. heat tints a cell red .. green;
  // bold marks (row, column) cells, row -1 the header.
  import { matrixFont, matrixWidths } from '../fin';
  let { columns, rows, heat = [], bold = [] }: { columns: string[]; rows: string[][]; heat?: (number | null)[][]; bold?: [number, number][] } = $props();
  let w = $state(312);
  const ws = $derived(matrixWidths(w, columns.length));
  const longest = $derived(Math.max(1, ...rows.map((r) => Math.max(0, ...r.slice(2).map((c) => c.length))), ...columns.slice(2).map((c) => c.length)));
  const font = $derived(matrixFont(ws[2] ?? ws[ws.length - 1] ?? w, longest));
  const tint = (r: number, j: number) => { const h = r < 0 ? null : heat[r]?.[j]; return h == null ? '' : `background:color-mix(in srgb, ${h >= 0 ? 'var(--fin-up)' : 'var(--fin-down)'} ${Math.round(Math.abs(h) * 55)}%, var(--fin-raised))`; };
  const isBold = (r: number, j: number) => bold.some((b) => b[0] === r && b[1] === j);
  const all = $derived([columns, ...rows]);
</script>
<div class="m" data-testid="finterm-matrix" bind:clientWidth={w} style:font-size="{font}px" style:grid-template-columns={ws.map((x) => `${x}px`).join(' ')}>
  {#each all as line, k}
    {#each columns as _, j}
      {@const r = k - 1}
      <span class="c" class:l={j < 2} class:bd={isBold(r, j)} style={tint(r, j)}>{line[j] ?? ''}</span>
    {/each}
  {/each}
</div>
<style>
  .m { display: grid; grid-auto-rows: 20px; font-family: var(--fin-mono, ui-monospace, monospace); font-variant-numeric: tabular-nums lining-nums; line-height: 20px; }
  .c { text-align: right; color: var(--fin-text); white-space: nowrap; overflow: hidden; }
  .c.l { text-align: left; color: var(--fin-text2); }
  .c.bd { font-weight: 700; color: var(--fin-text); }
</style>

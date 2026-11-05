<script lang="ts">
  // #1462 the dense matrix as the owner's image: the header row and every row on ONE phone screen, no scrolling, 20px rows. Columns are fractions of the width (matrixWidths;
  // the first `labels.length` are left-aligned label columns) and the numerals the ramp's small mono shrunk to the widest body cell (matrixFont), the header and each label
  // column to their own widest text, as the APK's FinMatrix. A header cell may hold a line break (the header row is then that many 20px lines). heat tints a cell red .. green;
  // bold marks (row, column) cells, row -1 the header; rowHref (#1478) makes every body row a link (PM Vol: a portfolio row opens its page).
  import { matrixFont, matrixWidths, MATRIX_LABELS } from '../fin';
  let { columns, rows, heat = [], bold = [], labels = MATRIX_LABELS, rowHref = undefined }: { columns: string[]; rows: string[][]; heat?: (number | null)[][]; bold?: [number, number][]; labels?: number[]; rowHref?: (r: number) => string | null } = $props();
  let w = $state(312);
  const nl = $derived(labels.length);
  const ws = $derived(matrixWidths(w, columns.length, labels));
  const cellW = $derived(ws[nl] ?? ws[ws.length - 1] ?? w);
  const body = $derived(matrixFont(cellW, Math.max(1, ...rows.map((r) => Math.max(0, ...r.slice(nl).map((c) => c.length))))));
  const head = $derived(matrixFont(cellW, Math.max(1, ...columns.slice(nl).map((c) => Math.max(...c.split('\n').map((l) => l.length))))));
  const lines = $derived(Math.max(1, ...columns.map((c) => c.split('\n').length)));
  const fit = (r: number, j: number) => (r < 0 ? head : j < nl ? Math.min(body, matrixFont(ws[j], Math.max(1, ...rows.map((x) => (x[j] ?? '').length)))) : body);
  const tint = (r: number, j: number) => { const h = r < 0 ? null : heat[r]?.[j]; return h == null ? '' : `background:color-mix(in srgb, ${h >= 0 ? 'var(--fin-up)' : 'var(--fin-down)'} ${Math.round(Math.abs(h) * 55)}%, var(--fin-raised))`; };
  const isBold = (r: number, j: number) => bold.some((b) => b[0] === r && b[1] === j);
  const text = (c: string | undefined) => (c == null || c.trim() === '' || c.trim() === '-' || c.trim() === '—' || c.trim() === 'n/a' ? '—' : c);
</script>
<div class="m" data-testid="finterm-matrix" bind:clientWidth={w} style:grid-template-columns={ws.map((x) => `${x}px`).join(' ')} style:grid-template-rows="{20 * lines}px">
  {#each columns as c, j}<span class="c hd" class:l={j < nl} style:font-size="{fit(-1, j)}px">{c}</span>{/each}
  {#each rows as line, r}
    {#if rowHref}<a class="r" href={rowHref(r) ?? undefined} data-testid="finterm-matrix-row">
      {#each columns as _, j}<span class="c" class:l={j < nl} class:bd={isBold(r, j)} style={tint(r, j)} style:font-size="{fit(r, j)}px">{text(line[j])}</span>{/each}
    </a>{:else}
      {#each columns as _, j}<span class="c" class:l={j < nl} class:bd={isBold(r, j)} style={tint(r, j)} style:font-size="{fit(r, j)}px">{text(line[j])}</span>{/each}
    {/if}
  {/each}
</div>
<style>
  .m { display: grid; grid-auto-rows: 20px; font-family: var(--fin-mono, ui-monospace, monospace); font-variant-numeric: tabular-nums lining-nums; line-height: 20px; }
  .r { display: contents; color: inherit; text-decoration: none; cursor: pointer; }
  .c { text-align: right; color: var(--fin-text); white-space: pre; overflow: hidden; }
  .c.hd { align-self: center; line-height: 20px; }
  .c.l { text-align: left; color: var(--fin-text2); }
  .c.bd { font-weight: 700; color: var(--fin-text); }
</style>

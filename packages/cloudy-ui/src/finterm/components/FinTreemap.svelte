<script lang="ts">
  // #1612 Performance-breakdown treemap: each holding is a rectangle whose SIZE = its % weight in the index and whose
  // COLOUR = its performance on the app's diverging up/down scale (green up / red down, neutral at flat), with the
  // ticker and % change labelled. Reusable: feed it any {ticker, name, weight, pct} list. Style follows the market-heatmap.
  import { heat, parseNum, signedFmt } from '../fin';
  import { squarify } from '../treemap';
  export type Holding = { ticker: string; name?: string; weight: number; pct: number };
  let { holdings, title = '', onOpen }: { holdings: Holding[]; title?: string; onOpen?: (h: Holding) => void } = $props();

  let box = $state(0); // measured width (px)
  const H_RATIO = 0.6;
  const height = $derived(Math.max(180, Math.min(420, Math.round((box || 320) * H_RATIO))));
  const tiles = $derived(squarify(holdings.map((h) => ({ value: h.weight, datum: h })), box || 320, height));

  // diverging performance fill: share of the up/down token mixed into the neutral raised surface, clamped at +-scale
  const fill = (pct: number) => { const hv = heat(pct, 2.5); const c = hv >= 0 ? 'var(--fin-up)' : 'var(--fin-down)'; return `color-mix(in srgb, ${c} ${Math.round(Math.abs(hv) * 62)}%, var(--fin-raised))`; };
  const show = (t: { w: number; h: number }) => t.w >= 40 && t.h >= 26; // label only tiles with room
</script>

<figure class="tm" bind:clientWidth={box} data-testid="fin-treemap">
  {#if title}<figcaption class="cap">{title}</figcaption>{/if}
  <div class="plot" style:height={`${height}px`}>
    {#each tiles as t (t.datum.ticker)}
      {@const h = t.datum}
      {@const up = parseNum(String(h.pct))}
      <button
        type="button"
        class="cell"
        style:left={`${t.x}px`} style:top={`${t.y}px`} style:width={`${t.w}px`} style:height={`${t.h}px`}
        style:background={fill(h.pct)}
        title={`${h.name ?? h.ticker} · ${h.weight}% weight · ${signedFmt(h.pct, 2)}%`}
        aria-label={`${h.name ?? h.ticker}, weight ${h.weight}%, change ${signedFmt(h.pct, 2)}%`}
        onclick={() => onOpen?.(h)}
      >
        {#if show(t)}
          <span class="tk">{h.ticker}</span>
          <span class="pc" class:u={(up ?? 0) > 0} class:d={(up ?? 0) < 0}>{signedFmt(h.pct, 2)}%</span>
        {/if}
      </button>
    {/each}
  </div>
  <figcaption class="lg cap">Size = index weight · colour = performance (<span class="sw u"></span> up <span class="sw d"></span> down). Declared sample values.</figcaption>
</figure>

<style>
  .tm { margin: 0; }
  .plot { position: relative; width: 100%; border-radius: 6px; overflow: hidden; background: var(--fin-raised); }
  .cell { all: unset; box-sizing: border-box; position: absolute; cursor: pointer; border: 1.5px solid var(--fin-bg, #0b0e14); border-radius: 3px; padding: 3px 5px; color: var(--fin-text); display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .cell:focus-visible { outline: 2px solid var(--fin-accent, #6ea8fe); outline-offset: -2px; }
  .tk { font-size: 11px; font-weight: 600; line-height: 1.1; white-space: nowrap; }
  .pc { font-size: 10px; opacity: .9; }
  .pc.u { color: var(--fin-up); } .pc.d { color: var(--fin-down); }
  .cap { font-size: 11px; opacity: .7; }
  .lg { margin-top: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; vertical-align: middle; }
  .sw.u { background: var(--fin-up); } .sw.d { background: var(--fin-down); }
</style>

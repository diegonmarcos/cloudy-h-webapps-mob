<script lang="ts">
  // Cloud Calc (ac_cloud-calc CalcShell / TabContent): the page's modes (ui.modes whose tab is the page) as a dense icon row
  // (16dp icon over the short label, primary tint on surfaceVariant when selected), then the mode's screen. Expression
  // modes draw the declared keypad (CalcPad: 56dp round keys, role colours) over the expression field and run on the web
  // engine; a plot mode draws its declared default; other kinds run on the phone and say so.
  import { Icon, EmptyState } from '@cloudy/ui';
  import { calc, type Angle } from './engine';
  import type { Mode } from './server';
  let { data }: { data: { tab: string; modes: Mode[] } } = $props();
  let selected = $state(data.modes[0]?.id ?? null);
  const mode = $derived(data.modes.find((m) => m.id === selected) ?? null);
  let expr = $state('');
  let result = $state('');
  let angle = $state<Angle>('deg');
  type K = string | { label: string; insert?: string; action?: string };
  const lab = (k: K) => (typeof k === 'string' ? k : k.label);
  const role = (k: K) => {
    const l = lab(k);
    if (l === 'AC' || l === 'C') return 'clear';
    if (l === 'DEL' || l === '⌫') return 'delete';
    if (l === '=') return 'evaluate';
    if (/^[0-9.]$/.test(l)) return 'digit';
    if (l.length === 1 && '+-*/^%÷×−'.includes(l)) return 'operator';
    return 'function';
  };
  function press(k: K) {
    const r = role(k);
    if (r === 'clear') { expr = ''; result = ''; return; }
    if (r === 'delete') { expr = expr.slice(0, -1); return; }
    if (r === 'evaluate') { result = calc(expr, angle); return; }
    expr += typeof k === 'string' ? k : k.insert ?? k.label;
    result = '';
  }
  // plot: the declared default expression over its declared range
  let canvas = $state<HTMLCanvasElement | null>(null);
  $effect(() => {
    if (!canvas || !mode?.plot) return;
    const p = mode.plot, ctx = canvas.getContext('2d'), d = devicePixelRatio || 1;
    if (!ctx) return;
    canvas.width = canvas.clientWidth * d; canvas.height = canvas.clientHeight * d;
    const w = canvas.width, h = canvas.height, ys: number[] = [];
    for (let i = 0; i <= p.steps; i++) { const x = p.xmin + ((p.xmax - p.xmin) * i) / p.steps; const v = Number(calc(p.default.replace(/x/g, `(${x})`), 'rad')); ys.push(Number.isFinite(v) ? v : NaN); }
    const lo = Math.min(...ys.filter(Number.isFinite), -1), hi = Math.max(...ys.filter(Number.isFinite), 1);
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = d; ctx.beginPath(); ctx.moveTo(0, h * (hi / (hi - lo))); ctx.lineTo(w, h * (hi / (hi - lo))); ctx.stroke();
    ctx.strokeStyle = getComputedStyle(canvas).color; ctx.lineWidth = 2 * d; ctx.beginPath();
    ys.forEach((y, i) => { const X = (w * i) / p.steps, Y = h * ((hi - y) / (hi - lo)); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    ctx.stroke();
  });
</script>

<div class="calc" data-testid="app-body" data-tab={data.tab}>
  {#if data.modes.length > 1}
    <div class="modes" role="tablist" data-testid="calc-modes">
      {#each data.modes as m (m.id)}
        <button class="mode" class:on={m.id === selected} role="tab" aria-selected={m.id === selected} onclick={() => (selected = m.id)}>
          <Icon set="fleet" name={m.icon || 'calculate'} size={16} /><span>{m.short || m.label}</span>
        </button>
      {/each}
    </div>
  {/if}
  {#if mode?.keys}
    <div class="display" data-testid="calc-display">
      <div class="expr" data-testid="calc-expr">{expr || 'Expression'}</div>
      <div class="res" data-testid="calc-result">{result}</div>
    </div>
    {#if mode.id === 'scientific'}
      <div class="angles">{#each ['deg', 'rad', 'grad'] as a}<button class:on={angle === a} onclick={() => (angle = a as Angle)}>{a.toUpperCase()}</button>{/each}</div>
    {/if}
    <div class="pad" style:--cols={Math.max(...mode.keys.map((r) => r.length))} data-testid="calc-pad">
      {#each mode.keys as row, ri (ri)}
        {#each row as k, ki (ki)}
          <button class="key {role(k)}" onclick={() => press(k)} data-key={lab(k)}>{lab(k)}</button>
        {/each}
      {/each}
    </div>
  {:else if mode?.plot}
    <div class="plot"><div class="fn">y = {mode.plot.default}</div><canvas bind:this={canvas}></canvas></div>
  {:else if mode}
    <EmptyState title={mode.label} caption="This mode runs on the phone (Cloud Calc: libqalculate, sensors, camera)." />
  {:else}
    <EmptyState title={null} caption="No modes declared for this page." />
  {/if}
</div>

<style>
  .calc { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; min-height: 100%; --c-primary: var(--app-cloud-calc-calc-accent); }
  .modes { display: flex; gap: 1px; overflow-x: auto; scrollbar-width: none; padding: 0 4px; }
  .mode { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 8px; border: 0; border-radius: 4px; background: none; color: var(--f-ink-dim); cursor: pointer; flex: none; }
  .mode.on { background: #ffffff14; color: var(--c-primary); }
  .mode span { font: 500 var(--type-label-small-size) / normal var(--type-family-sans); white-space: nowrap; }
  .display { min-height: 96px; border-radius: 12px; background: var(--app-cloud-calc-pad-panel); border: 1px solid var(--app-cloud-calc-pad-rim); padding: 12px; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; gap: 4px; }
  .expr { font: 400 var(--type-headline-medium-size) / normal var(--type-family-sans); color: var(--f-ink); word-break: break-all; text-align: right; }
  .res { font: 500 var(--type-title-large-size) / normal var(--type-family-sans); color: var(--c-primary); min-height: 1.2em; }
  .angles { display: flex; gap: 6px; justify-content: flex-end; }
  .angles button { border: 1px solid #ffffff1a; background: none; color: var(--f-ink-dim); border-radius: 8px; padding: 2px 8px; font: 500 11px var(--type-family-sans); }
  .angles .on { color: var(--c-primary); border-color: var(--c-primary); }
  .pad { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 8px; justify-items: center; }
  /* PadKey: the role's fill on top, the same hue 22% darker underneath, a 1dp rim, a 3dp shadow (pad_* in colors.xml) */
  .key { width: min(56px, 100%); aspect-ratio: 1; border-radius: 50%; border: 1px solid var(--app-cloud-calc-pad-rim); box-shadow: 0 3px 4px #0006; cursor: pointer;
    font: 500 22px / 1 var(--type-family-sans); --fill: var(--app-cloud-calc-pad-function); color: var(--app-cloud-calc-pad-on-function);
    background: linear-gradient(var(--fill), color-mix(in srgb, var(--fill) 78%, #000)); }
  .key.function { font-size: 16px; }
  .key.digit { --fill: var(--app-cloud-calc-pad-digit); color: var(--app-cloud-calc-pad-on-digit); }
  .key.operator { --fill: var(--app-cloud-calc-pad-operator); color: var(--app-cloud-calc-pad-on-operator); }
  .key.clear { --fill: var(--app-cloud-calc-pad-clear); color: var(--app-cloud-calc-pad-on-clear); }
  .key.delete { --fill: var(--app-cloud-calc-pad-delete); color: var(--app-cloud-calc-pad-on-delete); }
  .key.evaluate { --fill: var(--app-cloud-calc-pad-evaluate); color: var(--app-cloud-calc-pad-on-evaluate); }
  .key:active { transform: scale(0.94); box-shadow: 0 1px 1px #0006; }
  .plot { display: flex; flex-direction: column; gap: 8px; }
  .fn { font: 500 14px var(--type-family-mono); color: var(--f-ink-dim); }
  .plot canvas { width: 100%; height: 280px; border-radius: 12px; background: #00000040; color: var(--c-primary); }
</style>

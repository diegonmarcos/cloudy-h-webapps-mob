<script lang="ts">
  // 2.4 chart card body. Line/curve: 4 gridlines, y labels inside the right edge, area gradient, last-value pill, optional previous curve
  // (the only dashed stroke), crosshair on hover/drag with the hovered value replacing the title line. Bars: horizontal, labelled, value right.
  import { signedFmt, zoomWindow, ZOOM_MAX } from '../fin';
  type P = { label: string; x: number; y: number };
  let { points: all, kind, title, prev = null, unit = '', even = false }: { points: P[]; kind: 'line' | 'bars'; title: string; prev?: number[] | null; unit?: string; even?: boolean } = $props();
  // two-finger pinch zooms a dated line onto its latest points (zoomWindow, as the APK); double click resets; a curve (even tenors) does not zoom
  let zoom = $state(1);
  $effect(() => { all; zoom = 1; });
  const points = $derived(kind === 'line' && !even ? zoomWindow(all, zoom) : all);
  const touches = new Map<number, { x: number; y: number }>();
  let d0 = 0;
  const dist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  function down(e: PointerEvent) { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) d0 = dist(); else move(e); }
  function pinch(e: PointerEvent) {
    if (!touches.has(e.pointerId)) { move(e); return; }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2 && d0 > 0) { const d = dist(); zoom = Math.min(ZOOM_MAX, Math.max(1, zoom * (d / d0))); d0 = d; hover = null; } else if (touches.size < 2) move(e);
  }
  const up = (e: PointerEvent) => { touches.delete(e.pointerId); d0 = 0; };
  const W = 360, H = 200, R = 48, B = 18, T = 8;
  let hover = $state<number | null>(null);
  const gid = `g${Math.random().toString(36).slice(2, 8)}`;
  const g = $derived.by(() => {
    const ys = [...points.map((p) => p.y), ...(prev ?? [])].filter(Number.isFinite);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (!(hi > lo)) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const xs = points.map((p, i) => (even ? i : p.x));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const sx = (i: number) => 4 + (x1 === x0 ? 0.5 : (xs[i] - x0) / (x1 - x0)) * (W - R - 8);
    const sy = (y: number) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const area = points.length ? `${line} L${sx(points.length - 1).toFixed(1)},${H - B} L${sx(0).toFixed(1)},${H - B} Z` : '';
    const pl = prev && prev.length === points.length ? prev.map((y, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(y).toFixed(1)}`).join(' ') : '';
    const grid = [0, 1, 2, 3].map((k) => { const v = lo + ((k + 0.5) / 4) * (hi - lo); return { y: sy(v), v }; });
    const nt = Math.min(points.length, 6);
    const ticks = nt < 2 ? points.map((_, i) => i) : Array.from({ length: nt }, (_, k) => Math.round((k * (points.length - 1)) / (nt - 1)));
    return { sx, sy, line, area, pl, grid, ticks };
  });
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(2));
  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((_, i) => { const d = Math.abs(g.sx(i) - x); if (d < bd) { bd = d; best = i; } });
    hover = best;
  }
  const last = $derived(points[points.length - 1]);
  const maxAbs = $derived(Math.max(...points.map((p) => Math.abs(p.y)), 1e-9));
  const anyNeg = $derived(points.some((p) => p.y < 0));
</script>
{#if kind === 'line'}
  <div class="hd cap num" aria-live="polite">{#if hover !== null && points[hover]}<span class="hv">{points[hover].label}</span> <strong>{fmt(points[hover].y)}{unit}</strong>{#if prev?.[hover] !== undefined && prev} <span>({signedFmt((points[hover].y - prev[hover]) * (unit === '%' ? 100 : 1), unit === '%' ? 0 : 2)}{unit === '%' ? ' bp' : ''})</span>{/if}{:else}&nbsp;{/if}</div>
  <svg viewBox="0 0 {W} {H}" class="ch" role="img" aria-label={title} data-testid="finterm-chart" onpointermove={pinch} onpointerdown={down} onpointerup={up} onpointercancel={up} ondblclick={() => (zoom = 1)} onpointerleave={(e) => { up(e); hover = null; }}>
    <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--fin-accent)" stop-opacity=".22" /><stop offset="1" stop-color="var(--fin-accent)" stop-opacity="0" /></linearGradient></defs>
    {#each g.grid as l}<line x1="0" x2={W - R + 4} y1={l.y} y2={l.y} class="gl" /><text x={W - 2} y={l.y + 3} class="yl" text-anchor="end">{fmt(l.v)}</text>{/each}
    {#each g.ticks as i}<text x={g.sx(i)} y={H - 4} class="xl" text-anchor="middle">{points[i]?.label.slice(points[i].label.length > 7 ? 5 : 0)}</text>{/each}
    {#if g.pl}<path d={g.pl} class="pv" />{/if}
    <path d={g.area} fill="url(#{gid})" />
    <path d={g.line} class="ln" />
    {#if last}<circle cx={g.sx(points.length - 1)} cy={g.sy(last.y)} r="3" class="lp" /><rect x={W - R + 2} y={g.sy(last.y) - 9} width={R - 2} height="18" rx="4" class="pill" /><text x={W - 3} y={g.sy(last.y) + 4} class="pt" text-anchor="end">{fmt(last.y)}</text>{/if}
    {#if hover !== null && points[hover]}<line x1={g.sx(hover)} x2={g.sx(hover)} y1={T} y2={H - B} class="xh" /><line x1="0" x2={W - R} y1={g.sy(points[hover].y)} y2={g.sy(points[hover].y)} class="xh" /><circle cx={g.sx(hover)} cy={g.sy(points[hover].y)} r="5" class="ring" />{/if}
  </svg>
{:else}
  <div class="bars" role="img" aria-label={title} data-testid="finterm-chart">
    {#each points as p}
      <div class="br"><span class="bl">{p.label}</span>
        <span class="track" class:neg={anyNeg}><span class="bar" class:negb={p.y < 0} style:width="{(Math.abs(p.y) / maxAbs) * (anyNeg ? 50 : 100)}%" style:margin-left={anyNeg ? (p.y < 0 ? `${50 - (Math.abs(p.y) / maxAbs) * 50}%` : '50%') : '0'}></span></span>
        <span class="bv num">{fmt(p.y)}{unit}</span></div>
    {/each}
  </div>
{/if}
<style>
  .hd { min-height: 16px; color: var(--fin-text2); } .hd strong { color: var(--fin-text); }
  .ch { width: 100%; height: auto; max-height: 240px; display: block; touch-action: pan-y; cursor: crosshair; }
  .gl { stroke: var(--fin-hairline); stroke-width: 1; }
  .yl, .xl { fill: var(--fin-text2); font: 400 10px var(--fin-mono); }
  .ln { fill: none; stroke: var(--fin-accent); stroke-width: 2; stroke-linejoin: round; }
  .pv { fill: none; stroke: var(--fin-text3); stroke-width: 1; stroke-dasharray: 3 3; }
  .lp { fill: var(--fin-accent); }
  .pill { fill: var(--fin-accent); } .pt { fill: var(--fin-canvas); font: 600 10px var(--fin-mono); }
  .xh { stroke: var(--fin-accent); stroke-width: 1; opacity: .8; } .ring { fill: none; stroke: var(--fin-accent); stroke-width: 1.5; }
  .bars { display: flex; flex-direction: column; }
  .br { display: grid; grid-template-columns: minmax(80px, 34%) 1fr 72px; align-items: center; gap: 8px; min-height: 28px; }
  .bl { font: 400 12.5px/16px var(--fin-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track { height: 12px; position: relative; }
  .track.neg::before { content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--fin-hairline); }
  .bar { display: block; height: 12px; border-radius: 2px; background: var(--fin-accent); }
  .bar.negb { background: var(--fin-down); }
  .bv { text-align: right; font-size: 12.5px; }
</style>

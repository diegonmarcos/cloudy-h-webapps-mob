<script lang="ts">
  // #1370 the rate path: one 100% stacked bar, a segment per outcome (e.g. the number of Fed cuts) at falling alpha, legend below (the APK's FinStackBar).
  type P = { label: string; y: number };
  let { points }: { points: P[] } = $props();
  const legs = $derived(points.filter((p) => p.y >= 0.3));
  const sum = $derived(legs.reduce((a, p) => a + p.y, 0) || 1);
  const pct = (v: number) => ((v / sum) * 100).toFixed(1).replace(/\.0$/, '');
</script>
<div class="stack" data-testid="fin-stack">
  <div class="bar">
    {#each legs as p, i (p.label)}<span style="flex:{Math.max(p.y / sum, 0.001)};opacity:{Math.max(1 - i * 0.25, 0.25)}" title="{p.label} {pct(p.y)}%"></span>{/each}
  </div>
  <div class="leg cap">{#each legs as p (p.label)}<span>{p.label} {pct(p.y)}%</span>{/each}</div>
</div>
<style>
  .bar { display: flex; height: 8px; border-radius: 2px; overflow: hidden; }
  .bar span { background: var(--fin-accent, #4da3ff); min-width: 1px; }
  .leg { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; color: var(--fin-text2, #9aa4b2); }
</style>

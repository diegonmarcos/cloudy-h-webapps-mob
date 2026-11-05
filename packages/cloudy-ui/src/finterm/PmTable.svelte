<script lang="ts">
  // #1478 a PM sub-page: one table of finterm.json pm (GENERATED from data/pm.json of the APK) as the dense FinMatrix. A table whose rows name a portfolio (Vol) gets the risk-level
  // filter tabs (finterm.json risk_tabs) and every row links to the portfolio; a table with `tabs` (Profiles) gets one chip per tab; the rest (Commodities) is the matrix alone.
  import FinMatrix from './components/FinMatrix.svelte';
  import { FINTERM } from './catalog';
  import { filterRows, heatOf, matrixRows, RISK_ALL, type PmTableDecl, type RiskTab } from './risk';
  let { table, base }: { table: string; base: string } = $props();
  const decl = $derived((FINTERM as unknown as { pm: Record<string, PmTableDecl> }).pm[table]);
  const risks = (FINTERM as unknown as { risk_tabs: RiskTab[] }).risk_tabs;
  const dashOf = (id: string) => FINTERM.dashboards.find((d) => d.id === id) as unknown as { entry: string; risk?: string; tab: string; slug: string } | undefined;
  const nameOf = (id: string) => dashOf(id)?.entry ?? id;
  const tiered = $derived(!!decl?.rows?.some((r) => r.dashboard) && risks.length > 0);
  let sel = $state(RISK_ALL);
  const shown = $derived(!decl?.rows ? [] : tiered ? filterRows(decl.rows, (id) => dashOf(id)?.risk ?? '', sel) : decl.rows);
  const tab = $derived(decl?.tabs ? (decl.tabs.find((t) => t.id === sel) ?? decl.tabs[0]) : null);
  const chips = $derived(tab ? decl.tabs!.map((t) => ({ id: t.id, label: t.label })) : tiered ? risks.map((t) => ({ id: t.id, label: t.label })) : []);
  const href = (r: number) => { const d = dashOf(shown[r]?.dashboard ?? ''); return d ? `${base}${FINTERM.app_id}/${d.tab}/${d.slug}/` : null; };
</script>

{#if decl}
<section class="pm" data-testid="finterm-pm" data-table={table}>
  {#if chips.length}
    <div class="tabs" role="tablist" aria-label={table} data-testid="pm-tabs">
      {#each chips as t (t.id)}<button type="button" role="tab" class="chip" class:on={(tab ? tab.id : sel) === t.id} aria-selected={(tab ? tab.id : sel) === t.id} data-testid="pm-tab" data-tab={t.id} onclick={() => (sel = t.id)}>{t.label}</button>{/each}
    </div>
  {/if}
  {#if tab}
    <p class="note" data-testid="pm-leads">{tab.leads}</p>
    <FinMatrix columns={decl.columns} rows={tab.rows} labels={decl.label_fracs} />
  {:else}
    <FinMatrix columns={decl.columns} rows={matrixRows(shown, nameOf)} heat={heatOf(shown, decl.heat)} labels={decl.label_fracs} rowHref={tiered ? href : undefined} />
  {/if}
  <p class="note faint" data-testid="pm-note">{decl.note}</p>
  {#if decl.tool}{@const d = dashOf(decl.tool.dashboard)}{#if d}<a class="tool" href="{base}{FINTERM.app_id}/{d.tab}/{d.slug}/" data-testid="pm-tool">{decl.tool.label}</a>{/if}{/if}
</section>
{/if}

<style>
  .pm { padding: 12px 16px 96px; display: flex; flex-direction: column; gap: 8px; }
  .tabs { display: flex; gap: 8px; overflow-x: auto; }
  .chip { all: unset; cursor: pointer; box-sizing: border-box; min-height: 32px; padding: 0 10px; display: flex; align-items: center; border-radius: 8px; white-space: nowrap;
    border: 1px solid var(--fin-hairline, #243040); color: var(--fin-text2, #9AA7B4); font: 500 11px/16px var(--fin-sans); letter-spacing: .4px; }
  .chip.on { border-color: var(--fin-accent, #5AA7FF); color: var(--fin-accent, #5AA7FF); background: color-mix(in srgb, var(--fin-accent, #5AA7FF) 20%, transparent); }
  .note { margin: 0; color: var(--fin-text2, #9AA7B4); font: 400 11px/16px var(--fin-sans); }
  .note.faint { color: var(--fin-text3, #6B7886); }
  .tool { color: var(--fin-accent, #5AA7FF); font: 600 15px/20px var(--fin-sans); text-decoration: none; }
</style>

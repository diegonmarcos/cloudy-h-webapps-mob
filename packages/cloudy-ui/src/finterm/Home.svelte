<script lang="ts">
  // #1399 a FinTerm tab's Homepage: every sub-page of the tab as a card (icon, name, one-line description) in a grid; a tap opens it.
  // The cards are GENERATED (finterm.json homes, from the Android ui.sections pages + ui.stacks subtitles), never typed here.
  // #1462 cards that declare a risk tier (PM) get the top tabs All | A Low | B Middle | C Risky | D High; All draws a section header per tier.
  import Icon from '../shell/Icon.svelte';
  import { FINTERM } from './catalog';
  import { riskGroups, RISK_ALL, type RiskTab } from './risk';
  let { tab, cards }: { tab: string; cards: { slug: string; title: string; icon: string; subtitle: string; href: string; risk?: string }[] } = $props();
  const tabs = (FINTERM as unknown as { risk_tabs: RiskTab[] }).risk_tabs ?? [];
  const tiered = $derived(tabs.length > 0 && cards.some((c) => c.risk));
  let sel = $state(RISK_ALL);
  const groups = $derived(tiered ? riskGroups(cards, tabs, sel) : [{ header: '', cards }]);
</script>

<section class="home" data-testid="finterm-home" data-tab={tab}>
  {#if tiered}
    <div class="tabs" role="tablist" aria-label="Risk" data-testid="risk-tabs">
      {#each tabs as t (t.id)}<button type="button" role="tab" class="chip" class:on={sel === t.id} aria-selected={sel === t.id} data-testid="risk-tab" data-risk={t.id} onclick={() => (sel = t.id)}>{t.label}</button>{/each}
    </div>
  {/if}
  {#each groups as g, gi (gi)}
    {#if g.header}<h2 class="risk" data-testid="risk-header">{g.header}</h2>{/if}
    <div class="grid">
      {#each g.cards as c (c.slug)}
        <a class="card" href={c.href} data-testid="home-card" data-page={c.slug} data-risk={c.risk ?? ''}>
          <span class="head"><Icon name={c.icon} set="fleet" size={20} /><span class="name">{c.title}</span></span>
          <span class="sub">{c.subtitle}</span>
        </a>
      {/each}
    </div>
  {/each}
</section>

<style>
  .home { padding: 12px 16px 96px; display: flex; flex-direction: column; gap: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .tabs { display: flex; gap: 6px; overflow-x: auto; }
  .chip { all: unset; cursor: pointer; box-sizing: border-box; min-height: 32px; padding: 0 10px; display: flex; align-items: center; border-radius: 8px; white-space: nowrap;
    border: 1px solid var(--fin-hairline, #243040); color: var(--fin-text2, #9AA7B4); font: 500 11px/16px var(--fin-sans); letter-spacing: .4px; }
  .chip.on { border-color: var(--fin-accent, #5AA7FF); color: var(--fin-accent, #5AA7FF); background: color-mix(in srgb, var(--fin-accent, #5AA7FF) 20%, transparent); }
  .risk { margin: 4px 0 -4px; font: 500 11px/16px var(--fin-sans); letter-spacing: .8px; text-transform: uppercase; color: var(--fin-text2, #9AA7B4); }
  .card { display: flex; flex-direction: column; gap: 6px; min-height: 96px; padding: 12px; border-radius: 12px; text-decoration: none;
    background: var(--fin-surface, #121A23); border: 1px solid var(--fin-hairline, #243040); color: var(--fin-text, #E6EDF3); }
  .card:hover, .card:focus-visible { border-color: var(--fin-accent, #5AA7FF); }
  .head { display: flex; align-items: center; gap: 8px; color: var(--fin-accent, #5AA7FF); }
  .name { color: var(--fin-text, #E6EDF3); font-weight: 600; font-size: 15px; line-height: 1.25; }
  .sub { color: var(--fin-text2, #9AA7B4); font-size: 12px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>

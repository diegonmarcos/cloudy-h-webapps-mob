<script lang="ts">
  // #1399 a FinTerm tab's Homepage: every sub-page of the tab as a card (icon, name, one-line description) in a grid; a tap opens it.
  // The cards are GENERATED (finterm.json homes, from the Android ui.sections pages + ui.stacks subtitles), never typed here.
  import Icon from '../shell/Icon.svelte';
  let { tab, cards }: { tab: string; cards: { slug: string; title: string; icon: string; subtitle: string; href: string }[] } = $props();
</script>

<section class="home" data-testid="finterm-home" data-tab={tab}>
  {#each cards as c (c.slug)}
    <a class="card" href={c.href} data-testid="home-card" data-page={c.slug}>
      <span class="head"><Icon name={c.icon} set="fleet" size={20} /><span class="name">{c.title}</span></span>
      <span class="sub">{c.subtitle}</span>
    </a>
  {/each}
</section>

<style>
  .home { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; padding: 12px 16px 96px; }
  .card { display: flex; flex-direction: column; gap: 6px; min-height: 96px; padding: 12px; border-radius: 12px; text-decoration: none;
    background: var(--fin-surface, #121A23); border: 1px solid var(--fin-hairline, #243040); color: var(--fin-text, #E6EDF3); }
  .card:hover, .card:focus-visible { border-color: var(--fin-accent, #5AA7FF); }
  .head { display: flex; align-items: center; gap: 8px; color: var(--fin-accent, #5AA7FF); }
  .name { color: var(--fin-text, #E6EDF3); font-weight: 600; font-size: 15px; line-height: 1.25; }
  .sub { color: var(--fin-text2, #9AA7B4); font-size: 12px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>

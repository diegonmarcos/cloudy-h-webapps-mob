<script lang="ts">
  // GroupedTilesFragment.kt: GroupTitle (titleSmall, text_primary, 4dp start, 12dp top, 4dp bottom) over a TileStrip of
  // 60dp TileCells (6dp padding, 32dp glyph tinted text_primary, label 12sp at 80% text_primary, 4dp under the glyph, 2 lines),
  // one sideways-scrolling line per group (wrap = false) or wrapped (Configs). A separator is a 0.5dp divider riding on the
  // previous tile's right edge at the glyph's centre (22dp). Page padding 12dp.
  import Icon from './Icon.svelte';
  import type { TileGroup } from './types';
  import { onMount } from 'svelte';
  let { groups, wrap = false, quickmarks = false }: { groups: TileGroup[]; wrap?: boolean; quickmarks?: boolean } = $props();
  // Cloud > App page (quickmarks = true), GroupedTilesFragment.kt: the search bar on top, the declared groups, then (below the
  // Actions row) "All Apps" (every declared app tile by group, from the same declaration) and "Smart Folders" > "Recently Used"
  // (tiles opened here, kept on this device; the empty-state line shows until one is opened).
  const RK = 'cloud-webapps:recent';
  let q = $state('');
  let recent = $state<string[]>([]);
  onMount(() => { try { recent = JSON.parse(localStorage.getItem(RK) ?? '[]'); } catch { recent = []; } });
  const needle = $derived(q.trim().toLowerCase());
  const shown = $derived(!quickmarks || !needle ? groups
    : groups.map((g) => ({ ...g, tiles: g.tiles.filter((t) => t.label.toLowerCase().includes(needle)).map((t) => ({ ...t, separatorAfter: false })) })).filter((g) => g.tiles.length));
  const appGroups = $derived(groups.filter((g) => g.title !== 'Actions' && g.title !== ''));
  const flat = $derived(groups.flatMap((g) => g.tiles));
  const recentTiles = $derived(recent.map((id) => flat.find((t) => t.id === id)).filter((t) => !!t));
  function opened(id: string) {
    if (!quickmarks) return;
    recent = [id, ...recent.filter((r) => r !== id)].slice(0, 12);
    try { localStorage.setItem(RK, JSON.stringify(recent)); } catch { /* private mode */ }
  }
</script>

<div class="tile-page" data-testid="tile-groups">
  {#if quickmarks}
    <label class="search"><Icon name="ic_search" size={22} /><input type="search" placeholder="Search" aria-label="Search" bind:value={q} data-testid="app-search" /></label>
    <h3 class="group-title">Quickmarks</h3>
  {/if}
  {#each shown as g, gi (gi)}
    <section class="group" data-group={g.title}>
      <h3 class="group-title">{#if g.glyph}<span class="group-glyph" aria-hidden="true">{g.glyph} </span>{/if}{g.title}</h3>
      <div class="strip" class:wrap>
        {#each g.tiles as t, ti (ti)}
          <div class="cell">
            {#if t.href}
              <a class="tile" class:missing={t.missing} class:grey={t.grey} href={t.href} target={t.external ? '_blank' : undefined} rel={t.external ? 'noopener' : undefined} data-tile={t.id} onclick={() => opened(t.id)}>
                <span class="glyph"><Icon name={t.missing ? 'ic_app_not_installed' : t.icon} size={32} />{#if t.mesh}<span class="mesh" title="Private: needs the WireGuard mesh" data-testid="mesh-badge"><Icon name="ic_lock" size={11} /></span>{/if}</span>
                <span class="tile__label">{t.label}</span>
              </a>
            {:else}
              <span class="tile inert" class:grey={t.grey} aria-disabled={t.grey ? 'true' : undefined} data-tile={t.id} title={t.grey ? 'No web version' : 'Opens on the phone'}>
                <Icon name={t.icon} size={32} />
                <span class="tile__label">{t.label}</span>
              </span>
            {/if}
            {#if t.separatorAfter}<i class="tile-sep" aria-hidden="true"></i>{/if}
          </div>
        {/each}
      </div>
    </section>
  {/each}
  {#if quickmarks && !needle}
    <hr class="divider" />
    <section data-testid="all-apps">
      <h3 class="group-title">All Apps</h3>
      {#each appGroups as g, gi (gi)}
        <h3 class="group-title" data-apps-group={g.title}>{g.title}</h3>
        <div class="strip wrap">
          {#each g.tiles as t, ti (ti)}
            {#if t.href}
              <a class="app" href={t.href} target={t.external ? '_blank' : undefined} rel={t.external ? 'noopener' : undefined} data-app={t.id} onclick={() => opened(t.id)}><span class="app__ic"><Icon name={t.missing ? 'ic_app_not_installed' : t.icon} size={32} /></span><span class="app__label">{t.label}</span></a>
            {/if}
          {/each}
        </div>
      {/each}
    </section>
    <hr class="divider" />
    <section data-testid="smart-folders">
      <h3 class="group-title">Smart Folders</h3>
      <h3 class="group-title">Recently Used</h3>
      {#if recentTiles.length}
        <div class="strip" data-testid="recent-tiles">
          {#each recentTiles as t (t.id)}
            <div class="cell"><a class="tile" href={t.href} target={t.external ? '_blank' : undefined} rel={t.external ? 'noopener' : undefined}><span class="glyph"><Icon name={t.icon} size={32} /></span><span class="tile__label">{t.label}</span></a></div>
          {/each}
        </div>
      {:else}
        <p class="recent-empty" data-testid="recent-empty">Open a few Cloud tiles and they'll show up here</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .search { display: flex; align-items: center; gap: 10px; margin: 4px 0 8px; padding: 0 12px; height: 48px; border-radius: 12px; border: 1px solid var(--role-hairline); background: color-mix(in srgb, var(--role-surface) 80%, transparent); color: var(--role-text-secondary); }
  .search input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; font: 400 14px / normal var(--type-family-sans); color: var(--role-text-primary); }
  .divider { border: 0; border-top: 1px solid var(--role-hairline); margin: 16px 0 4px; }
  .app { display: flex; flex-direction: column; align-items: center; width: 72px; padding: 6px 0; text-decoration: none; color: var(--role-text-primary); }
  .app__ic { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 14px; background: color-mix(in srgb, var(--role-surface) 80%, transparent); line-height: 0; }
  .app__label { padding-top: 4px; font: 400 11px / normal var(--type-family-sans); text-align: center; max-width: 68px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .recent-empty { margin: 0; padding: 0 4px 8px; font: 400 12px / normal var(--type-family-sans); color: var(--role-text-secondary); }
  .tile-page { padding: 12px; }
  .group-title { margin: 0; padding: 12px 0 4px 4px; font: 500 var(--type-title-small-size) / normal var(--type-family-sans); color: var(--role-text-primary); }
  .strip { display: flex; overflow-x: auto; scrollbar-width: none; }
  .strip.wrap { flex-wrap: wrap; overflow: visible; }
  .cell { position: relative; flex: none; width: 60px; }
  .tile { display: flex; flex-direction: column; align-items: center; padding: 6px; color: var(--role-text-primary); text-decoration: none; -webkit-tap-highlight-color: transparent; }
  .tile.missing { color: var(--role-text-secondary); }
  /* phone-only apps (#1326): desaturated with the token palette, still a link (to the About page) */
  .tile.grey { color: var(--role-text-secondary); }
  .tile.grey .glyph { filter: grayscale(1); opacity: 0.5; }
  .glyph { position: relative; display: block; line-height: 0; }
  .mesh { position: absolute; right: -5px; bottom: -4px; width: 14px; height: 14px; border-radius: 50%; display: grid; place-items: center; line-height: 0;
    background: var(--role-surface); color: var(--role-text-primary); border: 1px solid var(--role-hairline); }
  .tile__label { padding-top: 4px; font: 400 12px / normal var(--type-family-sans); text-align: center; color: color-mix(in srgb, var(--role-text-primary) 80%, transparent);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; max-width: 48px; }
  .tile-sep { position: absolute; right: 0; top: 22px; width: 0.5px; height: 32px; margin-top: -16px; background: var(--role-hairline); }
</style>

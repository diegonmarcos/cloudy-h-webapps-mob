// Parity of the regenerated site against what it served before (#1958, rule 16: nothing lost without a declared reason).
// Pure: checkParity(baseline, drops, current) -> list of problems (empty = parity).
//   baseline : data/parity-baseline-1958.json   drops : data/parity-declared-drops.json
//   current  : { tiles: [{group,id,label}], nav_slugs: [], routes: [], cloud_pages: [] } read from the generated files
export function checkParity(baseline, drops, current) {
  const bad = [];
  const have = (list, f) => new Set(list.map(f));
  const curIds = have(current.tiles, (t) => t.id);
  const curGroupId = have(current.tiles, (t) => `${t.group}/${t.id}`);
  const dTiles = new Map(drops.tiles.map((d) => [d.id, d]));
  const dMoved = new Map(drops.tiles_moved.map((d) => [d.id, d]));
  for (const t of baseline.tiles) {
    if (curGroupId.has(`${t.group}/${t.id}`)) continue;
    if (curIds.has(t.id)) { const m = dMoved.get(t.id); if (!m?.reason || m.from !== t.group || !curGroupId.has(`${m.to}/${t.id}`)) bad.push(`tile ${t.group}/${t.id} moved without a declared move`); continue; }
    if (!dTiles.get(t.id)?.reason) bad.push(`tile ${t.group}/${t.id} (${t.label}) lost without a declared reason`);
  }
  for (const d of drops.tiles) if (curIds.has(d.id)) bad.push(`declared tile drop ${d.id} is still present (stale declaration)`);
  const curSlugs = new Set(current.nav_slugs);
  for (const s of baseline.nav_slugs) if (!curSlugs.has(s) && !drops.nav_slugs.find((d) => d.slug === s && d.reason)) bad.push(`shared-nav app ${s} lost without a declared reason`);
  for (const d of drops.nav_slugs) if (curSlugs.has(d.slug)) bad.push(`declared nav drop ${d.slug} is still present (stale declaration)`);
  const curPages = new Set(current.cloud_pages);
  for (const p of baseline.cloud_pages) if (!curPages.has(p) && !drops.cloud_pages.find((d) => d.id === p && d.reason)) bad.push(`Cloud page ${p} lost without a declared reason`);
  const curRoutes = new Set(current.routes);
  const lost = baseline.routes.filter((r) => !curRoutes.has(r));
  for (const r of lost) if (!drops.routes.find((d) => r.startsWith(d.prefix) && d.reason)) bad.push(`route ${r} lost without a declared reason`);
  for (const d of drops.routes) if (!lost.some((r) => r.startsWith(d.prefix))) bad.push(`declared route drop ${d.prefix} matches nothing lost (stale declaration)`);
  return bad;
}

/** Every tile Cloud > App declares must be drawn by the site: the generated app list (scripts/cloud-apps.json) holds the same
 *  groups and tiles in the same order as the declaration. Returns problems. */
export function checkAppPage(declGroups, siteGroups) {
  const bad = [];
  const flat = (gs) => gs.map((g) => `${g.title}|${g.tiles.filter((t) => !t.separator).map((t) => `${t.id}:${t.label}`).join(',')}`);
  const a = flat(declGroups), b = flat(siteGroups);
  if (a.length !== b.length) bad.push(`group count ${b.length} != declared ${a.length}`);
  a.forEach((g, i) => { if (g !== b[i]) bad.push(`group ${i} differs: site "${b[i]}" vs declared "${g}"`); });
  return bad;
}

/** The three parts of SuperApp Cloud > App the site must draw besides the groups (#1958b): the search bar, All Apps (every declared
 *  app group, from the same declaration) and Smart Folders > Recently Used (with its empty-state line). `src` is the source of
 *  packages/cloudy-ui/src/shell/Tiles.svelte, the one renderer of the page. Returns problems. */
export function checkAppParts(declGroups, src) {
  const bad = [];
  if (!/data-testid="app-search"/.test(src) || !/placeholder="Search"/.test(src) || !/needle/.test(src)) bad.push('search bar missing: the site Cloud > App page has no working Search field');
  if (!/data-testid="all-apps"/.test(src) || !/>All Apps</.test(src) || !/appGroups\.?/.test(src) || !/data-apps-group/.test(src)) bad.push('All Apps section missing: the site Cloud > App page does not draw every declared group as apps');
  if (!/data-testid="smart-folders"/.test(src) || !/>Smart Folders</.test(src) || !/>Recently Used</.test(src) || !/Open a few Cloud tiles and they'll show up here/.test(src)) bad.push('Smart Folders section missing: Recently Used (and its empty-state line) is not drawn');
  if (!declGroups.some((g) => g.title !== 'Actions' && g.tiles.length)) bad.push('All Apps would be empty: the declaration has no app groups');
  return bad;
}

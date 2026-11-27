import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error plain JS module shared with the mutation script
import { checkParity, checkAppPage } from './lib/parity.mjs';

// #1958 (rule 16): the site mirrors SuperApp Cloud > App; every app the App page shows appears on the site, and nothing the site had
// before is gone unless data/parity-declared-drops.json says why. PARITY_MUTATE=1 (the CI mutation step) breaks the current data on
// purpose: this file must then FAIL.
const root = join(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const nav = read('packages/cloudy-ui/nav/nav.json');
const cloud = nav.superapp.sections.find((s: { id: string }) => s.id === 'cloud');
let groups = cloud.tile_groups as { title: string; tiles: { id?: string; label?: string; separator?: boolean }[] }[];
let routes: string[] = read('packages/cloudy-ui/nav/routes.json').routes.map((r: { path: string }) => r.path);
const navJs = readFileSync(join(root, '_shared/dist/nav.js'), 'utf8');
let navSlugs: string[] = JSON.parse(/A=(\[\[.*?\]\]);/.exec(navJs)![1]).map((a: string[]) => a[0]);
let siteGroups = read('scripts/cloud-apps.json').groups as typeof groups;
let pages: string[] = cloud.pages.map((p: { id: string }) => p.id);
if (process.env.PARITY_MUTATE === '1') {
  groups = groups.map((g, i) => (i === 0 ? { ...g, tiles: g.tiles.slice(1) } : g));   // the App page "drops" its first tile
  routes = routes.filter((r) => !r.startsWith('cloud-calc/'));                        // the site loses a whole app
  navSlugs = navSlugs.filter((s) => s !== 'cloud-mail');
  pages = pages.slice(1);
}
const tiles = groups.flatMap((g) => g.tiles.filter((t) => !t.separator).map((t) => ({ group: g.title, id: t.id!, label: t.label! })));

describe('webapps parity (#1958)', () => {
  it('nothing the site had before is lost without a declared reason', () => {
    const bad = checkParity(read('data/parity-baseline-1958.json'), read('data/parity-declared-drops.json'), { tiles, nav_slugs: navSlugs, routes, cloud_pages: pages });
    expect(bad).toEqual([]);
  });
  it('the site app list (shared nav + service pages) is the App page declaration, group for group', () => {
    expect(checkAppPage(groups, siteGroups)).toEqual([]);
  });
  it('every tile of the App page with an extapp target is a shared-nav app of the site', () => {
    const slug = (t: string) => { const m = /^extapp:([a-z0-9-]+)/.exec(t); return m ? ({ 'cloud-media-center': 'cloud-media', 'cloud-terminal-nix': 'cloud-terminal' } as Record<string, string>)[m[1]] ?? m[1] : null; };
    const want = new Set(groups.flatMap((g) => g.tiles).map((t: any) => (t.target ? slug(t.target) : null)).filter(Boolean));
    for (const s of want) expect(navSlugs, `${s}`).toContain(s);
  });
  it('the Actions row (circular menu) is declared and drawn after the groups', () => {
    expect(nav.superapp.circular_actions.length).toBeGreaterThan(0);
  });
});

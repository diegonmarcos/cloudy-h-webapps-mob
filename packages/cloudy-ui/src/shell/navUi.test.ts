import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import nav from '../../nav/nav.json';
import { tokens } from '../../tokens/tokens';
import {
  CLEAN_DRAWER_ACTIONS, CLEAN_DRAWER_ROWS, DEFAULT_NAV_UI, NAV_UI_MODES, declaredNavUi, isTransparent, navChromePlan, parseNavUi, scrollHideStep,
  type NavUiMode,
} from './navUi';
import { cleanDrawerModel } from './navUiDrawer';
import { loadNavUi, navUi } from './navUiStore';
import { saveNavUi } from './navUiSave';

// The nav UI (libs:bottomnav NavUi.kt): everything below reads the GENERATED tokens, so an Android change that is not regenerated fails here.
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

describe('the declaration, generated from NavUi.kt', () => {
  it('has the two modes, the three drawer rows and the three icons', () => {
    expect(NAV_UI_MODES).toEqual(['classic', 'clean']);
    expect(CLEAN_DRAWER_ROWS).toEqual(['page_dropdown', 'actions', 'sub_page_dropdown']);
    expect(CLEAN_DRAWER_ACTIONS).toEqual(['ai', 'profile', 'settings']);
    expect(DEFAULT_NAV_UI).toEqual({ mode: 'classic', scrollHide: true });
  });
  it('carries the Clean sizes and the transparent first-row fill', () => {
    const n = tokens.nav;
    expect([n.cleanBarHeight, n.cleanCellHeight, n.cleanIconSize, n.cleanBottomMargin, n.cleanDrawerWidth, n.cleanDrawerRowHeight]).toEqual([44, 40, 22, 6, 320, 48]);
    expect(n.topRowFill).toBe('#00000000');
  });
});

describe('Clean removes the second row and adds the drawer rows', () => {
  it('Clean: hamburger, no second row, no bottom labels, the three rows in order', () => {
    const p = navChromePlan('clean');
    expect(p.secondRow).toBe(false);
    expect(p.hamburger).toBe(true);
    expect(p.bottomLabels).toBe(false);
    expect(p.drawerRows).toEqual(['page_dropdown', 'actions', 'sub_page_dropdown']);
    expect(p.drawerActions).toEqual(['ai', 'profile', 'settings']);
  });
  it('Classic keeps the second row and the labels and has no drawer', () => {
    const p = navChromePlan('classic');
    expect([p.secondRow, p.hamburger, p.bottomLabels, p.drawerRows, p.drawerActions]).toEqual([true, false, true, [], []]);
  });
  it('the drawer lists the pages, names the open one, and gives the child pages a dropdown', () => {
    const bottom = [{ id: 'home', label: 'Home', href: '/' }, { id: 'pages', label: 'Pages', href: '/pages/' }];
    const kids = [{ id: 'all', label: 'All', href: '/pages/all/' }, { id: 'tags', label: 'Tags', href: '/pages/tags/' }];
    const m = cleanDrawerModel(bottom, 'pages', kids, 'tags');
    expect(m.pageName).toBe('Pages');
    expect(m.pages.map((p) => p.selected)).toEqual([false, true]);
    expect(m.rows).toEqual(CLEAN_DRAWER_ROWS);
    expect(m.subPageName).toBe('Tags');
    expect(cleanDrawerModel(bottom, 'home', [], null).rows).toEqual(['page_dropdown', 'actions']);
  });
});

describe('the first row is transparent in every mode', () => {
  it.each(NAV_UI_MODES)('%s', (mode: NavUiMode) => { expect(navChromePlan(mode).topRowTransparent).toBe(true); });
  it('a grey fill is seen; transparent spellings are not', () => {
    expect(navChromePlan('classic', '#303030ff').topRowTransparent).toBe(false);
    expect(navChromePlan('clean', '#30303080').topRowTransparent).toBe(false);
    expect([isTransparent('transparent'), isTransparent('#0000'), isTransparent('#ffffff00')]).toEqual([true, true, true]);
  });
});

describe('scroll-hide: down hides ALL bars, up restores', () => {
  it('a downward scroll hides from any state and stays hidden', () => {
    expect(scrollHideStep('shown', 10, true)).toBe('hidden');
    expect(scrollHideStep('hidden', 10, true)).toBe('hidden');
    expect(scrollHideStep('hidden', 0, true)).toBe('hidden');
  });
  it('an upward scroll restores', () => {
    expect(scrollHideStep('hidden', -3, true)).toBe('shown');
    expect(scrollHideStep('shown', -3, true)).toBe('shown');
    expect(scrollHideStep('shown', 0, true)).toBe('shown');
  });
  it('scroll-hide off pins the bars', () => {
    expect(scrollHideStep('shown', 50, false)).toBe('shown');
    expect(scrollHideStep('hidden', 50, false)).toBe('shown');
  });
});

describe('the choice is the app\'s own, over its declared default', () => {
  it('parses fail-soft', () => {
    expect(parseNavUi('not json')).toEqual(DEFAULT_NAV_UI);
    expect(parseNavUi('{"mode":"neon","scrollHide":"x"}')).toEqual(DEFAULT_NAV_UI);
    expect(parseNavUi('{"mode":"clean","scrollHide":false}')).toEqual({ mode: 'clean', scrollHide: false });
    expect(declaredNavUi(null)).toEqual(DEFAULT_NAV_UI);
    expect(declaredNavUi({ mode: 'clean', scroll_hide: true })).toEqual({ mode: 'clean', scrollHide: true });
  });
  it('persists per app and clears when it equals the default', () => {
    const s = mem();
    const dflt = declaredNavUi({ mode: 'clean' });
    expect(loadNavUi('cloud-notes', dflt, s, '')).toEqual({ mode: 'clean', scrollHide: true });
    saveNavUi('cloud-notes', dflt, { mode: 'classic', scrollHide: false }, s);
    expect(get(navUi)).toEqual({ mode: 'classic', scrollHide: false });
    expect(loadNavUi('cloud-notes', dflt, s, '')).toEqual({ mode: 'classic', scrollHide: false });
    expect(loadNavUi('cloud-mail', DEFAULT_NAV_UI, s, '')).toEqual(DEFAULT_NAV_UI);
    saveNavUi('cloud-notes', dflt, dflt, s);
    expect(s.m.size).toBe(0);
  });
  it('a ?nav= override is not saved', () => {
    const s = mem();
    expect(loadNavUi('cloud-mail', DEFAULT_NAV_UI, s, '?nav=clean').mode).toBe('clean');
    expect(s.m.size).toBe(0);
  });
});

type A = { id: string; sections: unknown[]; nav_ui?: { mode?: string } | null; configs_ui?: string[] };
const apps = (nav as unknown as { apps: A[] }).apps;
describe('every app offers Configs > UI', () => {
  // Android's nav-shape.json::nav_ui.pending: the apps whose chrome is not the shared scaffold yet. The web FleetShell draws the entry for all of them.
  const PENDING = ['cloud-camera', 'cloud-code', 'cloud-superapp', 'cloud-vault', 'cloud-wallet'];
  it('every fleet app with sections lists nav_ui in configs_ui (the pending ones are the named five)', () => {
    const withNav = apps.filter((a) => a.sections.length);
    expect(withNav.length).toBeGreaterThan(20);
    const missing = withNav.filter((a) => !(a.configs_ui ?? []).includes('nav_ui')).map((a) => a.id).sort();
    expect(missing).toEqual(PENDING.filter((id) => withNav.some((a) => a.id === id)).sort());
  });
});

// The apps whose build.json declares ui.nav_ui = clean: Cloud Notes (#1344) and Capital-Stack-FinTerminal (#1361, FinTerm UI spec 4.1).
const CLEAN = ['cloud-notes']; // #1399 FinTerm moved to classic: its one-row sub-page nav is the second row

describe('Cloud Notes starts in Clean', () => {
  it('their declared default (build.json ui.nav_ui) is clean, everyone else is classic', () => {
    for (const id of CLEAN) expect(declaredNavUi(apps.find((a) => a.id === id)!.nav_ui).mode, id).toBe('clean');
    for (const a of apps.filter((x) => !CLEAN.includes(x.id))) expect(declaredNavUi(a.nav_ui).mode, a.id).toBe('classic');
  });
});

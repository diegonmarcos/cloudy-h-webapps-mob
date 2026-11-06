// Server-side (build-time) view models. nav.json / targets.json are GENERATED from the Android build.json ui declarations;
// they are read here, at prerender, so the client only ever receives the slice a page needs (__data.json), never the files.
import nav from '@cloudy/ui/nav/nav.json';
import targetsJson from '@cloudy/ui/nav/targets.json';
import routesJson from '@cloudy/ui/nav/routes.json';
import overlay from '@cloudy/ui/nav/nav-overlay.json';
import appLinks from '@cloudy/ui/nav/app-links.json';
import appsUi from '@cloudy/ui/nav/apps-ui.json';
import { titleHierarchy, titleNav, type Entry } from '@cloudy/ui/src/fleet/fleetNav.ts';
import { FINTERM } from '@cloudy/ui/src/finterm/catalog.ts';
import { drawerRows, resolveTarget, joinBase, type ShellData, type Tab, type TileGroup, type TileItem } from '@cloudy/ui';
import content from '../../apps/superapp/data/sections-content.json';
import core from '../../apps/superapp/data/sections-core.json';
import linktree from '../../apps/superapp/data/linktree.json';
import phoneApps from '../../apps/phone-apps/phone-apps.json';
import shellSeed from '../../apps/superapp/data/shell.json';
import statusBarJson from '@cloudy/ui/nav/status-bar.json';
import { stripChips, stripRight, stripShowsBattery, type StatusBarDecl } from '@cloudy/ui/src/shell/statusBar.ts';

type Page = { id: string; label: string; icon?: string; hidden?: boolean; action?: string; is_action?: boolean; pages?: Page[]; mirror_section?: string; mode?: string; url?: string; separator_before?: boolean; group?: string; subgroup?: string };
type Tile = { id?: string; label: string; icon?: string; target?: string; separator?: boolean; tint?: boolean };
type Section = Record<string, unknown> & { id: string; label: string; icon?: string; pages?: Page[]; tile_groups?: { title: string; tiles: Tile[] }[] };
type App = { id: string; name: string; label: string; icon: string | null; kind: string; wasm: string | null; package: string | null; default_section: string | null; bottom_nav: string[]; top_bar: Record<string, unknown> | null; nav_ui?: { mode?: string; scroll_hide?: boolean } | null; configs_ui?: string[]; sections: (Page & { background?: string })[] };

export const SA = nav.superapp as unknown as { default_section: string; bottom_nav: string[]; sections: Section[]; top_orbs?: { right?: string }; dynamic_island_action?: string; external_apps: { id: string; install_package?: string; hub_package?: string }[]; [k: string]: unknown };
export const APPS = nav.apps as unknown as App[];
export const ROUTES = routesJson.routes as { path: string; kind: string; section?: string; app?: string; page?: string[] }[];
const TARGETS = targetsJson.targets as Record<string, string>;
const PACKAGES: Record<string, string> = Object.fromEntries(APPS.filter((a) => a.package).map((a) => [a.package as string, a.id]));
const sectionById = new Map(SA.sections.map((s) => [s.id, s]));

export function href(base: string, target: string | undefined | null): { href: string | null; external: boolean } {
  const r = resolveTarget(target, TARGETS, PACKAGES);
  if (r.kind === 'path') return { href: joinBase(base, r.path), external: false };
  if (r.kind === 'url') return { href: r.url, external: true };
  return { href: null, external: false };
}

// #1326: every fleet app resolves to its real web service (data/app-links.json -> app-links.json, GENERATED).
export type AppLink = { id: string; kind: 'container' | 'webapp' | 'external' | 'phone-only'; href: string | null; reason: string; about?: boolean; mesh?: boolean; service?: string; entries_open_app?: boolean; backend?: { label: string; href: string; mesh: boolean; service: string } };
export const LINKS = new Map((appLinks.links as AppLink[]).map((l) => [l.id, l]));
/** The mapping entry a tile resolves through: its `extapp:<app>[#page:..]` app, else its own id (c3-bot, ai-chat). */
export function linkOf(t: Tile): AppLink | undefined {
  const m = /^extapp:([a-z0-9-]+)/.exec(t.target ?? '');
  return m ? LINKS.get(m[1]) : t.id && !t.target?.startsWith('page:') && !t.target?.startsWith('section:') ? LINKS.get(t.id) : undefined;
}
/** Phone-only apps open their own About page. */
export const aboutPath = (appId: string) => `${appId}/about/`;
// An app that declares its own `about` section (ad_ apps, #1335) renders it as a fleet page at the same URL: no generic About card.
export const ABOUT_IDS = [...LINKS.values()].filter((l) => l.kind === 'phone-only' && !APPS.find((a) => a.id === l.id)?.sections.some((s) => s.id === 'about')).map((l) => l.id);

/** TileStrip input: a separator rides on the previous tile (separatorAfter). */
export function tileItems(base: string, tiles: Tile[]): TileItem[] {
  const out: TileItem[] = [];
  for (const t of tiles ?? []) {
    if (t.separator || t.label === '|') { if (out.length) out[out.length - 1].separatorAfter = true; continue; }
    const l = linkOf(t);
    if (l) {
      const id = t.id ?? t.label;
      if (l.kind === 'phone-only') out.push({ id, label: t.label, icon: t.icon ?? null, href: joinBase(base, aboutPath(l.id)), external: false, grey: true });
      else out.push({ id, label: t.label, icon: t.icon ?? null, href: l.href, external: l.kind === 'container' || l.kind === 'external', mesh: !!l.mesh });
      continue;
    }
    const h = href(base, t.target ?? t.id);
    out.push({ id: t.id ?? t.label, label: t.label, icon: t.icon ?? null, href: h.href, external: h.external });
  }
  return out;
}

/** Phone > WebApps tiles: url -> an external link, no url -> an inert greyed tile (href null, grey). */
export function phoneAppGroups(): TileGroup[] {
  return phoneApps.groups.map((g) => ({
    title: g.title,
    tiles: g.tiles.map((t) => ({ id: t.id, label: t.label, icon: 'ic_world', href: t.url, external: !!t.url, grey: !t.url })),
  }));
}

export function cloudGroups(base: string): TileGroup[] {
  const cloud = sectionById.get('cloud');
  return (cloud?.tile_groups ?? []).map((g) => ({ title: g.title, tiles: tileItems(base, g.tiles) }));
}

const STATUS_BAR = statusBarJson.statusBar as unknown as StatusBarDecl;

export function shellData(base: string): ShellData {
  const seed = shellSeed as unknown as { app: { name: string; build: string; user: ShellData['app']['user'] }; statusBar: { left: { label: string; active: boolean }[]; right: { label: string; value: string }[] } };
  const left = seed.statusBar.left;
  const on = (l: string) => left.find((c) => c.label === l)?.active ?? false;
  return {
    bottom: SA.bottom_nav.map((id) => {
      const s = sectionById.get(id);
      return { id, label: s?.label ?? id, icon: (s?.icon as string) ?? 'ic_home', href: joinBase(base, id === 'home' ? '' : `${id}/`) };
    }),
    drawer: drawerRows(SA as never).map((r) => ({ ...r, href: r.target ? href(base, r.target).href : null })),
    homeHref: joinBase(base, ''),
    orbHref: href(base, SA.top_orbs?.right).href,
    islandHref: href(base, SA.dynamic_island_action).href,
    // The bar is RENDERED FROM build.json::home_status_bar (nav/status-bar.json): the elements, their cluster, order and
    // visibility are the declaration's; only the mock state (on/off, dots, values) is the replica's own.
    chips: stripChips(STATUS_BAR, {
      cellular: { on: on('5G'), dots: 4 }, wifi: { on: on('WiFi'), dots: 3 }, bluetooth: { on: on('BT'), dots: 1 },
      mesh: { on: on('WG'), dots: 0 }, kde: { on: on('KDE'), dots: 0 }, adb: { on: false, dots: -1 },
      data: { on: on('USB'), dots: -1 }, hotspot: { on: false, dots: -1 }, gps: { on: false, dots: 0 },
    }),
    right: stripRight(STATUS_BAR, Object.fromEntries(seed.statusBar.right.map((r) => [{ R: 'ram', S: 'storage', C: 'cpu' }[r.label] ?? r.label, r.value]))),
    battery: stripShowsBattery(STATUS_BAR) ? parseInt(seed.statusBar.right.find((r) => r.label === 'BAT')?.value ?? '84', 10) : 0,
    app: { name: seed.app.name, build: seed.app.build, stamp: 'web mimic · #1320', user: seed.app.user },
  };
}

/** NavDecl: a page's label defaults to its id (o.text("label", id)). */
const labelOf = (p: { id: string; label?: string }) => p.label ?? p.id;
const visible = (pages: Page[] | undefined) => (pages ?? []).filter((p) => !p.hidden);

function tabsOf(base: string, prefix: string, pages: Page[]): Tab[] {
  return visible(pages).map((p) => ({
    id: p.id,
    label: labelOf(p),
    href: p.action ? href(base, p.action).href : joinBase(base, `${prefix}${p.id}/`),
    action: !!(p.action || p.is_action),
    separatorBefore: !!p.separator_before,
  }));
}

export type StackCardData = { title: string; subtitle: string; rows: [string, string][]; caption: string; href: string | null; planned?: boolean; mesh?: boolean; external?: boolean };
export type ItemRow = { title: string; subtitle: string; meta: string; href: string | null; lead: string };
export type Body = {
  cube?: boolean;
  groups?: TileGroup[];
  quickmarks?: boolean;
  tiles?: TileItem[];
  wrap?: boolean;
  stack?: StackCardData[];
  items?: ItemRow[];
  viewType?: string;
  note?: string;
  empty?: { title: string | null; caption: string };
};

type ContentPage = { id: string; label?: string; view?: { type?: string; note?: string; emptyTitle?: string; emptyBody?: string }; items?: { title: string; subtitle?: string; meta?: string; target?: string }[]; tiles?: Tile[]; stack?: Record<string, unknown>[] };
function contentPage(sectionId: string, pageId: string): ContentPage | undefined {
  const sec = (content as { sections: Record<string, { pages: ContentPage[] }> }).sections[sectionId];
  const corePage = (core as unknown as { sections: Record<string, { pages: ContentPage[] }> }).sections[sectionId];
  return sec?.pages.find((p) => p.id === pageId) ?? corePage?.pages.find((p) => p.id === pageId);
}

function stackCards(base: string, declared: { kind?: string; title: string; subtitle?: string; url?: string; planned?: boolean; note?: string }[] | undefined, seed: Record<string, unknown>[] | undefined): StackCardData[] {
  const out: StackCardData[] = [];
  for (const c of (declared ?? []) as { kind?: string; title: string; subtitle?: string; url?: string; planned?: boolean; note?: string }[]) {
    // kind=entry (Cloud > Lnktree pages, #1331): title, one-line description and the url gen-navdata resolved from the declared
    // source; an entry with no url is planned: greyed, with its short note, nothing to open.
    if (c.kind === 'entry') {
      out.push({ title: c.title, subtitle: c.subtitle ?? '', rows: [], caption: c.url ? '' : (c.note ?? 'Planned'), href: c.url ?? null, planned: !c.url });
      continue;
    }
    if (c.kind === 'section_title') { out.push({ title: c.title, subtitle: '', rows: [], caption: '', href: null }); continue; }
    const s = (seed ?? []).find((x) => x.title === c.title || (c.kind && x.kind === c.kind));
    out.push({ title: c.title, subtitle: c.subtitle ?? (s?.subtitle as string) ?? '', rows: ((s?.rows as unknown[]) ?? []).filter((r): r is [string, string] => Array.isArray(r) && typeof r[0] === 'string').map((r) => [r[0], String(r[1] ?? '')]),
      caption: (s?.caption as string) ?? 'Live on the device: this card reads phone or fleet state a browser cannot reach.', href: href(base, s?.target as string).href });
  }
  return out;
}

type AppEntry = { kind?: string; title?: string; subtitle?: string; url?: string; planned?: boolean; note?: string; page?: string };
/** #1539 FinTerm page kinds: drawn on the web (a page of its own) or only in the APK (live delayed quotes; the web page says so). */
const WEB_PAGE_KINDS = ['pm_table', 'cb_table'];
const APP_ONLY_KINDS = ['quote_board', 'futures_board', 'hedge_calc'];
/**
 * The page body of a Lnktree app section (#1335): the app's own ui.stacks[<section>] entries (apps-ui.json, GENERATED), each a card with ONE target.
 * An `entry` opens the URL gen-navdata resolved from its declared source (greyed "planned" when it has none). When the app's link says
 * `entries_open_app` (FinTerm) every dashboard entry opens that link, the app's own web service (the terminal): a container link is the private
 * mesh URL (lock badge, new tab), never a public host. Kinds the web cannot show (holdings kept on the phone) are greyed. null = not a stack page.
 */
export function appStack(appId: string, sectionId: string | null): StackCardData[] | null {
  const app = APPS.find((a) => a.id === appId);
  const l = LINKS.get(appId);
  const list = (appsUi.apps as Record<string, { stacks?: Record<string, AppEntry[]> }>)[appId]?.stacks?.[sectionId ?? ''];
  if (!app || !list) return null;
  const own = l?.entries_open_app && l.href ? l : null;
  const cards: StackCardData[] = [];
  for (const e of list) {
    if (e.kind === 'section_title') { cards.push({ title: e.title ?? '', subtitle: '', rows: [], caption: '', href: null }); continue; }
    if (e.kind === 'about') {
      if (!l || l.kind === 'phone-only') return null;
      cards.push({ title: app.name, subtitle: whatItDoes(app as never), rows: [], caption: '', href: own?.href ?? null, mesh: !!own?.mesh, external: own ? own.kind !== 'webapp' : false });
      continue;
    }
    // FinTerm (#1342): an entry opens its own web dashboard page under the app's webapp link (generated finterm.json), never the container
    const dash = e.kind === 'dashboard' && own?.kind === 'webapp' ? FINTERM.dashboards.find((d) => d.tab === sectionId && d.entry === e.title) : undefined;
    if (dash && own) { cards.push({ title: e.title ?? '', subtitle: e.subtitle ?? '', rows: [], caption: '', href: `${own.href}${dash.tab}/${dash.slug}/`, mesh: false, external: false }); continue; }
    if (e.kind === 'dashboard' && own) { cards.push({ title: e.title ?? '', subtitle: e.subtitle ?? '', rows: [], caption: '', href: own.href, mesh: !!own.mesh, external: own.kind !== 'webapp' }); continue; }
    if (e.kind === 'dashboard' || e.kind === 'entry' || !e.kind) {
      const url = e.kind === 'dashboard' ? null : e.url ?? null;
      cards.push({ title: e.title ?? '', subtitle: e.subtitle ?? '', rows: [], caption: url ? '' : (e.note ?? 'Planned'), href: url, planned: !url, external: !!url });
      continue;
    }
    // #1539 a FinTerm table page (CB, PM) opens its own web page; a live-quote page (HG boards, hedge calculator, EQ price boards) is greyed: the APK draws it
    if (e.kind && WEB_PAGE_KINDS.includes(e.kind) && e.page && own?.kind === 'webapp') { cards.push({ title: e.title ?? '', subtitle: e.subtitle ?? '', rows: [], caption: '', href: `${own.href}${sectionId}/${e.page}/`, mesh: false, external: false }); continue; }
    if (e.kind && APP_ONLY_KINDS.includes(e.kind)) { cards.push({ title: e.title ?? '', subtitle: e.subtitle ?? '', rows: [], caption: 'Live delayed quotes: drawn in the Android app.', href: null, planned: true }); continue; }
    if (e.kind === 'holdings') { cards.push({ title: e.title ?? '', subtitle: e.subtitle ?? '', rows: [], caption: 'Kept on the phone: a browser cannot reach it.', href: null, planned: true }); continue; }
    return null; // sources and other device-only kinds: the generic body
  }
  // the declared backend of the app's webapp link (FinTerm: fin-api, private mesh): its own card with the lock badge, new tab
  if (own?.backend && cards.some((c) => c.href)) cards.push({ title: own.backend.label, subtitle: 'The FinceptTerminal backend (fin-api): REST and WebSocket, reachable on the private mesh only', rows: [], caption: '', href: own.backend.href, mesh: own.backend.mesh, external: true });
  return cards;
}

export function pageBody(base: string, section: Section, page: Page | null): Body {
  if (!page) return { empty: { title: section.label, caption: 'Open this section on the phone.' } };
  if (section.id === 'cloud' && page.id === 'apps') return { groups: cloudGroups(base), quickmarks: true };
  // Cloud > WebApps: in the APK this tab IS this site (?embed=1 = the apps grid); here it is that grid plus the fleet's live
  // Kotlin/Wasm pages as portals (kept until each app's mimic ships, #1320 decision 4).
  if (section.id === 'cloud' && page.id === 'webapps') {
    const wasm = APPS.filter((a) => a.wasm).map((a) => ({ id: `wasm-${a.id}`, label: a.label, icon: a.icon, href: joinBase(base, `${a.id}/portal/`) }));
    return { groups: [...cloudGroups(base), { title: 'Kotlin/Wasm pages', tiles: wasm }] };
  }
  // Phone > WebApps (#1466): the phone apps' web versions (src/apps/phone-apps/phone-apps.json, GENERATED from the Android data). A tap opens the
  // site (in the APK's embedded browser through the link rules); an app with no known web URL is a greyed, disabled tile.
  if (section.id === 'phone' && page.id === 'webapps') return { groups: phoneAppGroups() };
  if (section.id === 'cloud' && page.id === 'lnktree') {
    const groups = (linktree as { groups: { label?: string; title?: string; tiles: { label: string; icon?: string; href?: string }[] }[] }).groups.map((g) => ({
      title: g.title ?? g.label ?? '', tiles: g.tiles.map((t) => ({ id: t.label, label: t.label, icon: t.icon ?? null, href: t.href ?? null, external: !!t.href })),
    }));
    return { groups };
  }
  if (page.mirror_section) {
    const m = sectionById.get(page.mirror_section);
    return { tiles: visible(m?.pages).map((p) => ({ id: p.id, label: p.label, icon: p.icon ?? null, href: p.action ? href(base, p.action).href : joinBase(base, `${m!.id}/${p.id}/`) })), wrap: true };
  }
  const tiles = section[`tiles_${page.id}`] as Tile[] | undefined;
  const stack = section[`stack_${page.id}`] as { kind?: string; title: string; subtitle?: string }[] | undefined;
  const c = contentPage(section.id, page.id);
  const body: Body = {};
  if (tiles?.length || c?.tiles?.length) body.tiles = tileItems(base, (tiles?.length ? tiles : c?.tiles) ?? []);
  if (body.tiles && section.id === 'phone') body.wrap = true;
  if (stack?.length || c?.stack?.length) body.stack = stackCards(base, stack?.length ? stack : (c?.stack as never), c?.stack);
  if (c?.items?.length) {
    body.items = c.items.map((it) => ({ title: it.title, subtitle: it.subtitle ?? '', meta: it.meta ?? '', href: href(base, it.target).href, lead: it.title.replace(/^[#@]/, '').slice(0, 1).toUpperCase() }));
    body.viewType = c.view?.type ?? 'list';
    body.note = c.view?.note;
  }
  if (!body.tiles && !body.stack && !body.items) body.empty = { title: c?.view?.emptyTitle ?? null, caption: c?.view?.emptyBody ?? 'Live on the device: this page reads phone or fleet state a browser cannot reach.' };
  return body;
}

export type SuperAppView = {
  kind: 'superapp'; section: string; sectionLabel: string; atHome: boolean; backHref: string | null;
  tabs: Tab[]; tabSelected: string | null; subtabs: Tab[]; subSelected: string | null; tabHrefs: string[];
  title: string; body: Body; detail: Body | null; path: string;
};
export type FleetTab = { id: string; label: string; icon: string; href: string | null };
export type AppView = {
  kind: 'app'; app: { id: string; name: string; label: string; icon: string | null; kind: string };
  sections: { id: string; label: string; icon: string; href: string }[]; section: string | null; sectionLabel: string;
  page: string | null; sub: string | null;
  tabs: FleetTab[]; tabSelected: string | null; subtabs: FleetTab[]; subSelected: string | null; title: string; path: string; portal: boolean;
  listDetail: boolean; background: string;
  crumbs: { label: string; href: string | null }[]; related: { id: string; label: string; href: string | null; indent: number; selected: boolean }[];
  aiHref: string | null; profileHref: string | null; configsHref: string | null;
  /** build.json::ui.nav_ui of the app: the nav mode (classic / clean) and scroll-hide it starts in. */
  navUi: { mode?: string; scroll_hide?: boolean } | null;
  portalInfo: { url: string; service: string; embeddable: boolean; serviceHref: string } | null;
  wasmHref: string | null; portalHref: string | null;
  mode: string; groups: { id: string; label: string; pages: FleetTab[] }[];
  sideItems: { id: string; label: string; icon: string; depth: number; heading: boolean; href: string | null }[];
  data?: unknown;
};

function back(base: string, parts: string[], section: Section): string | null {
  if (parts.length <= 1) return joinBase(base, '');
  const first = visible(section.pages)[0]?.id;
  if (parts.length > 2) return joinBase(base, `${parts[0]}/${parts[1]}/`);
  return parts[1] === first ? joinBase(base, '') : joinBase(base, `${parts[0]}/${first}/`);
}

export function superappView(base: string, path: string): SuperAppView | null {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) {
    return { kind: 'superapp', section: 'home', sectionLabel: 'Home', atHome: true, backHref: null, tabs: [], tabSelected: null, subtabs: [], subSelected: null, tabHrefs: [],
      title: 'Cloud SuperApp', body: { cube: true, groups: cloudGroups(base) }, detail: null, path: '' };
  }
  const section = sectionById.get(parts[0]);
  if (!section) return null;
  const pages = section.pages ?? [];
  const page = parts[1] ? pages.find((p) => p.id === parts[1]) ?? null : visible(pages)[0] ?? null;
  if (parts[1] && !page) return null;
  const sub = page?.pages?.length ? (parts[2] ? page.pages.find((p) => p.id === parts[2]) ?? null : visible(page.pages)[0] ?? null) : null;
  if (parts[2] && !sub) return null;
  const tabs = tabsOf(base, `${section.id}/`, pages);
  return {
    kind: 'superapp', section: section.id, sectionLabel: section.label, atHome: false, backHref: back(base, parts, section),
    tabs, tabSelected: page?.id ?? null,
    subtabs: page?.pages?.length ? tabsOf(base, `${section.id}/${page.id}/`, page.pages) : [], subSelected: sub?.id ?? null,
    tabHrefs: tabs.map((t) => t.href ?? ''),
    title: [page?.label, section.label].filter(Boolean).join(' · '),
    body: pageBody(base, section, sub ?? page), detail: null, path,
  };
}

const lists = overlay.list_detail as Record<string, string[]>;
const portals = overlay.portals as Record<string, { url: string; service: string; embeddable: boolean }>;
type APage = Page & { background?: string };
function fleetTabs(base: string, prefix: string, pages: APage[]): FleetTab[] {
  return (pages ?? []).filter((p) => !p.hidden).map((p) => ({ id: p.id, label: labelOf(p), icon: p.icon ?? 'tab', href: p.action ? href(base, p.action).href : joinBase(base, `${prefix}${p.id}/`) }));
}
/** id -> site path of every page of [section] (depth-first), for the title dropdown's entries. */
function pagePaths(prefix: string, pages: APage[] | undefined, out = new Map<string, string>()) {
  for (const p of pages ?? []) { out.set(p.id, `${prefix}${p.id}/`); pagePaths(`${prefix}${p.id}/`, p.pages, out); }
  return out;
}
export function appView(base: string, path: string): AppView | null {
  const parts = path.split('/').filter(Boolean);
  const app = APPS.find((a) => a.id === parts[0]);
  if (!app) return null;
  const portal = parts[1] === 'portal';
  const secId = portal ? null : parts[1] ?? app.default_section;
  const section = (secId ? app.sections.find((s) => s.id === secId) ?? null : null) as (APage | null);
  if (parts[1] && !portal && !section) return null;
  const page = section?.pages?.length ? (parts[2] ? section.pages.find((p) => p.id === parts[2]) ?? null : visible(section.pages)[0] ?? null) : null;
  if (parts[2] && !page) return null;
  const sub = page?.pages?.length ? (parts[3] ? page.pages.find((p) => p.id === parts[3]) ?? null : visible(page.pages)[0] ?? null) : null;
  if (parts[3] && !sub) return null;
  const order = app.bottom_nav.length ? app.bottom_nav : app.sections.map((s) => s.id);
  const secs = order.map((id) => app.sections.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
  // the first row: NavBarTopFirstRow's breadcrumb + dropdown, from the same declaration (titleHierarchy / titleNav)
  // the first crumb is the installed app's label (defaultAppName): build.json display_name
  let crumbs: AppView['crumbs'] = [{ label: app.name, href: joinBase(base, `${app.id}/`) }];
  let related: AppView['related'] = [];
  if (section) {
    const paths = pagePaths(`${app.id}/${section.id}/`, section.pages);
    const entryHref = (e: Entry) => e.action ? href(base, e.action).href : e.depth === 0 ? joinBase(base, `${app.id}/${e.id}/`) : paths.has(e.id) ? joinBase(base, paths.get(e.id)!) : null;
    const tn = titleNav(app.name, labelOf(section), titleHierarchy(section, (sub ?? page)?.id ?? null), secs);
    crumbs = tn.crumbs.map((c, i) => ({ label: c.label, href: i === 0 ? joinBase(base, `${app.id}/`) : c.target ? entryHref(c.target) : null }));
    related = tn.related.map((e) => ({ id: e.id, label: e.label, href: entryHref(e), indent: Math.max(0, e.depth - tn.currentDepth), selected: e.selected }));
  }
  const has = (id: string) => app.sections.some((s) => s.id === id);
  // NavDecl second-row modes: horizontal_two_rows = one row per group (rowGroups), vertical_side_menu = NavSideMenu items
  const sec = section as (APage & { nav_mode?: string; groups?: { id: string; label?: string; pages?: string[] }[] }) | null;
  const mode = sec?.nav_mode ?? 'horizontal_one_row';
  const tabsAll = sec ? fleetTabs(base, `${app.id}/${sec.id}/`, sec.pages ?? []).map((t, i) => ({ ...t, separatorBefore: !!(sec.pages ?? []).filter((p) => !p.hidden)[i]?.separator_before })) : [];
  const byId = new Map(tabsAll.map((t) => [t.id, t]));
  const named = new Set((sec?.groups ?? []).flatMap((g) => g.pages ?? []));
  const groups = sec ? [...(sec.groups ?? []).map((g) => ({ id: g.id, label: g.label ?? g.id, pages: (g.pages ?? []).map((id) => byId.get(id)).filter((t): t is FleetTab => !!t) })),
    ...(tabsAll.some((t) => !named.has(t.id)) ? [{ id: sec.id, label: labelOf(sec), pages: tabsAll.filter((t) => !named.has(t.id)) }] : [])] : [];
  const sideItems: AppView['sideItems'] = [];
  if (sec && mode === 'vertical_side_menu') {
    const walk = (prefix: string, pages: APage[] | undefined, depth: number) => { for (const p of pages ?? []) { sideItems.push({ id: p.id, label: labelOf(p), icon: p.icon ?? 'tab', depth, heading: false, href: p.action ? href(base, p.action).href : joinBase(base, `${prefix}${p.id}/`) }); walk(`${prefix}${p.id}/`, p.pages, depth + 1); } };
    if (sec.groups?.length) for (const g of groups) { sideItems.push({ id: `group:${g.id}`, label: g.label, icon: '', depth: 0, heading: true, href: null }); for (const t of g.pages) sideItems.push({ id: t.id, label: t.label, icon: t.icon, depth: 1, heading: false, href: t.href }); }
    else walk(`${app.id}/${sec.id}/`, sec.pages, 0);
  }
  const p = portals[app.id];
  return {
    kind: 'app',
    app: { id: app.id, name: app.name, label: app.label, icon: app.icon, kind: app.kind },
    sections: secs.map((s) => ({ id: s.id, label: labelOf(s), icon: s.icon ?? 'tab', href: joinBase(base, `${app.id}/${s.id}/`) })),
    section: section?.id ?? null, sectionLabel: section ? labelOf(section) : '', page: page?.id ?? null, sub: sub?.id ?? null,
    tabs: section ? fleetTabs(base, `${app.id}/${section.id}/`, section.pages ?? []) : [], tabSelected: page?.id ?? null,
    subtabs: page?.pages?.length ? fleetTabs(base, `${app.id}/${section!.id}/${page.id}/`, page.pages) : [], subSelected: sub?.id ?? null,
    title: [sub && labelOf(sub), page && labelOf(page), section && labelOf(section), app.label].filter(Boolean).join(' · '), path, portal,
    listDetail: !!section && (lists[app.id] ?? []).includes(section.id),
    background: section?.background ?? 'dark',
    crumbs, related,
    aiHref: has('ai') ? joinBase(base, `${app.id}/ai/`) : null,
    profileHref: app.id === 'cloud-account' ? null : joinBase(base, 'cloud-account/'),
    configsHref: has('configs') ? joinBase(base, `${app.id}/configs/`) : has('settings') ? joinBase(base, `${app.id}/settings/`) : null,
    portalInfo: p ? { ...p, serviceHref: joinBase(base, `${p.service}/`) } : null,
    mode, groups, sideItems,
    navUi: app.nav_ui ?? null,
    // the live Kotlin/Wasm page (published by the Pages repo at /cloud-web/apps/<slug>/) while the app has no mimic body
    wasmHref: app.wasm ? `/cloud-web/apps/${app.wasm}/` : null,
    portalHref: app.wasm || p ? joinBase(base, `${app.id}/portal/`) : null,
  };
}

export type AboutView = {
  kind: 'about'; app: { id: string; label: string; icon: string | null; what: string }; title: string; path: string;
  backHref: string; storeHref: string; gridHref: string;
};
/** What the app does, from nav.json (its build.json description): the first sentence, capped. */
function whatItDoes(a: App & { description?: string | null }): string {
  const d = (a.description ?? '').replace(/\s+/g, ' ').trim();
  if (!d) return `${a.label} is one of the apps of the cloudy APK fleet.`;
  const first = d.match(/^.{20,}?[.!?](?=\s|$)/)?.[0] ?? d;
  return first.length > 300 ? `${first.slice(0, 297).trimEnd()}...` : first;
}
/** The About text of a phone-only app that declares its own `about` section (it renders inside the fleet shell, same URL), else null. */
export function declaredAbout(appId: string): { what: string } | null {
  const app = APPS.find((a) => a.id === appId);
  if (!app || LINKS.get(appId)?.kind !== 'phone-only' || !app.sections.some((s) => s.id === 'about')) return null;
  return { what: whatItDoes(app as never) };
}
/** /<app>/about/ : the About page of a phone-only app (#1326). */
export function aboutView(base: string, path: string): AboutView | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[1] !== 'about' || !ABOUT_IDS.includes(parts[0])) return null;
  const app = APPS.find((a) => a.id === parts[0]);
  if (!app) return null;
  return {
    kind: 'about', app: { id: app.id, label: app.label, icon: app.icon, what: whatItDoes(app as never) },
    title: `About ${app.label}`, path, backHref: joinBase(base, ''), gridHref: joinBase(base, ''), storeHref: joinBase(base, aboutPath('cloud-store')),
  };
}

/** Every prerendered path except home ('') and the explicit routes; plus the About page of every phone-only app. */
export const ENTRY_PATHS = [...ROUTES.map((r) => r.path).filter((p) => p !== ''), ...ABOUT_IDS.map(aboutPath)];

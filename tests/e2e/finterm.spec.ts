import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { shot } from './shot';
import { BASE } from './helpers';

// #1342: the web FinTerm. Every address, tab, dashboard and source is READ from the generated declarations (finterm.json, app-links.json); none is typed here.
// The browser has no network in these tests except what a test routes in: a panel is data (a routed answer) or a dashed placeholder with its reason.
const J = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const fin = J('packages/cloudy-ui/nav/finterm.json') as {
  app_id: string; mesh: Record<string, string>;
  stacks: Record<string, { kind: string; title: string; dashboard?: string }[]>;
  sources: { id: string; name: string; endpoint: string; fleet_endpoint?: string; paths?: Record<string, string> }[];
  dashboards: { id: string; slug: string; tab: string; entry: string; panels: { id: string; source: string; fetch?: unknown; placeholder?: unknown; view: string }[] }[];
};
const link = (J('packages/cloudy-ui/nav/app-links.json').links as { id: string; href: string; backend: { href: string } }[]).find((l) => l.id === fin.app_id)!;
const src = (id: string) => fin.sources.find((s) => s.id === id)!;
const LOCAL = /^http:\/\/127\.0\.0\.1:/;

/** Offline except for what `answer` returns for a host: an unrouted external request fails like a CORS-blocked or off-mesh one. */
async function net(page: Page, answer: (url: URL) => { status?: number; body: string; type?: string } | null = () => null) {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (LOCAL.test(u)) return route.continue();
    const a = answer(new URL(u));
    if (!a) return route.abort();
    return route.fulfill({ status: a.status ?? 200, contentType: a.type ?? 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: a.body });
  });
}
const settle = (page: Page) => expect(page.locator('[data-state="loading"]')).toHaveCount(0, { timeout: 15_000 });

test('each FinTerm tab lists its dashboards as web pages, plus the Backend (mesh) link with the lock badge', async ({ page }, info) => {
  await net(page);
  for (const tab of ['fi', 'eq', 'ex', 'nw', 'pm']) {
    await page.goto(`${BASE}/${fin.app_id}/${tab}/`);
    const entries = fin.stacks[tab];
    const cards = page.getByTestId('stack-card');
    await expect(cards, tab).toHaveCount(entries.length + 1);
    for (const [i, e] of entries.entries()) {
      if (e.kind !== 'dashboard') { await expect(cards.nth(i).locator('a.open'), `${tab}/${e.title}`).toHaveCount(0); continue; }
      const d = fin.dashboards.find((x) => x.id === e.dashboard)!;
      const open = cards.nth(i).locator('a.open');
      await expect(open, `${tab}/${e.title}`).toHaveAttribute('href', `${BASE}/${fin.app_id}/${tab}/${d.slug}/`);
      await expect(open).not.toHaveAttribute('target', '_blank');
      await expect(open.getByTestId('mesh-badge')).toHaveCount(0);
    }
    const back = cards.nth(entries.length).locator('a.open');
    await expect(cards.nth(entries.length)).toContainText('Backend (mesh)');
    await expect(back).toHaveAttribute('href', link.backend.href);
    await expect(back).toHaveAttribute('target', '_blank');
    await expect(back.getByTestId('mesh-badge')).toBeVisible();
    expect(new URL(link.backend.href).host).toMatch(/\.mesh\.diegonmarcos\.com$|^c3-pvt\.diegonmarcos\.com$/);
    if (tab === 'fi') await shot(page, info, 'finterm-fi-tab');
  }
  await page.goto(`${BASE}/${fin.app_id}/my-pm/`);
  await expect(page.locator('[data-testid="stack-card"] a.open')).toHaveCount(0);
  await expect(page.getByTestId('stack-card')).toHaveAttribute('data-planned', 'true');
});

/** A panel fed (also) by a declared data file (`asset:` source, e.g. the central bank calendar): it renders offline. */
const declaredFed = (p: { source: string; fetch?: any }) => [p.source, ...((p.fetch?.fallbacks ?? []) as { source: string }[]).map((f) => f.source)].some((id) => src(id)?.endpoint === 'asset:');

test('each of the 32 dashboards renders: every panel is data or a placeholder that says why', async ({ page }) => {
  expect(fin.dashboards).toHaveLength(32);
  await net(page);
  for (const d of fin.dashboards) {
    await page.goto(`${BASE}/${fin.app_id}/${d.tab}/${d.slug}/`);
    await expect(page.getByTestId('finterm-dash'), d.id).toHaveAttribute('data-dash', d.id);
    await settle(page);
    const panels = page.getByTestId('finterm-panel');
    // drawn panels (UI spec 3, engine drawOrder): a segment_of panel lives inside its card, key rows come last
    const shown = (d.panels as any[]).filter((p) => !p.segment_of);
    const live = (p: any) => !!p.fetch || (!p.placeholder && p.view === 'alloc');
    const drawn = [...shown.filter(live), ...shown.filter((p) => !live(p))];
    await expect(panels, d.id).toHaveCount(drawn.length);
    for (const [i, p] of drawn.entries()) {
      const panel = panels.nth(i);
      const state = (await panel.getAttribute('data-state'))!;
      expect(state, `${d.id}/${p.id}`).toMatch(/^(data|placeholder-(keyed|user-mapped|no-connector|blocked))$/);
      if (state === 'data') { await expect(panel.getByTestId('finterm-chart').or(panel.getByTestId('finterm-table')).or(panel.getByTestId('finterm-calendar')).or(panel.getByTestId('finterm-quotes')), `${d.id}/${p.id}`).not.toHaveCount(0); }
      else { await expect(panel.getByTestId('finterm-note'), `${d.id}/${p.id}`).not.toBeEmpty(); await expect(panel.getByTestId('finterm-placeholder')).toBeVisible(); }
      if (p.fetch) expect(state, `${d.id}/${p.id}: offline fetch panel`).toBe(declaredFed(p) ? 'data' : 'placeholder-blocked');
      await expect(panel.getByTestId('finterm-attr'), `${d.id}/${p.id}`).toContainText(src(p.source).name);
    }
  }
});

test('a blocked public source is one compact row: via your FinTerminal server, mesh only / CORS (no proxy)', async ({ page }) => {
  await net(page);
  await page.goto(`${BASE}/${fin.app_id}/fi/yield-curves/`);
  await settle(page);
  const ust = page.locator('[data-panel="ust"]');
  await expect(ust).toHaveAttribute('data-state', 'placeholder-blocked');
  await expect(ust.getByTestId('finterm-note')).toContainText('Mesh only / CORS');
  await expect(ust.getByTestId('finterm-note')).toContainText('Via your FinTerminal server');
  await expect(ust.locator('td')).toHaveCount(0); // no table of dashes
});

test('FI Yield Curves: FRED is cors false so the web goes straight to DBnomics; chart, table, last updated and attribution', async ({ page }, info) => {
  const fred = src('fred');
  const dbn = src('dbnomics');
  const asked: string[] = [];
  await net(page, (u) => {
    asked.push(u.host);
    if (u.host !== new URL(dbn.endpoint).host) return null;
    const code = u.pathname.split('/').pop()!;
    return { type: 'application/json', body: JSON.stringify({ series: { docs: [{ series_code: code, series_name: 'x', period: ['2026-10-27', '2026-10-28', '2026-10-29'], value: [4.1, 4.25, 'NA'] }] } }) };
  });
  await page.goto(`${BASE}/${fin.app_id}/fi/yield-curves/`);
  await settle(page);
  const ust = page.locator('[data-panel="ust"]');
  await expect(ust).toHaveAttribute('data-state', 'data');
  await expect(ust.getByTestId('finterm-chart')).toBeVisible();
  await expect(ust.getByTestId('finterm-table').locator('tbody tr')).toHaveCount(11);
  await expect(ust.getByTestId('finterm-asof')).toHaveText('2026-10-28');
  // one footer line: "● 09:15 · as of 2026-10-28 · FRED ↗ · via DBnomics" (the declared source is attributed, the route that served it named)
  await expect(ust.getByTestId('finterm-meta')).toContainText('as of 2026-10-28');
  await expect(ust.getByTestId('finterm-meta')).toContainText(`via ${dbn.name}`);
  // terminal chart card: gridlines + right-edge labels, and the table pins its header and sorts on tap
  await expect(ust.locator('[data-testid="finterm-table"] th').first()).toBeVisible();
  expect(asked).not.toContain(new URL(fred.endpoint).host);
  await expect(ust.getByTestId('finterm-attr')).toContainText(fred.name);
  // the keyed panel of the same dashboard stays dashed
  await expect(page.locator('[data-panel="sovereigns"]')).toHaveAttribute('data-state', /placeholder-/);
  await shot(page, info, 'finterm-yield-curves');
});

test('on the mesh fin-api serves first: the topic answer wins and the page says so', async ({ page }) => {
  const api = src('cloud_fincept');
  const base = new URL(fin.mesh[api.fleet_endpoint!]);
  const asked: string[] = [];
  await net(page, (u) => {
    asked.push(u.host);
    if (u.host !== base.host) return null;
    if (u.pathname === api.paths!.health) return { body: '{"status":"ok"}', type: 'application/json' };
    // the model panels of the same dashboard ask the container's /v1 surface too (#1351): only the topic peeks are answered here
    const m = /econ:fred:([^/]+)/.exec(decodeURIComponent(u.pathname));
    if (!m) return null;
    const id = m[1];
    return { body: JSON.stringify({ series_id: id, observations: [{ date: '2099-01-01', value: 3.5 }] }), type: 'application/json' };
  });
  await page.goto(`${BASE}/${fin.app_id}/fi/yield-curves/`);
  await settle(page);
  const ust = page.locator('[data-panel="ust"]');
  await expect(ust).toHaveAttribute('data-state', 'data');
  await expect(ust.getByTestId('finterm-meta')).toContainText(`via ${api.name}`);
  expect(asked).not.toContain(new URL(src('fred').endpoint).host);
});

// #1351 mini Bloomberg: the economic calendar (top priority), the market monitor tiles, the watchlist and alert rules.
test('NW Economic Calendar: off the mesh the declared central bank decisions fill the calendar, grouped by day', async ({ page }, info) => {
  await net(page);
  const cb = (fin as unknown as { declared: Record<string, { banks: { events: { ts: string; title: string }[] }[] }> }).declared['central-banks.json'];
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10);
  const due = cb.banks.flatMap((b) => b.events).filter((e) => e.ts.slice(0, 10) >= new Date(Date.now() - 86400e3).toISOString().slice(0, 10) && e.ts.slice(0, 10) <= horizon);
  await page.goto(`${BASE}/${fin.app_id}/nw/economic-calendar/`);
  await settle(page);
  const week = page.locator('[data-panel="week"]');
  await expect(week).toHaveAttribute('data-state', 'data');
  await expect(week.getByTestId('finterm-calendar')).toBeVisible();
  if (due.length) await expect(week.getByTestId('finterm-calendar')).toContainText(due[0].title);
  else await expect(week).toContainText('No event in this window.');
  // the BLS prints are a public CORS-open source: offline they are a blocked placeholder, never an empty table
  await expect(page.locator('[data-panel="prints"]')).toHaveAttribute('data-state', 'placeholder-blocked');
  expect(today <= horizon).toBe(true);
  await shot(page, info, 'finterm-economic-calendar');
});

test('NW Central Bank Calendar lists every declared bank and the Polymarket odds as bars', async ({ page }, info) => {
  const poly = src('polymarket');
  await net(page, (u) => (u.host === new URL(poly.endpoint).host ? { type: 'application/json', body: JSON.stringify([{ title: 'Fed decision in December?', endDate: '2026-12-10T00:00:00Z', markets: [
    { groupItemTitle: '25 bps decrease', slug: 'cut', outcomePrices: '["0.62", "0.38"]' }, { groupItemTitle: 'No change', slug: 'hold', outcomePrices: '["0.36", "0.64"]' }] }]) } : null));
  await page.goto(`${BASE}/${fin.app_id}/nw/central-bank-calendar/`);
  await settle(page);
  await expect(page.locator('[data-panel="meetings"]')).toHaveAttribute('data-state', 'data');
  const implied = page.locator('[data-panel="implied"]');
  await expect(implied).toHaveAttribute('data-state', 'data');
  await expect(implied.getByTestId('finterm-chart')).toBeVisible();
  await expect(implied.getByTestId('finterm-table')).toContainText('62.00');
  await shot(page, info, 'finterm-central-banks');
});

test('FI Market Monitor: Treasury, NY Fed, ECB (Frankfurter) and Coinbase answer the browser; the tiles show last and change', async ({ page }, info) => {
  const host = (id: string) => new URL(src(id).endpoint).host;
  const xml = (d: string, two: number, ten: number, thirty: number) => `<m:properties><d:NEW_DATE m:type="Edm.DateTime">${d}T00:00:00</d:NEW_DATE><d:BC_2YEAR m:type="Edm.Double">${two}</d:BC_2YEAR><d:BC_10YEAR m:type="Edm.Double">${ten}</d:BC_10YEAR><d:BC_30YEAR m:type="Edm.Double">${thirty}</d:BC_30YEAR></m:properties>`;
  await net(page, (u) => {
    if (u.host === host('treasury_xml')) return { type: 'application/xml', body: `<feed>${xml('2026-10-29', 3.5, 4.1, 4.7)}${xml('2026-10-30', 3.52, 4.15, 4.71)}</feed>` };
    if (u.host === host('nyfed')) return { type: 'application/json', body: JSON.stringify({ refRates: [{ effectiveDate: '2026-10-29', type: 'SOFR', percentRate: 3.91 }, { effectiveDate: '2026-10-29', type: 'EFFR', percentRate: 3.88 }] }) };
    if (u.host === host('frankfurter')) return { type: 'application/json', body: JSON.stringify({ base: 'USD', rates: { '2026-10-29': { EUR: 0.89, JPY: 156 }, '2026-10-30': { EUR: 0.9, JPY: 157.25 } } }) };
    if (u.host === host('coinbase')) return { type: 'application/json', body: JSON.stringify({ open: '100000', last: '101000' }) };
    return null;
  });
  await page.goto(`${BASE}/${fin.app_id}/fi/market-monitor/`);
  await settle(page);
  const ust = page.locator('[data-panel="ust"]');
  await expect(ust).toHaveAttribute('data-state', 'data');
  await expect(ust.getByTestId('finterm-quotes')).toContainText('UST 10Y');
  await expect(ust.getByTestId('finterm-quotes')).toContainText('+5.0');
  await expect(page.locator('[data-panel="funding"]').getByTestId('finterm-quotes')).toContainText('3.91');
  await expect(page.locator('[data-panel="fx"]').getByTestId('finterm-quotes')).toContainText('EUR per USD');
  await expect(page.locator('[data-panel="crypto"]').getByTestId('finterm-quotes')).toContainText('+1.00');
  // the Market Monitor declares no equity panel any more (df55fd5): rates, funding, FX, crypto and the next events only
  await expect(page.locator('[data-panel="equity"]')).toHaveCount(0);
  await shot(page, info, 'finterm-market-monitor');
});

test('EQ Watchlist & Alerts: symbols and rules are kept in this browser; a bad entry is refused', async ({ page }) => {
  await net(page);
  await page.goto(`${BASE}/${fin.app_id}/eq/watchlist/`);
  const box = page.getByTestId('finterm-userlists');
  await expect(box).toBeVisible();
  const entry = page.getByTestId('finterm-entry');
  await entry.fill('nvda'); await entry.press('Enter');
  await entry.fill('NVDA > 120'); await entry.press('Enter');
  await entry.fill('events >= 3'); await entry.press('Enter');
  await entry.fill('not a rule !'); await entry.press('Enter');
  await expect(box).toContainText('Not a symbol or a rule.');
  await page.reload();
  await expect(page.getByTestId('finterm-userlists')).toContainText('NVDA');
  await expect(page.getByTestId('finterm-userlists')).toContainText('NVDA > 120.00');
  await expect(page.getByTestId('finterm-userlists')).toContainText('events >= 3');
});

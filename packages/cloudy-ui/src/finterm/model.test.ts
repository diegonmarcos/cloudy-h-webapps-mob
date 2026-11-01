import { describe, expect, it } from 'vitest';
import { FINTERM } from './catalog';
import fixture from './engine-fixture.json';
import {
  FetchError, alertRule, alertSymbol, apiRoute, eventHits, eventsIn, feedBls, feedFrankfurter, feedJsonstat, feedSdmx, feedTreasury, loadPanel, parseFeed, priceHits, ruleText,
  type Ctx, type Dashboard, type Ev,
} from './engine';

// #1351 the web model panels (port of Feeds.kt / Engine.model / Alerts.kt): parsers, route order, merge, CORS skip, window, watchlist, alerts.
// #1399 + the removed Market Monitor's engine panels as a test fixture (engine-fixture.json)
const dash = (id: string) => [...FINTERM.dashboards, ...(fixture.dashboards as unknown as Dashboard[])].find((d) => d.id === id) as Dashboard;
const panel = (d: string, p: string) => dash(d).panels.find((x) => x.id === p)!;
const src = (id: string) => FINTERM.sources.find((s) => s.id === id)!;
const fin = src('cloud_fincept');
const MESH = FINTERM.mesh[fin.fleet_endpoint!];
const TODAY = '2026-10-30';

function harness(answer: (url: string) => string | null, meshUp = false, user?: Ctx['user'], nowUtc = '2026-10-30T12:00Z') {
  const asked: string[] = [];
  const ctx: Ctx = {
    today: TODAY, sources: FINTERM.sources, mesh: FINTERM.mesh, user, nowUtc,
    reachable: async () => meshUp,
    get: async (url) => {
      asked.push(url);
      if (url.startsWith('asset:')) return JSON.stringify((FINTERM as unknown as { declared: Record<string, unknown> }).declared[url.slice(6)]);
      const a = answer(url);
      if (a === null) throw new FetchError('blocked', 'Failed to fetch');
      return a;
    },
  };
  return { ctx, asked };
}

describe('model parsers (fixtures cut from the live answers)', () => {
  it('Treasury XML: the last day, the day before as prev', () => {
    const day = (d: string, v: string) => `<m:properties><d:NEW_DATE m:type="Edm.DateTime">${d}T00:00:00</d:NEW_DATE><d:BC_10YEAR m:type="Edm.Double">${v}</d:BC_10YEAR></m:properties>`;
    const p = feedTreasury(day('2026-10-30', '4.15') + day('2026-10-29', '4.10')).points[0];
    expect(p).toMatchObject({ key: 'BC_10YEAR', value: 4.15, prev: 4.1, date: '2026-10-30' });
    expect(p.hist).toEqual([4.1, 4.15]); // every day of the month, oldest first: the sparkline
  });
  it('SDMX-JSON top level (ECB) or under data (OECD): one point per key-dimension id', () => {
    const inner = { structure: { dimensions: { series: [{ id: 'FREQ', values: [{ id: 'B' }] }, { id: 'K', values: [{ id: 'A' }, { id: 'Z' }] }], observation: [{ values: [{ id: '2026-10-30' }, { id: '2026-10-29' }] }] } },
      dataSets: [{ series: { '0:0': { observations: { 0: [2.1], 1: [2.0] } }, '0:1': { observations: { 0: [3.1], 1: [3.0] } } } }] };
    for (const body of [inner, { data: inner }]) {
      const g = feedSdmx(JSON.stringify(body), 'K');
      expect(g.points.map((p) => [p.key, p.value, p.prev, p.date])).toEqual([['A', 2.1, 2.0, '2026-10-30'], ['Z', 3.1, 3.0, '2026-10-30']]);
    }
  });
  it('JSON-stat: the flat index walks the dimension sizes, last-dimension fastest', () => {
    const body = { id: ['geo', 'time'], size: [2, 2], dimension: { geo: { category: { index: { EA: 0, DE: 1 } } }, time: { category: { index: { '2026-08': 0, '2026-09': 1 } } } }, value: { 0: 2.0, 1: 2.1, 2: 2.3, 3: 2.4 } };
    expect(feedJsonstat(JSON.stringify(body), 'geo').points.map((p) => [p.key, p.value, p.prev])).toEqual([['EA', 2.1, 2.0], ['DE', 2.4, 2.3]]);
  });
  it('BLS: the newest period first, a "-" value skipped', () => {
    const p = feedBls(JSON.stringify({ Results: { series: [{ seriesID: 'LNS14000000', data: [{ year: '2026', period: 'M08', value: '4.3' }, { year: '2026', period: 'M09', value: '4.2' }, { year: '2026', period: 'M07', value: '-' }] }] } })).points[0];
    expect(p).toMatchObject({ value: 4.2, prev: 4.3, date: '2026-09' });
  });
  it('Frankfurter range: the last fix and the one before', () => {
    const p = feedFrankfurter(JSON.stringify({ rates: { '2026-10-30': { EUR: 0.9 }, '2026-10-28': { EUR: 0.88 }, '2026-10-29': { EUR: 0.89 } } })).points[0];
    expect(p).toMatchObject({ key: 'EUR', value: 0.9, prev: 0.89, date: '2026-10-30' });
    expect(p.hist).toEqual([0.88, 0.89, 0.9]);
  });
  it('garbage is an empty model, never an error', () => {
    for (const c of ['nyfed_rates', 'treasury_xml', 'sdmx_json', 'jsonstat', 'bls_series', 'frankfurter_rates', 'coinbase_exchange', 'polymarket_events', 'finterm_v1'])
      expect(parseFeed(c, '<html>429</html>', { spec: {} }).points).toEqual([]);
  });
});

describe('model route order: the container /v1 first, then the public source, then the declared fallbacks', () => {
  it('on the mesh the container answers alone', async () => {
    const h = harness((u) => (u.startsWith(MESH) ? JSON.stringify({ events: [{ ts: '2026-10-31T10:00Z', country: 'EA', title: 'CPI', importance: 3 }] }) : null), true);
    const d = await loadPanel(panel('economic_calendar', 'week'), dash('economic_calendar'), h.ctx);
    expect(h.asked).toEqual([`${MESH.replace(/\/+$/, '')}/v1/calendar/economic?days=10`]);
    expect(d.servedBy).toBe(fin.name);
    expect(d.rows[0].slice(0, 3)).toEqual(['2026-10-31 10:00', 'EA', 'CPI']);
  });
  it('off the mesh a CORS-closed source is never asked; the declared central bank file still fills the calendar', async () => {
    const h = harness(() => null);
    const d = await loadPanel(panel('economic_calendar', 'week'), dash('economic_calendar'), h.ctx);
    expect(h.asked).toEqual(['asset:central-banks.json']);
    expect(d.servedBy).toBe(src('central_banks').name);
    expect(d.rows.some((r) => r[2].includes('European Central Bank'))).toBe(true);
  });
  it('merge: every public route that answers is combined (calendars); without merge the first answer wins', async () => {
    const base = panel('central_bank_calendar', 'meetings');
    const extra = JSON.stringify({ banks: [{ country: 'CH', events: [{ ts: '2026-11-02T08:30Z', title: 'SNB: rate decision' }] }] });
    const mk = (merge: boolean) => ({ ...base, fetch: { ...base.fetch!, merge, fallbacks: [{ source: 'central_banks', provider: 'declared_events', path: 'extra.json' }] } });
    const ctx = (): Ctx => ({ ...harness(() => null).ctx, get: async (u: string) => (u === 'asset:extra.json' ? extra : JSON.stringify((FINTERM as unknown as { declared: Record<string, unknown> }).declared[u.slice(6)])) });
    const merged = await loadPanel(mk(true), dash('central_bank_calendar'), ctx());
    expect(merged.rows.some((r) => r[2] === 'SNB: rate decision')).toBe(true);
    expect(merged.rows.some((r) => r[2].startsWith('Bank of England'))).toBe(true);
    const first = await loadPanel(mk(false), dash('central_bank_calendar'), ctx());
    expect(first.rows.some((r) => r[2] === 'SNB: rate decision')).toBe(false);
  });
  it('the first public route that answers wins (no merge): last month only when this month is empty', async () => {
    const x = '<m:properties><d:NEW_DATE m:type="Edm.DateTime">2026-09-30T00:00:00</d:NEW_DATE><d:BC_2YEAR m:type="Edm.Double">3.5</d:BC_2YEAR><d:BC_10YEAR m:type="Edm.Double">4.1</d:BC_10YEAR><d:BC_30YEAR m:type="Edm.Double">4.7</d:BC_30YEAR></m:properties>';
    const h = harness((u) => (u.includes('month=202610') ? '<feed/>' : u.includes('month=202609') ? x : null));
    const d = await loadPanel(panel('engine_fixture', 'ust'), dash('engine_fixture'), h.ctx);
    expect(h.asked.length).toBe(2);
    expect(d.rows.map((r) => r[0])).toEqual(['UST 2Y', 'UST 10Y', 'UST 30Y']);
    expect(d.servedBy).toBe('');
  });
  it('a panel whose every route is CORS-closed is blocked without a request', async () => {
    const h = harness(() => '{}');
    await expect(loadPanel(panel('world_equity_indices', 'cboe'), dash('world_equity_indices'), h.ctx)).rejects.toMatchObject({ kind: 'blocked' });
    expect(h.asked).toEqual([]);
  });
  it('one request per item; a failing item is skipped; all failing keeps the block reason', async () => {
    const h = harness((u) => (u.includes('/BTC-USD/') ? JSON.stringify({ open: '100', last: '110' }) : null));
    const d = await loadPanel(panel('engine_fixture', 'crypto'), dash('engine_fixture'), h.ctx);
    expect(h.asked.length).toBe(3);
    expect(d.rows).toEqual([['Bitcoin', '110.00', '+10.00', '+10.00', '24h']]);
    await expect(loadPanel(panel('engine_fixture', 'crypto'), dash('engine_fixture'), harness(() => null).ctx)).rejects.toMatchObject({ kind: 'blocked' });
  });
  it('the container route needs the declared /v1 path and an answering mesh', async () => {
    const p = panel('engine_fixture', 'fx');
    expect(await apiRoute(p, dash('engine_fixture'), { sources: FINTERM.sources, mesh: FINTERM.mesh, reachable: async () => true })).toMatchObject({ base: MESH });
    expect(await apiRoute(p, dash('engine_fixture'), { sources: FINTERM.sources, mesh: FINTERM.mesh, reachable: async () => false })).toBeNull();
    expect(await apiRoute(panel('yield_curves', 'ust'), dash('yield_curves'), { sources: FINTERM.sources, mesh: FINTERM.mesh, reachable: async () => true })).toBeNull();
  });
  it('the watchlist replaces the declared symbols in the container request', async () => {
    const h = harness((u) => (u.startsWith(MESH) ? JSON.stringify({ quotes: [{ symbol: 'NVDA', price: 150, prev_close: 140 }] }) : null), true, { watchlist: ['NVDA', 'TSLA'], alerts: [alertRule('NVDA > 120')!] });
    const d = await loadPanel(panel('watchlist', 'quotes'), dash('watchlist'), h.ctx);
    expect(h.asked).toEqual([`${MESH.replace(/\/+$/, '')}/v1/quotes?symbols=NVDA%2CTSLA`]);
    expect(d.alerts).toEqual(['ALERT NVDA 150.00 > 120.00']);
  });
});

describe('events window, watchlist and alert rules', () => {
  const e = (ts: string, importance: number, title = ts): Ev => ({ ts, country: 'US', title, importance, consensus: '', actual: '', previous: '', kind: 'economic' });
  it('the window and importance are the declared ones; duplicates collapse; all-day first in its day', () => {
    const got = eventsIn([e('2026-10-31T10:00Z', 3), e('2026-10-31', 3, 'holiday'), e('2026-11-05T19:00Z', 3), e('2026-10-31T10:00Z', 3), e('2026-10-30T09:00Z', 1)], { days_back: 0, days_ahead: 2, importance_min: 3 }, TODAY);
    expect(got.map((x) => x.title)).toEqual(['holiday', '2026-10-31T10:00Z']);
  });
  it('rules parse, print and fire on the right side and window', () => {
    expect(alertSymbol(' brk.b ')).toBe('BRK.B');
    expect(alertSymbol('A B')).toBeNull();
    expect(alertRule('AAPL>230')).toEqual({ kind: 'above', symbol: 'AAPL', level: 230 });
    expect(alertRule('events >= 4')).toBeNull();
    expect(ruleText(alertRule('^SPX < 6000')!)).toBe('^SPX < 6000.00');
    const pts = [{ key: '_SPX', label: 'S&P 500', x: 0, value: 5900, prev: null, date: '' }];
    expect(priceHits([alertRule('^SPX < 6000')!, alertRule('^SPX > 6000')!], pts)).toEqual(['ALERT ^SPX 5900.00 < 6000.00']);
    const hits = eventHits([alertRule('events >= 3')!], [e('2026-10-30T11:59Z', 3, 'past'), e('2026-10-31T12:00Z', 3, 'edge'), e('2026-10-31T12:01Z', 3, 'late'), e('2026-10-30T13:00Z', 2, 'low')], '2026-10-30T12:00Z');
    expect(hits).toEqual(['ALERT 2026-10-31 12:00Z US edge']);
  });
});

import { describe, expect, it } from 'vitest';
import { FINTERM } from './catalog';
import { FetchError, forwardRate, loadPanel, NA, sig, type Ctx, type Dashboard } from './engine';
import { cell, coverage, emUsd, parseOne, reasons, gatedAverage, shortName, maxDrawdown1y, perfFormat, perfRow, PERF_COLUMNS, rebalanced, trailing, vol1y, weighted, type Close } from './tables';

// #1370 the per-item tables (port of Performance.kt / Tables.kt): Performance.row, daily rebalancing, GDP weights, container first, CORS skip.
const dash = (id: string) => FINTERM.dashboards.find((d) => d.id === id) as Dashboard;
const panel = (d: string, p: string) => dash(d).panels.find((x) => x.id === p)!;
const fin = FINTERM.sources.find((s) => s.id === 'cloud_fincept')!;
const MESH = FINTERM.mesh[fin.fleet_endpoint!].replace(/\/+$/, '');

function harness(answer: (url: string) => string | null, meshUp: boolean) {
  const asked: string[] = [];
  const ctx: Ctx = {
    today: '2026-10-30', sources: FINTERM.sources, mesh: FINTERM.mesh, reachable: async () => meshUp,
    get: async (url) => { asked.push(url); const a = answer(url); if (a === null) throw new FetchError('blocked', 'Failed to fetch'); return a; },
  };
  return { ctx, asked };
}
const bars = (...b: Close[]) => JSON.stringify({ bars: b.map(([t, c]) => ({ t, c })) });

describe('Performance.row port', () => {
  it('period-to-date bases are the last close before the period; trailing bases on or before; over a year is CAGR', () => {
    const s: Close[] = [['2016-10-28', 50], ['2023-10-30', 80], ['2025-10-30', 100], ['2025-12-31', 104], ['2026-09-30', 105], ['2026-10-23', 108], ['2026-10-30', 110]];
    const r = perfRow(s);
    expect(r[PERF_COLUMNS.indexOf('WTD')]).toBeCloseTo(110 / 108 - 1, 12);
    expect(r[PERF_COLUMNS.indexOf('MTD')]).toBeCloseTo(110 / 105 - 1, 12);
    expect(r[PERF_COLUMNS.indexOf('YTD')]).toBeCloseTo(110 / 104 - 1, 12);
    expect(r[PERF_COLUMNS.indexOf('1Y')]).toBeCloseTo(0.1, 12);
    expect(r[PERF_COLUMNS.indexOf('3Y')]).toBeCloseTo(Math.pow(110 / 80, 1 / 3) - 1, 12);
    expect(r[PERF_COLUMNS.indexOf('10Y')]).toBeCloseTo(Math.pow(110 / 50, 1 / 10) - 1, 12);
    expect(trailing(s, 25)).toBeNull();
    expect(perfFormat(0.1)).toBe('+10.00%');
    expect(perfFormat(null)).toBe(NA);
  });
  it('risk columns', () => {
    expect(maxDrawdown1y([['2026-01-01', 100], ['2026-02-01', 120], ['2026-03-01', 90], ['2026-04-01', 100]])).toBeCloseTo(-0.25, 12);
    expect(vol1y(Array.from({ length: 30 }, (_, i) => [`2026-01-${String(i + 1).padStart(2, '0')}`, 100] as Close))).toBe(0);
    expect(vol1y([['2026-01-01', 100]])).toBeNull();
  });
  it('the portfolio is rebalanced daily, not bought and held', () => {
    const v = rebalanced([[60, [['d1', 100], ['d2', 110], ['d3', 121]]], [40, [['d1', 100], ['d2', 100], ['d3', 100]]]]);
    expect(v[1][1]).toBeCloseTo(106, 9);
    expect(v[2][1]).toBeCloseTo(106 * (0.6 * 1.1 + 0.4), 9);
  });
  it('GDP weights renormalise over the countries with a value; forward cells come from forwardRate', () => {
    expect(weighted([[30507, 4], [4744, 2]])).toBeCloseTo((30507 * 4 + 4744 * 2) / 35251, 12);
    expect(weighted([[30507, null], [4744, 2]])).toBe(2);
    const c: [number, number][] = [[1, 3], [2, 4], [10, 5]];
    expect(cell(c, 5, false, 1)).toBeNull();
    expect(cell(c, 2, true, 1)).toBeCloseTo(forwardRate(c, 1, 2), 12);
  });
});

describe('table panels end to end', () => {
  it('a performance table reads the container per item and keeps an unanswered item as a dashed row with its reason', async () => {
    const { ctx } = harness((u) => (u.startsWith(`${MESH}/v1/history?symbol=XLK`) ? bars(['2025-10-30', 100], ['2026-10-30', 110]) : null), true);
    const d = await loadPanel(panel('eq_dm_us', 'sectors'), dash('eq_dm_us'), ctx);
    const xlk = d.rows.find((r) => r[0] === 'XLK Technology')!;
    expect(d.details?.[d.rows.indexOf(xlk)]).toBe('Technology (XLK)');
    expect(xlk[2 + PERF_COLUMNS.indexOf('1Y')]).toBe('+10.00%');
    expect(xlk[1]).toBe(sig(110));
    expect(d.rows.find((r) => r[0] === 'XLF Financials')!.slice(1).every((x) => x === NA)).toBe(true);
    expect(d.note).toContain('Financials (XLF): ');
  });
  it('off the mesh a Cboe-only table asks nothing and is the mesh-only key row; Coinbase is read in the browser', async () => {
    const { ctx, asked } = harness(() => null, false);
    await expect(loadPanel(panel('eq_dm_us', 'sectors'), dash('eq_dm_us'), ctx)).rejects.toMatchObject({ kind: 'blocked' });
    expect(asked).toEqual([]);
    const cb = harness((u) => (u.includes('/products/BTC-USD/candles') ? JSON.stringify([[Date.UTC(2026, 9, 30) / 1000, 1, 1, 1, 70000, 1], [Date.UTC(2026, 8, 30) / 1000, 1, 1, 1, 50000, 1]]) : null), false);
    const d = await loadPanel(panel('commodities', 'digital'), dash('commodities'), cb.ctx);
    expect(d.rows[0][0]).toBe('Bitcoin');
    expect(d.rows[0][2 + PERF_COLUMNS.indexOf('MTD')]).toBe('+40.00%');
  });
  it('the yields matrix leads with GDP-weighted averages and names the countries with no curve', async () => {
    const curve = (y: number) => JSON.stringify({ asof: '2026-10-29', points: [{ key: '3M', label: '3M', tenor_years: 0.25, value: y }, { key: '10Y', label: '10Y', tenor_years: 10, value: y + 1 }] });
    const { ctx } = harness((u) => (u === `${MESH}/v1/curves/US` ? curve(4) : u === `${MESH}/v1/curves/DE` ? curve(2) : null), true);
    const d = await loadPanel(panel('yields_matrix', 'spot'), dash('yields_matrix'), ctx);
    expect(d.rows.slice(0, 3).map((r) => r[0])).toEqual(['World avg', 'DM avg', 'EM avg']);
    // US + DE hold 61 % of DM GDP: DM shown; World (40 %) and EM (0 %) are "—" with insufficient coverage
    expect(d.columns.slice(0, 3)).toEqual(['Country', 'Cov', '3M']);
    expect(d.rows[1][2]).toBe(((30507 * 4 + 4744 * 2) / 35251).toFixed(2));
    expect(d.rows.slice(0, 3).map((r) => r[1])).toEqual(['38%', '61%', '0%']);
    expect(d.rows[0][2]).toBe(NA);
    expect(d.rows[2][2]).toBe(NA);
    expect(d.rows.length).toBe(25);
    expect(d.note).toContain('no curve: ');
    expect(d.note).toContain('insufficient coverage: World avg 38%, EM avg 0% < 60%');
  });
  it('the US alone (the CI emulator, mesh off) never passes for the World or DM average; the store curve shape is read', async () => {
    const us = JSON.stringify({ tenors: ['3M', '6M'], curve: { country: 'US', tenors: [{ tenor: '3M', value: 4.16, date: '2026-10-30' }, { tenor: '6M', value: null, date: null, method: 'no free source declared for this cell' }] } });
    const { ctx } = harness((u) => (u === `${MESH}/v1/curves/US` ? us : null), true);
    const d = await loadPanel(panel('yields_matrix', 'spot'), dash('yields_matrix'), ctx);
    expect(d.rows.find((r) => r[0] === 'United States')![2]).toBe('4.16');
    for (const r of d.rows.slice(0, 3)) expect(r.slice(2).every((x) => x === NA)).toBe(true);
    expect(d.rows.slice(0, 3).map((r) => r[1])).toEqual(['33%', '53%', '0%']);
  });
  it('a browser-readable table whose every request fails at the network is the blocked key row, not an error', async () => {
    const { ctx } = harness(() => null, false);
    await expect(loadPanel(panel('yields_matrix', 'spot'), dash('yields_matrix'), ctx)).rejects.toMatchObject({ kind: 'blocked' });
    // an answer that is only empty (no network failure) stays an error
    const e = harness(() => '{}', false);
    await expect(loadPanel(panel('yields_matrix', 'spot'), dash('yields_matrix'), e.ctx)).rejects.not.toMatchObject({ kind: 'blocked' });
  });
  it('coverage gates the average and short names put the ticker first', () => {
    expect(coverage([[60, 1], [40, null]])).toBeCloseTo(0.6, 12);
    expect(gatedAverage([[60, 1], [40, null]], 0.6)).toBe(1);
    expect(gatedAverage([[59, 1], [41, null]], 0.6)).toBeNull();
    expect(shortName('Consumer Discretionary (XLY)')).toBe('XLY Cons Disc');
    expect(shortName('Health Care (XLV)')).toBe('XLV Health Care');
    expect(shortName('DAX')).toBe('DAX');
  });
  it('model portfolio performance: the portfolio row then each leg with its proxy', async () => {
    const { ctx } = harness((u) => (u.includes('symbol=AGG') ? bars(['2026-10-29', 100], ['2026-10-30', 101]) : u.includes('symbol=ACWI') ? bars(['2026-10-29', 100], ['2026-10-30', 110]) : null), true);
    const d = await loadPanel(panel('mp_60_40', 'perf'), dash('mp_60_40'), ctx);
    expect(d.rows.map((r) => r[0])).toEqual(['Portfolio 60/40', 'AGG Bonds 60%', 'ACWI Equity 40%']);
    expect(d.details).toEqual(['Portfolio 60/40, daily rebalanced', 'Bonds 60% (AGG)', 'Equity 40% (ACWI)']);
    expect(d.rows[0][1]).toBe(sig(100 * (0.6 * 1.01 + 0.4 * 1.1)));
  });
});

describe('one /v1/curves/matrix call', () => {
  const body = JSON.stringify({ fill: { rate: 0.25 }, rows: [
    { country: 'US', gdp_usd: 30e12, tenors: [{ tenor: '3M', value: 4.1, date: '2026-10-30' }, { tenor: '10Y', value: 4.9, date: '2026-10-30' }] },
    { country: 'FR', gdp_usd: 3.4e12, tenors: [{ tenor: '3M', value: null, date: null, method: 'no free source declared for this cell' }, { tenor: '10Y', value: 4.44, date: '2026-09' }] },
    { country: 'EA', gdp_usd: null, tenors: [{ tenor: '10Y', value: 3.3, date: '2026-10-29' }] },
  ] });
  it('keeps the declared countries in order with the container GDP and every empty cell reason', () => {
    const one = parseOne(body, ['US', 'FR', 'CN'], 'api')!;
    expect(one.got.map((x) => x[0])).toEqual(['US', 'FR', 'CN']);
    expect(one.got[1][1].got.points.map((p) => [p.key, p.x, p.value])).toEqual([['10Y', 10, 4.44]]);
    expect(one.got[2][1].why).toBe('not in /v1/curves/matrix');
    expect(one.gdp.FR).toBeCloseTo(3400);
    expect(one.fill).toBe(0.25);
    expect(reasons(one.why, ['3M', '10Y'])).toEqual(['no free source declared for this cell: FR 3M']);
  });
  it('is null when no declared country has a value (the per-country path runs)', () => {
    expect(parseOne(JSON.stringify({ rows: [] }), ['US'], 'api')).toBeNull();
  });
});

describe('EM government bonds in USD', () => {
  it('one row per country, returns in %, each empty cell explained', () => {
    const body = JSON.stringify({ method: 'm', rows: [
      { country: 'BR', currency: 'BRL', yield_last: { month: '2026-09', value: 13.1 }, usd_return_annualised: { '1y': 0.0812, '10y': 0.031, '25y': null }, null_reason: null },
      { country: 'SA', currency: null, yield_last: null, usd_return_annualised: { '1y': null, '10y': null, '25y': null }, null_reason: 'no free 10-year government yield series for this country' }] });
    const d = emUsd(panel('yields_matrix', 'em_usd'), body, 'api');
    expect(d.rows[0]).toEqual(['BR', 'BRL', '13.10', '+8.12%', '+3.10%', NA]);
    expect(d.rows[1].slice(1).every((x) => x === NA)).toBe(true);
    expect(d.note).toContain('BR (history shorter than 25Y)');
    expect(d.asOf).toBe('2026-09');
  });
});

describe('World Bonds merged table (#1370, spec 9 spreads vs Bund / UST)', () => {
  it('the 10Y over the 2Y, the Bund and the UST in bp; a missing yield is a dash', async () => {
    const { spreads, SPREAD_COLS } = await import('./tables');
    const m = { columns: ['Country', 'Cov', '2Y', '10Y'], rows: [['United States', '52%', '4.56', '4.94'], ['Germany', '9%', '2.10', '2.60'], ['Italy', '4%', '\u2014', '3.75']], links: [], chart: [], asOf: '2026-10-30', note: '', servedBy: '' };
    const d = spreads(m, { US: 'United States', DE: 'Germany', IT: 'Italy' });
    expect(d.columns).toEqual(SPREAD_COLS);
    expect(d.rows[0]).toEqual(['United States', '4.56', '4.94', '+38', '+234', '0']);
    expect(d.rows[1]).toEqual(['Germany', '2.10', '2.60', '+50', '0', '-234']);
    expect(d.rows[2]).toEqual(['Italy', '\u2014', '3.75', '\u2014', '+115', '-119']);
  });
});

describe('60/40 vs 100/0 risk comparison (spec 9)', () => {
  it('stacks each compared portfolio headline row on the same legs', async () => {
    const { riskCompare } = await import('./tables');
    const bars = (a: number, b: number) => ({ points: [], events: [], kv: [], rows: [], links: [], bars: [{ date: '2026-10-29', c: a }, { date: '2026-10-30', c: b }] });
    const got = new Map([['Bonds', { got: bars(100, 101), by: 'api', why: '' }], ['Equity', { got: bars(100, 110), by: 'api', why: '' }]]) as never;
    const p = { id: 'risk', title: '', source: 'cboe', view: 'table', derive: 'risk_compare', columns: ['Name', 'Last', '1Y'] } as never;
    const d = riskCompare(p, { proxies: { Bonds: 'AGG', Equity: 'ACWI' } } as never, [[['Bonds', 40], ['Equity', 60]], [['Bonds', 0], ['Equity', 100]]], got);
    expect(d.rows.map((r) => r[0])).toEqual(['Portfolio 40/60', 'Portfolio 0/100']);
    expect(d.rows[1][1]).not.toBe(d.rows[0][1]);
  });
});

describe('FX vs PPP (#1374): the same maths as /v1/fx/ppp', () => {
  it('carries PPP by relative inflation and real-adjusts the year-ago window', async () => {
    const { pppToday, realAdjust, pct, windowAvg, fxPppRow } = await import('./fxppp');
    const { fxPppTable } = await import('./tables');
    expect(pppToday(3.4, 100, 110, 200, 210)).toBeCloseTo((3.4 * 1.1) / 1.05, 12);
    expect(realAdjust(7, 100, 104, 100, 102)).toBeCloseTo((7 * 1.04) / 1.02, 12);
    const fx: [string, number][] = [['2025-10-01', 7.0], ['2025-10-30', 7.2], ['2026-10-01', 6.9], ['2026-10-30', 7.1]];
    expect(windowAvg(fx, '2026-10-30', 30)).toBeCloseTo(7.0, 12);
    const y = (v: [number, number][]) => v.map(([a, b]) => [String(a), b] as [string, number]);
    const r = fxPppRow({ cc: 'CN', ccy: 'CNY' }, fx, y([[2023, 3.5]]), y([[2023, 100], [2024, 101], [2025, 103]]), y([[2023, 140], [2024, 143], [2025, 147]]), 30);
    const ppp = pppToday(3.5, 100, 103, 140, 147);
    expect(r.ppp).toBeCloseTo(ppp, 12);
    expect(r.over_under_pct).toBeCloseTo(pct(ppp, 7.1), 12);
    const ago = realAdjust(7.1, 101, 103, 143, 147);
    expect(r.avg_window_year_ago_real).toBeCloseTo(ago, 12);
    expect(r.real_change_pct).toBeCloseTo(pct(ago, 7.0), 12);
    const sa = fxPppRow({ cc: 'SA', ccy: 'SAR', no_fx: 'pegged, no ECB rate' }, [], [], [], [], 30);
    const t = fxPppTable({ id: 'ppp', columns: ['Currency'] } as never, [r, sa], 'test');
    expect(t.rows[0].slice(0, 2)).toEqual(['CNY', '7.1000']);
    expect(t.note).toContain('SAR spot: pegged, no ECB rate');
  });
});


import { describe, expect, it } from 'vitest';
import { FINTERM } from './catalog';
import { FetchError, loadPanel, type Ctx, type Dashboard } from './engine';
import { matrixFont, matrixWidths } from './fin';
import { RISK_ALL, filterRows, heatOf, matrixRows, type PmTableDecl, type RiskTab } from './risk';
import { EM_DEFAULTS, axis, emMatrix, fxs, grid, heat, money, monthlyNet, netOf, pct, real, roundTo, type EmLive } from './emcalc';

// #1447 PM > D1 EM Bonds CALCULATOR and D0 EM Carry Trade: the same numbers as EmCalcTest.kt (APK), checked against the owner's image
// (gross 14.98 %, Germany inflation 3.63 %, NAV EUR 200,000 = BRL 1,234,569.80 = USD 224,925.27, CG 17 %, spread 2 %, centre 1,500).
const live: EmLive = { yHigh: 0.1498, yFund: 0.027, infl: 0.0363, brlUsd: 1234569.8 / 224925.27, brlEur: 1234569.8 / 200000, basis: '', fails: [] };
const IMAGE = [[1500, 1500, 1750, 1750, 1750, 2000, 2000], [1250, 1500, 1500, 1750, 1750, 1750, 2000], [1250, 1250, 1500, 1500, 1750, 1750, 1750], [1250, 1250, 1500, 1500, 1500, 1750, 1750],
  [1250, 1250, 1250, 1500, 1500, 1500, 1750], [1000, 1250, 1250, 1250, 1500, 1500, 1500], [1000, 1000, 1250, 1250, 1500, 1500, 1500]];

describe('EM Bonds calculator maths', () => {
  it('the real yield is the Fisher ratio, not the difference', () => {
    expect(real(0.1498, 0.0363)).toBeCloseTo(0.109524, 6);
    expect(real(0.1273, 0.0363)).toBeCloseTo(0.0878, 4);
  });
  it('the centre cell by hand is the image centre value 1,500 (exact 1,484.78)', () => {
    const c = monthlyNet(200000, 0.1498, 0.0363, live.brlEur, live.brlEur, 0.17, 0.02);
    expect(c).toBeCloseTo(1825.4 * 0.83 * 0.98, 0); expect(c).toBeCloseTo(1484.78, 2);
    expect(roundTo(c, 250)).toBe(1500); expect(roundTo(c, 0)).toBe(c);
    expect(roundTo(1375, 250)).toBe(1500); expect(roundTo(1374.99, 250)).toBe(1250);
  });
  it('the whole 7 x 7 grid, the FX levels and the yield steps are the image', () => {
    const g = grid(live, EM_DEFAULTS);
    expect(g.cells).toEqual(IMAGE);
    // #1462 orientation against the image: the axes ascend (yield left to right, FX top to bottom), the centre is the middle row and column, the most (2,000) is top right, the least (1,000) bottom left
    for (const a of [g.yields, g.fxUsd, g.fxEur]) expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(g.yields[3]).toBe(live.yHigh); expect(g.fxUsd[3]).toBeCloseTo(live.brlUsd, 12); expect(g.fxEur[3]).toBeCloseTo(live.brlEur, 12);
    expect(g.cells[0][6]).toBe(2000); expect(g.cells[6][0]).toBe(1000); expect(Math.max(...g.cells.flat())).toBe(2000); expect(Math.min(...g.cells.flat())).toBe(1000);
    for (let r = 0; r < 7; r++) for (let c = 1; c < 7; c++) expect(g.cells[r][c]).toBeGreaterThanOrEqual(g.cells[r][c - 1]); // a higher yield never pays less
    for (let r = 1; r < 7; r++) for (let c = 0; c < 7; c++) expect(g.cells[r][c]).toBeLessThanOrEqual(g.cells[r - 1][c]); // a higher BRL level never pays more EUR
    expect(g.fxUsd.map(fxs)).toEqual(['4.67', '4.94', '5.21', '5.49', '5.76', '6.04', '6.31']);
    expect(g.fxEur.map(fxs)).toEqual(['5.25', '5.56', '5.86', '6.17', '6.48', '6.79', '7.10']);
    expect(g.yields.map((y) => pct(y))).toEqual(['12.73%', '13.48%', '14.23%', '14.98%', '15.73%', '16.48%', '17.23%']);
    expect(axis(10, 1, 1, false)).toEqual([9, 10, 11]);
  });
  it('heat is red below the centre, green above, zero at the centre; a loss is not taxed', () => {
    const h = heat(grid(live, EM_DEFAULTS).cells);
    expect(h[3][3]).toBe(0); expect(h[0][6]).toBe(1); expect(h[6][0]).toBe(-1); expect(h[0][4]).toBeGreaterThan(0); expect(h[6][4]).toBe(0);
    expect(heat([[5, 5, 5], [5, 5, 5], [5, 5, 5]])[1][1]).toBe(0);
    expect(netOf(-100, 0.17, 0.02)).toBe(-100); expect(netOf(100, 0.17, 0.02)).toBeCloseTo(81.34, 10);
  });
  it('the matrix table: header, Inflation and real rows, the centre bold, exact values when rounding is off', () => {
    const d = emMatrix({ id: 'calc', title: 't' } as never, live, EM_DEFAULTS, 'test', '2026-10-30');
    expect(d.columns).toEqual(['', 'Gross Yield', '12.73%', '13.48%', '14.23%', '14.98%', '15.73%', '16.48%', '17.23%']);
    expect(d.rows[0].slice(0, 3)).toEqual(['', 'Inflation', '3.63%']); expect(d.rows[1].slice(0, 3)).toEqual(['USD', 'EUR / (-Infl) Yield', '8.78%']);
    expect(d.rows[2]).toEqual(['4.67', '5.25', '1,500.00', '1,500.00', '1,750.00', '1,750.00', '1,750.00', '2,000.00', '2,000.00']);
    expect(d.rows[8]).toEqual(['6.31', '7.10', '1,000.00', '1,000.00', '1,250.00', '1,250.00', '1,500.00', '1,500.00', '1,500.00']);
    expect(d.bold).toContainEqual([-1, 5]); expect(d.bold).toContainEqual([5, 0]); expect(d.bold).toContainEqual([5, 1]);
    expect(d.rows[1][5]).toBe('10.95%'); expect(d.rows[5].slice(0, 4)).toEqual(['5.49', '6.17', '1,250.00', '1,250.00']);
    expect(d.bold).toContainEqual([5, 5]); expect(d.heat![5][5]).toBe(0); expect(d.heat![0].every((x) => x === null)).toBe(true);
    const exact = emMatrix({ id: 'calc', title: 't' } as never, live, { ...EM_DEFAULTS, round: 0 }, 'test', '');
    expect(exact.rows[5][5]).toBe(money(monthlyNet(200000, 0.1498, 0.0363, 1, 1, 0.17, 0.02))); expect(exact.rows[5][5]).toBe('1,484.78');
  });
});

describe('PM D1 / D0 panels on live feeds', () => {
  const dash = FINTERM.dashboards.find((x) => x.id === 'pm_d1_em_bonds') as Dashboard;
  const ctx = (get: Ctx['get']): Ctx => ({ today: '2026-10-30', sources: FINTERM.sources, mesh: FINTERM.mesh, reachable: async () => false, get });
  const ok: Ctx['get'] = async (url) => {
    if (url.includes('db.nomics')) return JSON.stringify({ series: { docs: [
      { series_code: 'BRA.M.IRLT.PA._Z._Z._Z', period: ['2026-04', '2026-05'], value: [14.5, 14.98] },
      { series_code: 'DEU.M.IRLT.PA._Z._Z._Z', period: ['2026-04', '2026-05'], value: [2.6, 2.7] },
      { series_code: 'DEU.M.CP.IX._Z._Z._Z', period: ['2025-05', '2026-05'], value: [100, 103.63] }] } });
    if (url.includes('frankfurter')) return JSON.stringify({ rates: { '2026-10-28': { BRL: 5.3, EUR: 0.85 }, '2026-10-29': { BRL: 5.4888, EUR: 0.8892 } } });
    throw new FetchError('blocked', 'Failed to fetch');
  };
  it('the pages are grouped low to high risk (market, then equity share) and the calculator sits in D1', () => {
    const pm = FINTERM.dashboards.filter((d) => d.tab === 'pm').map((d) => d.id);
    const tier = (id: string) => (FINTERM.dashboards.find((d) => d.id === id) as unknown as { risk: string }).risk;
    const ids = FINTERM.risk_tabs.slice(1).map((t: { id: string }) => t.id);
    expect(pm.filter((id) => id !== 'portfolio_risk').map((id) => ids.indexOf(tier(id)))).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3]);
    expect(pm.indexOf('pm_d1_em_bonds')).toBeLessThan(pm.indexOf('pm_d0_carry'));
    expect(pm[pm.length - 1]).toBe('pm_d0_carry'); // the carry trade is the top of the scale
    expect(dash.panels.map((p) => p.derive)).toEqual(['em_calc', undefined, 'em_calc']); // the matrix first: it is on the first screen
  });
  it('A1 Cash weights follow the DXY basket (whole percents of the ICE weights)', () => {
    const a1 = (FINTERM.dashboards.find((d) => d.id === 'pm_a1_cash') as unknown as { model_portfolio: { legs: [string, number][] } }).model_portfolio.legs;
    const dxy = [['EUR', 57.6], ['JPY', 13.6], ['GBP', 11.9], ['CAD', 9.1], ['SEK', 4.2], ['CHF', 3.6]] as [string, number][];
    expect(a1.length).toBe(dxy.length); expect(a1.reduce((s, l) => s + l[1], 0)).toBe(100);
    a1.forEach((l, k) => { expect(l[0].startsWith(dxy[k][0])).toBe(true); expect(Math.abs(l[1] - dxy[k][1])).toBeLessThan(1); });
  });
  it('the calculator panel draws the matrix; the inputs panel the NAV, taxes and curves', async () => {
    const d = await loadPanel(dash.panels.find((p) => p.id === 'calc')!, dash, ctx(ok));
    expect(d.rows).toHaveLength(9); expect(d.rows[1][5]).toBe('10.95%'); expect(d.rows[5].slice(2)).toEqual(['1,250.00', '1,250.00', '1,500.00', '1,500.00', '1,500.00', '1,750.00', '1,750.00']);
    expect(d.note).toContain('rounded to 250'); expect(d.note).toContain('CPI 2026-05'); expect(d.servedBy).toContain('DBnomics');
    const i = await loadPanel(dash.panels.find((p) => p.id === 'inputs')!, dash, ctx(ok));
    const m = Object.fromEntries(i.rows.map((r) => [r[0], r[1]]));
    expect(m['NAV (Gross) eur']).toBe('200,000.00'); expect(m['Tax CG']).toBe('17%'); expect(m['Tax Exch Spread']).toBe('2%'); expect(m['Gross Yield']).toBe('Brazil Gov Bonds 14.98%');
    expect(m['Inflation']).toBe('Germany 3.63%'); expect(m['Exch step']).toBe('5.0%'); expect(m['Yield step']).toContain('75 bps');
  });
  it('the carry panel reuses the engine; a BRL fall of exactly the breakeven leaves nothing', async () => {
    const cd = FINTERM.dashboards.find((x) => x.id === 'pm_d0_carry') as Dashboard;
    const d = await loadPanel(cd.panels[0], cd, ctx(ok));
    const m = Object.fromEntries(d.rows.map((r) => [r[0], r[1]]));
    expect(m['Carry (high-yielder - funding)']).toBe('12.28%');
    const be = 1 - 1.027 / 1.1498;
    expect(m['Breakeven BRL fall vs EUR, 12M']).toBe(pct(be));
    expect(m['Net carry EUR per month (after tax and spread)']).toBe(money(monthlyNet(200000, 0.1498, 0.027, 1, 1, 0.17, 0.02)));
    expect(200000 * ((1 + real(0.1498, 0.027)) * (1 - be) - 1) / 12).toBeCloseTo(0, 6);
    expect(m['Net EUR per month if BRL -10% in 12M']).not.toBe(m['Net EUR per month if BRL +10% in 12M']);
  });
  it('Frankfurter down: BRL and EUR come from the ECB reference rates on DBnomics', async () => {
    const d = await loadPanel(dash.panels.find((p) => p.id === 'calc')!, dash, ctx(async (url) => {
      if (url.includes('frankfurter')) throw new FetchError('blocked', 'Failed to fetch');
      if (url.includes('EXR')) return JSON.stringify({ series: { docs: [{ series_code: 'D.BRL.EUR.SP00.A', period: ['2026-10-29', '2026-10-30'], value: [6.1, 6.1728] }, { series_code: 'D.USD.EUR.SP00.A', period: ['2026-10-29', '2026-10-30'], value: [1.12, 1.1246] }] } });
      return ok(url);
    }));
    expect(d.rows[5].slice(0, 2)).toEqual(['5.49', '6.17']); expect(d.note).toContain('Frankfurter unavailable'); expect(d.servedBy).toBe('DBnomics');
  });
  it('no feed answered: the blocked key row, naming the reason', async () => {
    await expect(loadPanel(dash.panels.find((p) => p.id === 'calc')!, dash, ctx(async () => { throw new FetchError('blocked', 'Failed to fetch'); }))).rejects.toThrow(/no Brazil 10Y yield/);
  });
});

// #1462 / #1478 PM Vol organised by risk level: filter tabs, every portfolio in a tier by its market and equity share, the rows of the Vol table by level; the matrix fits one screen
describe('PM Vol risk levels and the one-screen matrix (#1462, #1478)', () => {
  const tabs = (FINTERM as unknown as { risk_tabs: RiskTab[] }).risk_tabs;
  const pmDecl = (FINTERM as unknown as { pm: Record<string, PmTableDecl> }).pm;
  type D = { id: string; entry: string; tab: string; risk?: string; market?: string; equity_pct?: number; em_pct?: number; risk_basis?: string };
  const pm = (FINTERM.dashboards as unknown as D[]).filter((d) => d.tab === 'pm' && d.id !== 'portfolio_risk');
  const vol = pmDecl.vol;
  const riskOf = (id: string) => pm.find((d) => d.id === id)?.risk ?? '';
  it('the filter tabs are All | DM · Low | DM · Middle | DM+EM · Middle-High | DM+EM · High', () => {
    expect(tabs.map((t) => t.label)).toEqual(['All', 'DM · Low', 'DM · Middle', 'DM+EM · Middle-High', 'DM+EM · High']);
  });
  it('every PM portfolio declares a market and a tier: DM below EM, then more equity = higher risk; A2 is dropped', () => {
    expect(pm.length).toBe(13);
    expect(pm.find((d) => d.id === 'pm_a2_low')).toBeUndefined();
    for (const d of pm) {
      expect(['DM', 'EM'], d.id).toContain(d.market);
      expect(tabs.slice(1).map((t) => t.id), d.id).toContain(d.risk);
      expect(tabs.slice(1).find((t) => t.market === d.market && d.equity_pct! <= t.equity_max!)!.id, d.id).toBe(d.risk);
      expect(d.market === 'EM', d.id).toBe(d.em_pct! > 0);
    }
    const key = (d: D) => (d.market === 'DM' ? 0 : 1e6) + d.equity_pct! * 1000 + d.em_pct!;
    const t = (id: string) => pm.find((d) => d.id === id)!.risk;
    expect(['pm_a1_cash', 'mp_70_30', 'mp_60_40', 'mp_30_70', 'pm_d1_em_bonds', 'pm_c1_risky', 'mp_30_70_DM_EM', 'pm_d0_carry'].map(t)).toEqual(['dm_low', 'dm_low', 'dm_mid', 'dm_mid', 'em_mid', 'em_mid', 'em_high', 'em_high']);
    expect(pm.reduce((m, d) => (key(d) > key(m) ? d : m)).id).toBe('pm_d0_carry');
  });
  it('Vol: the owner columns and names, one row per portfolio by level (level 3 by Vol: B1, D1, C1), the carry trade last', () => {
    expect(vol.columns).toEqual(['Portfolio', 'DM', 'DM\nBonds', 'DM\nEquity', 'EM', 'EM\nBonds', 'EM\nEquity', 'Swap', 'Vol']);
    const rows = vol.rows!;
    expect(rows.map((r) => r.dashboard).sort()).toEqual(pm.map((d) => d.id).sort());
    const nameOf = (id: string) => pm.find((d) => d.id === id)!.entry;
    expect(matrixRows(rows, nameOf).map((r) => r[0])).toEqual(['DM Cash B100', 'DM E30B70', 'DM E40B60', 'DM E60B40', 'DM E70B30', 'DM E40B40 · EM E10B10', 'EM B100', 'DM E50B10 · EM E30B10', 'DM E70 · EM E30', 'DM E60 · EM E40', 'DM E40 · EM E60', 'DM E30 · EM E70', 'EM Carry EUR→BRL']);
    const tier = rows.map((r) => tabs.findIndex((t) => t.id === riskOf(r.dashboard!)));
    expect(tier).toEqual([...tier].sort((a, b) => a - b));
    expect(filterRows(rows, riskOf, 'em_mid').map((r) => r.dashboard)).toEqual(['pm_b1_mid', 'pm_d1_em_bonds', 'pm_c1_risky']);
    expect(filterRows(rows, riskOf, 'dm_low').map((r) => r.dashboard)).toEqual(['pm_a1_cash', 'mp_70_30']);
    expect(filterRows(rows, riskOf, RISK_ALL)).toEqual(rows);
    expect(rows[rows.length - 1].dashboard).toBe('pm_d0_carry');
    for (const r of rows.filter((x) => x.dashboard !== 'pm_d0_carry')) { const n = r.cells.slice(0, 6).map(Number); expect(n[0] + n[3], r.dashboard).toBe(100); expect(n[0]).toBe(n[1] + n[2]); expect(n[3]).toBe(n[4] + n[5]); }
    for (const r of rows) expect(r.cells[6], r.dashboard).toBe(pm.find((d) => d.id === r.dashboard)!.market === 'EM' ? 'No' : '');
  });
  it('Commodities left PM for the EQ tab (an app-only quote board, #1539); Profiles: the 8 cycle profiles; the PM Homepage is Portfolios and Performance', () => {
    expect(pmDecl.commodities).toBeUndefined();
    expect((FINTERM.dashboards as unknown as D[]).find((d) => d.id === 'commodities')?.tab).toBe('eq');
    expect(pmDecl.profiles.tabs!.map((t) => t.label)).toEqual(['Growth', 'Value', 'Quality', 'Cyclical', 'Defensive', 'Dividend', 'Momentum', 'Small-cap']);
    expect(pmDecl.portfolios.columns).toEqual(['Portfolio', 'Vol', 'Top 3', 'See all']);
    expect(pmDecl.performance.columns![0]).toBe('Portfolio');
    expect(FINTERM.homes.pm.map((c) => c.slug)).toEqual(['pm-portfolios', 'pm-performance']);
  });
  it('the matrix fits one 312 px card body: 9 columns, numerals within the ramp (7..11 px), 10 rows of 20 px', () => {
    const w = matrixWidths(312, 9);
    expect(w.length).toBe(9); expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(312, 6);
    const f = matrixFont(w[2], '1,500.00'.length);
    expect(f).toBeGreaterThanOrEqual(7); expect(f).toBeLessThanOrEqual(11); expect(f * 0.6 * 8).toBeLessThanOrEqual(w[2] + 1e-9);
    expect(matrixFont(100, 8)).toBe(11); expect(matrixFont(10, 8)).toBe(7);
    // a table declares its own label columns (Vol: one at 36 %); the default is 8 % and 13 %
    const v = matrixWidths(300, 9, [0.36]); expect(v.length).toBe(9); expect(v[0]).toBeCloseTo(108, 6); expect(v.reduce((a, b) => a + b, 0)).toBeCloseTo(300, 6);
    expect(matrixWidths(312, 9, [0.08, 0.13])).toEqual(w);
  });
});

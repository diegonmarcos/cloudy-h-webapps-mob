import { describe, expect, it } from 'vitest';
import { FINTERM } from './catalog';
import { FetchError, loadPanel, type Ctx, type Dashboard } from './engine';
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
    expect(d.columns).toEqual(['BRL/USD', 'BRL/EUR', '12.73%', '13.48%', '14.23%', '14.98%', '15.73%', '16.48%', '17.23%']);
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
  it('the pages are grouped low to high risk and the calculator sits in D1', () => {
    const pm = FINTERM.dashboards.filter((d) => d.tab === 'pm').map((d) => d.id);
    expect(pm.indexOf('pm_a1_cash')).toBeLessThan(pm.indexOf('pm_a2_low')); expect(pm.indexOf('pm_a2_low')).toBeLessThan(pm.indexOf('pm_b1_mid'));
    expect(pm.indexOf('pm_b1_mid')).toBeLessThan(pm.indexOf('pm_c1_risky')); expect(pm.indexOf('pm_c1_risky')).toBeLessThan(pm.indexOf('pm_d1_em_bonds'));
    expect(pm.indexOf('pm_d1_em_bonds')).toBeLessThan(pm.indexOf('pm_d0_carry'));
    expect(dash.panels.map((p) => p.derive)).toEqual([undefined, 'em_calc', 'em_calc']);
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
  it('no feed answered: the blocked key row, naming the reason', async () => {
    await expect(loadPanel(dash.panels.find((p) => p.id === 'calc')!, dash, ctx(async () => { throw new FetchError('blocked', 'Failed to fetch'); }))).rejects.toThrow(/no Brazil 10Y yield/);
  });
});

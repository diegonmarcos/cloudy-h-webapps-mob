import { describe, expect, it } from 'vitest';
import { FINTERM } from './catalog';
import { FetchError, loadPanel, type Ctx, type Dashboard } from './engine';
import { bigMac, diff, dxy, dxyRow, fxMatrixRow, rppp } from './fxmatrix';
import { fxMatrixTable } from './tables';

// #1396 G20 FX & PPP Matrix: the same fixture as fxmatrix.rs (container) and TablesTest.fxMatrixRealMovingAveragesPppBigMacDiffsAndDxy (APK).
type S = [string, number][];
const y = (v: [number, number][]): S => v.map(([a, b]) => [String(a), b]);
const fx: S = [['2023-10-15', 6.0], ['2025-10-20', 7.0], ['2026-10-30', 7.2]];
const cpi = y([[2022, 100], [2024, 106], [2025, 110]]); const us = y([[2022, 200], [2024, 210], [2025, 214]]);
const bm: S = [['2026-01-01', 25.0], ['2026-07-01', 26.5]]; const bmUs: S = [['2026-07-01', 6.22]];

describe('G20 FX & PPP Matrix maths', () => {
  it('RPPP 30MA at -1y/-3y, PPP carried by CPI, Big Mac implied rate, Today/x - 1 and the ICE DXY', () => {
    expect(rppp(7.0, 100, 110, 200, 210)).toBeCloseTo((7.0 * 1.1) / 1.05, 12);
    expect(dxy(50.14348112, [[0.576, 1], [0.424, 1]])).toBeCloseTo(50.14348112, 12);
    expect(dxy(50.14348112, [[0.6, 0.9], [0.4, 150]])).toBeCloseTo(50.14348112 * Math.pow(0.9, 0.6) * Math.pow(150, 0.4), 9);
    expect(diff(7.2, 6.0)).toBeCloseTo(20, 12);
    const r = fxMatrixRow({ ccy: 'CNY', cc: 'CN', a3: 'CHN', seg: 'BRICS', label: 'Chinese yuan' }, fx, y([[2024, 3.5]]), cpi, us, bm, bmUs, 30, [1, 3]);
    const ma1 = (7.0 * (110 / 106)) / (214 / 210); const ma3 = (6.0 * (110 / 100)) / (214 / 200);
    const macro = (3.5 * (110 / 106)) / (214 / 210); const retail = 26.5 / 6.22;
    expect(r.today).toBe(7.2);
    expect(r.ma_1y as number).toBeCloseTo(ma1, 12);
    expect(r.ma_3y as number).toBeCloseTo(ma3, 12);
    expect(r.macro_ppp as number).toBeCloseTo(macro, 12);
    expect(r.retail_ppp as number).toBeCloseTo(retail, 12);
    expect(r.diff_ma_1y as number).toBeCloseTo((7.2 / ma1 - 1) * 100, 9);
    expect(r.diff_ma_3y as number).toBeCloseTo((7.2 / ma3 - 1) * 100, 9);
    expect(r.diff_macro_ppp as number).toBeCloseTo((7.2 / macro - 1) * 100, 9);
    expect(r.diff_retail_ppp as number).toBeCloseTo((7.2 / retail - 1) * 100, 9);
    expect(r.null_reason).toEqual({});
    const ru = fxMatrixRow({ ccy: 'RUB', cc: 'RU', a3: 'RUS', no_fx: 'no rate' }, [], [], [], [], [['2022-01-01', 135]], bmUs, 30, [1, 3]);
    const w = ru.null_reason as Record<string, string>;
    expect(w.today).toBe('no rate');
    expect(w.retail_ppp).toContain('last 2022-01-01');
    expect(w.macro_ppp).toBeTruthy();
    expect(ru.diff_retail_ppp).toBeNull();
    expect(fxMatrixRow({ ccy: 'X', cc: 'X' }, fx, [], y([[2025, 110]]), us, [], bmUs, 30, [1]).null_reason).toMatchObject({ ma_1y: 'no World Bank CPI (FP.CPI.TOTL) for 2024 and 2025 on both sides', retail_ppp: "The Economist's Big Mac index does not cover X" });
    expect(fxMatrixRow({ ccy: 'EUR', cc: 'DE', market_quote: true }, fx, [], cpi, us, bm, bmUs, 30, [1]).market_quote as number).toBeCloseTo(1 / 7.2, 12);
    const by = new Map<string, Record<string, unknown>>([['EUR', { ccy: 'EUR', today: 0.9, ma_1y: 0.95, null_reason: {} }], ['JPY', { ccy: 'JPY', today: 150, null_reason: { ma_1y: 'short' } }]]);
    const d = dxyRow({ constant: 50.14348112, legs: [{ ccy: 'EUR', cc: 'DE', weight: 0.6 }, { ccy: 'JPY', cc: 'JP', weight: 0.4 }] }, by, [1]);
    expect(d.today as number).toBeCloseTo(50.14348112 * Math.pow(0.9, 0.6) * Math.pow(150, 0.4), 9);
    expect((d.null_reason as Record<string, string>).ma_1y).toBe('needs the JPY leg (short)');
    expect(bigMac('date,iso_a3,currency_code,name,local_price\n2026-07-01,KOR,KRW,"Korea, South",5700\n2026-07-01,USA,USD,United States,6.22\n').get('KOR')).toEqual([['2026-07-01', 5700]]);
    const t = fxMatrixTable({ id: 'ppp_matrix', columns: ['Currency'] } as never, {}, [r, ru], 'test');
    expect(t.rows[0].slice(0, 3)).toEqual(['CNY', 'BRICS', '7.2000']);
    expect(t.note).toContain('RUB today: no rate');
  });

  it('off the mesh it reads the sources directly; the Bank of Russia (no CORS) is not asked and its cells say why', async () => {
    const dash = FINTERM.dashboards.find((x) => x.id === 'fx') as Dashboard;
    const panel = dash.panels.find((p) => p.id === 'ppp_matrix')!;
    expect(panel.derive).toBe('fx_matrix');
    const asked: string[] = [];
    const rates: Record<string, Record<string, number>> = { '2026-10-30': { EUR: 0.9, JPY: 150, GBP: 0.75, CAD: 1.38, AUD: 1.5, KRW: 1400, CNY: 7.2, INR: 88, BRL: 5.4, ZAR: 17, IDR: 16000, SEK: 9.5, CHF: 0.8 } };
    const ctx: Ctx = { today: '2026-10-30', sources: FINTERM.sources, mesh: FINTERM.mesh, reachable: async () => false,
      get: async (url) => {
        asked.push(url);
        if (url.includes('frankfurter')) return JSON.stringify({ rates });
        if (url.includes('worldbank')) return JSON.stringify([{}, []]);
        if (url.includes('big-mac')) return 'date,iso_a3,currency_code,name,local_price\n2026-07-01,USA,USD,United States,6.22\n2026-07-01,EUZ,EUR,Euro area,6.19\n';
        throw new FetchError('blocked', 'Failed to fetch');
      } };
    const d = await loadPanel(panel, dash, ctx);
    expect(asked.some((u) => u.includes('cbr.ru'))).toBe(false);
    expect(d.rows[0][0]).toBe('DXY');
    expect(d.rows.map((r) => r[0])).toEqual(['DXY', 'EUR', 'JPY', 'GBP', 'CAD', 'AUD', 'KRW', 'CNY', 'INR', 'BRL', 'RUB', 'ZAR', 'IDR']);
    expect(Number(d.rows[0][2])).toBeCloseTo(50.14348112 * [[0.576, 0.9], [0.136, 150], [0.119, 0.75], [0.091, 1.38], [0.042, 9.5], [0.036, 0.8]].reduce((a, [w, x]) => a * Math.pow(x, w), 1), 1);
    expect(d.rows[1][2]).toBe('0.9000 (1.1111)');
    expect(d.rows[1][6]).toBe((6.19 / 6.22).toFixed(4));
    expect(d.note).toContain('sends no CORS header');
    expect(d.note).toContain('RUB today:');
  });
});

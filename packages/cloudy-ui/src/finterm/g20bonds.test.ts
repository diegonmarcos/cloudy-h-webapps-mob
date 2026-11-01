import { describe, expect, it } from 'vitest';
import { FINTERM } from './catalog';
import { FetchError, loadPanel, type Ctx, type Dashboard } from './engine';
import { cpiYoY, dep, g20Row, ma } from './g20bonds';
import { g20Table } from './tables';

// #1397 G20 Sovereign 10Y Bonds: the same fixture as g20bonds.rs (container) and TablesTest.g20BondsMovingAverageFxAnnualisationNetAndReal (APK).
type S = [string, number][];
const end = '2026-10-30';
const y: S = [['2023-09', 3.5], ['2023-11', 9.9], ['2025-10', 3.9], ['2026-09', 4.1], ['2026-10-10', 4.0], ['2026-10-20', 4.2], ['2026-10-30', 4.4]];
const fx: S = [['2023-10-31', 4.0], ['2025-10-30', 5.0], ['2026-10-30', 6.0]];

describe('G20 Sovereign 10Y Bonds maths', () => {
  it('MA30 daily else OECD monthly, FX depreciation annualised, net and real', () => {
    const cpi = cpiYoY([['2025-09-01', 100], ['2026-09-01', 103]])!;
    expect(cpi[0]).toBeCloseTo(3, 12); expect(cpi[1]).toBe('2026-09');
    const d0 = ma(y, end, 30, 3)!; expect(d0[0]).toBeCloseTo(4.2, 12); expect(d0[1]).toBe('daily');
    expect(ma(y, end, 30, 4)).toEqual([4.1, 'monthly 2026-09']);
    expect(ma(y, '2023-10-31', 30, 3)).toEqual([3.5, 'monthly 2023-09']);
    expect(ma(y, '2020-01-01', 30, 3)).toBeNull();
    expect(dep(6, 5, 1)).toBeCloseTo(20, 12);
    const f3 = (Math.cbrt(1.5) - 1) * 100;
    expect(dep(6, 4, 3)).toBeCloseTo(f3, 12);
    const r = g20Row({ cc: 'XX', ccy: 'XXX', flag: 'F', name: 'Testland', bench: 'TB' }, y, fx, cpi, end, 30, 3);
    const want: Record<string, number> = { y0: 4.2, y1: 3.9, y3: 3.5, fx1: 20, fx3: f3, net1: 4.2 - 20, net3: 4.2 - f3, real1: 4.2 - 20 - 3, real3: 4.2 - f3 - 3 };
    for (const [k, w] of Object.entries(want)) expect(r[k] as number).toBeCloseTo(w, 12);
    expect((r.basis as Record<string, string>).y1).toBe('monthly 2025-10');
    expect(r.null_reason).toEqual({});
    const us = g20Row({ cc: 'US', ccy: 'USD' }, y, [], cpi, end, 30, 3);
    expect(us.fx3).toBe(0); expect(us.real1 as number).toBeCloseTo(1.2, 12);
    const ru = g20Row({ cc: 'RU', ccy: 'RUB', no_fx: 'no rate' }, [], [], null, end, 30, 3);
    const w = ru.null_reason as Record<string, string>;
    expect(w.fx1).toBe('no rate'); expect(w.y0).toMatch(/^no 10Y yield/); expect(w.cpi).toBeTruthy(); expect(w.real3).toBeTruthy(); expect(ru.net1).toBeNull();
    const t = g20Table({ id: 'g20_real', columns: ['Country'] } as never, {}, [r, ru], 'test');
    expect(t.rows[0].slice(0, 2)).toEqual(['F Testland', 'TB']); expect(t.rows[0][3]).toBe('4.20'); expect(t.rows[0][2]).toBe(t.rows[0][11]);
    expect(t.note).toContain('RU fx1: no rate'); expect(t.note).toContain('XX y1: monthly 2025-10');
  });

  it('off the mesh it reads OECD and the ECB rates directly; sources without CORS say why', async () => {
    const dash = FINTERM.dashboards.find((x) => x.id === 'world_bonds') as Dashboard;
    const panel = dash.panels.find((p) => p.id === 'g20_real')!;
    expect(panel.derive).toBe('g20_bonds');
    const asked: string[] = [];
    const ctx: Ctx = { today: '2026-10-30', sources: FINTERM.sources, mesh: FINTERM.mesh, reachable: async () => false,
      get: async (url) => {
        asked.push(url);
        if (url.includes('frankfurter')) return JSON.stringify({ rates: { '2026-10-30': { EUR: 0.9 } } });
        if (url.includes('db.nomics')) return JSON.stringify({ series: { docs: [{ series_code: 'DEU.M.IRLT.PA._Z._Z._Z', period: ['2026-09'], value: [2.7] }] } });
        throw new FetchError('blocked', 'Failed to fetch');
      } };
    const d = await loadPanel(panel, dash, ctx);
    expect(asked.some((u) => u.includes('cbr.ru'))).toBe(false);
    expect(d.rows.map((r) => r[1])[0]).toBe('Treasury');
    expect(d.rows.length).toBe(13);
    expect(d.rows[1][3]).toBe('2.70');
    expect(d.note).toContain('DE fx1: less than 1y of daily EUR history');
    expect(d.note).toContain('sends no CORS header');
  });
});

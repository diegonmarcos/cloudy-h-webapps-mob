import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { at, bias, Cb, fmt, heatOf, taylor, transpose, weightedMean, wrap, WORLD, type CbData } from './cb';

// #1539 the CB page logic of the web FinTerm: the GDP-weight aggregation math, heat, the Taylor model, n/a instead of invented values, source and vintage on every value.
const data = JSON.parse(readFileSync(join(__dirname, '../../nav/finterm-cb.json'), 'utf8')) as CbData;
const cb = new Cb(data);

describe('weighted mean (GDP weights)', () => {
  it('is the weighted mean of the countries that have a value', () => {
    const a = weightedMean([[2, 3], [4, 1]]);
    expect(a.value).toBeCloseTo(2.5); expect(a.countries).toBe(2); expect(a.coverage).toBe(1);
  });
  it('drops a country with no value or no weight from both sums, and answers null when none has a value', () => {
    const a = weightedMean([[2, 3], [null, 5], [9, null], [9, 0], [4, 1]]);
    expect(a.value).toBeCloseTo(2.5); expect(a.countries).toBe(2); expect(a.coverage).toBeCloseTo(4 / 9);
    expect(weightedMean([[null, 1]]).value).toBeNull();
  });
  it('the weight option changes the aggregate', () => {
    const c = new Cb({ ...data, countries: { ...data.countries, countries: [{ id: 'US', name: 'US', group: 'DM', aggregate: true }, { id: 'BR', name: 'BR', group: 'EM', aggregate: true }] },
      snapshot: { ...data.snapshot, weights: { ppp: { US: { 2026: 1 }, BR: { 2026: 1 } }, fx: { US: { 2026: 9 }, BR: { 2026: 1 } } },
        countries: { US: { series: { x: { source: 's', release: 'r', vintage: '2026-11-06', fc: { 2026: 1 } } } }, BR: { series: { x: { source: 's', release: 'r', vintage: '2026-11-06', fc: { 2026: 5 } } } } } } });
    expect(c.aggregate(WORLD, 'x', 2026, 'ppp').value).toBeCloseTo(3); expect(c.aggregate(WORLD, 'x', 2026, 'fx').value).toBeCloseTo(1.4);
  });
  it('euro-area members are never aggregated twice, and DM + EM make the World', () => {
    expect(cb.members('DM').some((c) => c.id === 'DE')).toBe(false); expect(cb.members('DM').some((c) => c.id === 'EA')).toBe(true);
    expect(cb.members(WORLD).length).toBe(cb.members('DM').length + cb.members('EM').length);
  });
});

describe('heat, the Taylor model and n/a', () => {
  it('heat is the z-score against the country history (2 sigma = full), null under five actuals', () => {
    expect(heatOf([1, 2, 3, 4, 5], 3)).toBeCloseTo(0); expect(heatOf([1, 2, 3, 4, 5], 9)).toBe(1); expect(heatOf([1, 2, 3, 4, 5], -9)).toBe(-1); expect(heatOf([1, 2], 3)).toBeNull();
  });
  it('Taylor (1999): neutral + target + w x (inflation - target) + w x gap; a missing input is n/a, never guessed', () => {
    const m = data.countries.model.taylor;
    expect(taylor(m, 1.5, 3, 2, -1)).toBeCloseTo(1.5 + 2 + m.inflation_weight * 1 + m.gap_weight * -1);
    expect(taylor(m, null, 3, 2, 0)).toBeNull(); expect(taylor(m, 1, 3, undefined, 0)).toBeNull();
    expect(bias(m, 5, 4)).toBe(1); expect(bias(m, 3, 4)).toBe(-1); expect(bias(m, 4.2, 4)).toBe(0); expect(bias(m, null, 4)).toBeNull();
  });
  it('a value that has no source is n/a and a latent DSGE variable is model-only; the legend explains the dash', () => {
    const t = cb.countriesTable(true, 'dsge', cb.snap.current_year, 'ppp');
    expect(t.rows.flatMap((r) => r.slice(1)).every((c) => c === cb.ui.model_only)).toBe(true);
    expect(cb.ui.na_long).toBe('n/a (no free source)'); expect(cb.ui.model_only).toBe('model-only');
    expect(at(undefined, 2026)).toBeNull();
  });
});

describe('the tables and the committed declarations', () => {
  it('the World / DM / EM aggregates are pinned on the first rows and every country follows', () => {
    const t = cb.countriesTable(false, data.indicators.simple.groups[0].id, cb.snap.current_year, 'ppp');
    expect(t.pinned).toBe(3); expect(t.ids.slice(0, 3)).toEqual([WORLD, 'DM', 'EM']); expect(t.ids.slice(3)).toEqual(cb.countries.map((c) => c.id));
    const inv = transpose(t); expect(inv.rows.length).toBe(t.header.length - 1); expect(inv.header.length).toBe(t.rows.length + 1);
  });
  it('simple = 5 groups; full = 7 groups of 25, 16, 16, 22, 15, 11, 9', () => {
    expect(data.indicators.simple.groups.map((g) => g.items.length)).toEqual([5, 3, 4, 5, 4]);
    expect(data.indicators.full.groups.map((g) => g.items.length)).toEqual([25, 16, 16, 22, 15, 11, 9]);
  });
  it('every series of the snapshot has a source, a release and a vintage date and only numbers', () => {
    let n = 0;
    for (const [c, v] of Object.entries(data.snapshot.countries)) for (const [id, s] of Object.entries(v.series)) {
      expect(cb.indicators[id], `${c}/${id}`).toBeTruthy(); expect(s.source && s.release, `${c}/${id}`).toBeTruthy(); expect(s.vintage, `${c}/${id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const x of [...Object.values(s.hist ?? {}), ...Object.values(s.fc ?? {})]) expect(Number.isFinite(x), `${c}/${id}`).toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(500);
  });
  it('headers wrap to at most three lines and a number keeps a readable width', () => {
    expect(wrap('Real Personal Consumption Expenditures (PCE)').split('\n').length).toBeLessThanOrEqual(3); expect(fmt(2.345)).toBe('2.35'); expect(fmt(1234.5)).toBe('1235');
  });
});

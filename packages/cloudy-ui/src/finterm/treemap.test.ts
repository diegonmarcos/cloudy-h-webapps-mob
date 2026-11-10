import { describe, expect, it } from 'vitest';
import { squarify, type Cell } from './treemap';

// #1612 Squarified treemap for the EQ World Indices Equity holdings breakdown.
const cells = (vals: number[]): Cell<number>[] => vals.map((v, i) => ({ value: v, datum: i }));
const area = (t: { w: number; h: number }) => t.w * t.h;

describe('squarify treemap layout', () => {
  it('tiles the whole box: areas sum to W*H and are proportional to value', () => {
    const W = 400, H = 300;
    const vals = [7, 6.5, 6.2, 3.9, 50];
    const tiles = squarify(cells(vals), W, H);
    expect(tiles.length).toBe(vals.length);
    const sum = tiles.reduce((s, t) => s + area(t), 0);
    expect(sum).toBeCloseTo(W * H, 3);
    const total = vals.reduce((a, b) => a + b, 0);
    tiles.forEach((t, i) => expect(area(t)).toBeCloseTo((vals[i] / total) * W * H, 2));
  });

  it('keeps every tile inside the box with no negative dimensions', () => {
    const W = 320, H = 240;
    for (const t of squarify(cells([40, 25, 15, 10, 6, 4]), W, H)) {
      expect(t.w).toBeGreaterThan(0); expect(t.h).toBeGreaterThan(0);
      expect(t.x).toBeGreaterThanOrEqual(-1e-6); expect(t.y).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.w).toBeLessThanOrEqual(W + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(H + 1e-6);
    }
  });

  it('drops non-positive / non-finite values and preserves input order of the rest', () => {
    const input: Cell<string>[] = [
      { value: 10, datum: 'a' }, { value: 0, datum: 'zero' }, { value: 5, datum: 'b' },
      { value: NaN, datum: 'nan' }, { value: -3, datum: 'neg' },
    ];
    const tiles = squarify(input, 100, 100);
    expect(tiles.map((t) => t.datum)).toEqual(['a', 'b']);
  });

  it('degenerates safely on empty or zero-area input', () => {
    expect(squarify(cells([1, 2, 3]), 0, 100)).toEqual([]);
    expect(squarify([], 100, 100)).toEqual([]);
    expect(squarify(cells([0, 0]), 100, 100)).toEqual([]);
  });

  it('a single cell fills the box', () => {
    const [t] = squarify(cells([42]), 200, 120);
    expect(t).toMatchObject({ x: 0, y: 0, w: 200, h: 120 });
  });
});

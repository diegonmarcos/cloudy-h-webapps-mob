// #1612 Squarified treemap layout for the EQ > World Indices Equity performance breakdown.
// Pure geometry: given weighted cells and a box, return each cell's rectangle. SIZE = weight, drawn by the
// caller; COLOUR = performance, applied by the caller from the app's diverging up/down scale (fin.ts `heat`).
// Squarified (Bruls, Huizing, van Wijk 2000): keep tiles close to square so labels stay legible.

export type Cell<T> = { value: number; datum: T };
export type Tile<T> = { x: number; y: number; w: number; h: number; datum: T };

const worst = (row: number[], side: number, sum: number): number => {
  // max aspect ratio of the row if laid along `side`, given the row's area `sum`
  const max = Math.max(...row), min = Math.min(...row), s2 = sum * sum, side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
};

/**
 * Lay `cells` into a `width`x`height` box (origin top-left), areas proportional to `value`.
 * Non-positive or non-finite values are dropped. Returns tiles in input order (minus drops).
 */
export function squarify<T>(cells: Cell<T>[], width: number, height: number): Tile<T>[] {
  const clean = cells.filter((c) => Number.isFinite(c.value) && c.value > 0);
  const total = clean.reduce((s, c) => s + c.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];
  const area = (width * height) / total; // px^2 per unit value
  const scaled = clean.map((c) => ({ a: c.value * area, datum: c.datum }));
  const out: Tile<T>[] = [];
  // free rectangle, consumed from the top-left as rows are placed on the shorter side
  let x = 0, y = 0, w = width, h = height;
  let i = 0;
  while (i < scaled.length) {
    const side = Math.min(w, h);
    const row: { a: number; datum: T }[] = [];
    let rowSum = 0;
    // grow the row while it keeps the worst aspect ratio from getting worse
    while (i < scaled.length) {
      const next = scaled[i];
      const cur = row.map((r) => r.a);
      const withNext = [...cur, next.a];
      if (row.length && worst(withNext, side, rowSum + next.a) > worst(cur, side, rowSum)) break;
      row.push(next); rowSum += next.a; i++;
    }
    // place the row across the shorter side, stacked along it; thickness fills the longer side
    const thick = rowSum / side;
    let off = 0;
    for (const r of row) {
      const len = r.a / thick;
      if (w <= h) out.push({ x: x + off, y, w: len, h: thick, datum: r.datum });
      else out.push({ x, y: y + off, w: thick, h: len, datum: r.datum });
      off += len;
    }
    // shrink the free rectangle by the strip just placed
    if (w <= h) { y += thick; h -= thick; } else { x += thick; w -= thick; }
  }
  return out;
}

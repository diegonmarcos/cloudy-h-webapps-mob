// FX vs PPP (#1374): the maths of the container's /v1/fx/ppp (store.rs fx_ppp_row) and FxPpp.kt, for the direct-fetch fallback.
// Rates are local currency per USD; series are [date or year, value], oldest first.
export type S = [string, number][];
export type FxRow = { cc: string; ccy: string; label?: string; group?: string; no_fx?: string };

/** PPP carried from its base year by relative inflation: ppp0 * (home CPI growth / US CPI growth). */
export const pppToday = (ppp0: number, home0: number, home1: number, us0: number, us1: number) => (ppp0 * (home1 / home0)) / (us1 / us0);
/** A year-ago rate in today's prices: the rate that leaves the real exchange rate unchanged after a year of home vs US inflation. */
export const realAdjust = (rate: number, home0: number, home1: number, us0: number, us1: number) => (rate * (home1 / home0)) / (us1 / us0);
export const pct = (a: number, b: number) => (a / b - 1) * 100;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Mean over the `days` calendar days ending at `end` (YYYY-MM-DD); null when the window holds no observation. */
export function windowAvg(s: S, end: string, days: number): number | null {
  const e = Date.parse(`${end}T00:00:00Z`); const a = iso(e - Math.max(days - 1, 0) * 864e5);
  const v = s.filter(([d]) => d >= a && d <= end).map((x) => x[1]);
  return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
}
const atYear = (s: S, y: number) => s.find(([d]) => d === String(y))?.[1];
const yearOf = (s: S) => (s.length ? Number(s[s.length - 1][0].slice(0, 4)) : null);

export function fxPppRow(r: FxRow, fx: S, ppp: S, cpi: S, usCpi: S, win: number): Record<string, unknown> {
  const why: Record<string, string> = {};
  const spot = fx.length ? fx[fx.length - 1] : null;
  if (!spot) why.spot = r.no_fx || 'no free official daily USD rate for this currency (ECB reference rates)';
  const y0 = yearOf(ppp); const a = yearOf(cpi), b = yearOf(usCpi); const y1 = a !== null && b !== null ? Math.min(a, b) : null;
  const base = y0 !== null ? atYear(ppp, y0) : undefined;
  let pppNow: number | null = null;
  if (y0 === null || base === undefined) why.ppp = 'no World Bank PPP conversion factor (PA.NUS.PPP) for this country';
  else if (y1 !== null && y1 >= y0) {
    const h0 = atYear(cpi, y0), h1 = atYear(cpi, y1), u0 = atYear(usCpi, y0), u1 = atYear(usCpi, y1);
    if (h0 !== undefined && h1 !== undefined && u0 !== undefined && u1 !== undefined) pppNow = pppToday(base, h0, h1, u0, u1);
    else why.ppp = 'no World Bank CPI (FP.CPI.TOTL) for the PPP base year';
  } else pppNow = base;
  const over = pppNow !== null && spot ? pct(pppNow, spot[1]) : null;
  const now = spot ? windowAvg(fx, spot[0], win) : null;
  const ago = spot ? windowAvg(fx, iso(Date.parse(`${spot[0]}T00:00:00Z`) - 365 * 864e5), win) : null;
  if (spot && ago === null) why.year_ago = 'less than a year of FX history';
  const real = y1 !== null ? [atYear(cpi, y1 - 1), atYear(cpi, y1), atYear(usCpi, y1 - 1), atYear(usCpi, y1)] : null;
  const realOk = real && real.every((x) => x !== undefined) ? (real as number[]) : null;
  if (ago !== null && !realOk) why.real = 'no World Bank CPI for the last two years on both sides';
  const agoReal = ago !== null && realOk ? realAdjust(ago, realOk[0], realOk[1], realOk[2], realOk[3]) : null;
  const change = agoReal !== null && now !== null ? pct(agoReal, now) : null;
  return { country: r.cc, currency: r.ccy, label: r.label ?? '', group: r.group ?? '', spot: spot?.[1] ?? null, spot_date: spot?.[0] ?? null, ppp: pppNow, ppp_base_year: y0, cpi_year: y1,
    over_under_pct: over, avg_window: now, avg_window_year_ago: ago, avg_window_year_ago_real: agoReal, real_change_pct: change, window_days: win, null_reason: why };
}

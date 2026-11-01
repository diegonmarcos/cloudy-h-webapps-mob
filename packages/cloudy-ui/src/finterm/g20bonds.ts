// G20 Sovereign 10Y Bonds (#1397): the maths of the container's /v1/bonds/g20-real (finterm/g20bonds.rs) and G20Bonds.kt, for the direct-fetch
// fallback, tested on the same fixture. Yields in %; a yield series mixes daily (YYYY-MM-DD) and monthly (YYYY-MM, OECD) points; FX is LCU per USD.
import { windowAvg, type S } from './fxppp';

export type GRow = { cc: string; ccy: string; a3?: string; flag?: string; name?: string; bench?: string; seg?: string; fx?: string; no_fx?: string };
type O = Record<string, unknown>;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const minus = (d: string, days: number) => iso(Date.parse(`${d}T00:00:00Z`) - days * 864e5);

/** The 30-day moving average ending at `end`: the daily points in the window when there are at least `minDaily`, else the monthly average of
 *  the month the window centres on (or up to two months before it); null when neither exists. Second: the basis. */
export function ma(s: S, end: string, win: number, minDaily: number): [number, string] | null {
  const a = minus(end, win - 1);
  const d = s.filter(([k]) => k.length === 10 && k >= a && k <= end).map((x) => x[1]);
  if (d.length && d.length >= minDaily) return [d.reduce((x, y) => x + y, 0) / d.length, 'daily'];
  const mid = minus(end, Math.trunc(win / 2));
  const hi = mid.slice(0, 7); const lo = minus(mid, 62).slice(0, 7);
  const m = s.filter(([k]) => k.length === 7 && k <= hi && k >= lo).sort((x, y) => (x[0] < y[0] ? -1 : 1)).pop();
  return m ? [m[1], `monthly ${m[0]}`] : null;
}
/** Local currency depreciation vs USD over `years`, annualised, in %: (today / past)^(1/years) - 1. */
export const dep = (today: number, past: number, years: number) => (Math.pow(today / past, 1 / years) - 1) * 100;
/** Net USD yield: nominal minus the FX depreciation. */
export const net = (y: number, fx: number) => y - fx;
/** Real net USD return: net minus US CPI. */
export const real = (n: number, cpi: number) => n - cpi;

/** Trailing 12-month CPI change in % from a monthly index: the last point over the same month a year before. */
export function cpiYoY(s: S): [number, string] | null {
  if (!s.length) return null;
  const [d, v] = [...s].sort((x, y) => (x[0] < y[0] ? -1 : 1))[s.length - 1];
  const k = `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
  const v0 = s.find(([x]) => x === k)?.[1];
  return v0 === undefined ? null : [(v / v0 - 1) * 100, d.slice(0, 7)];
}

export const KEYS = ['y0', 'y1', 'y3', 'fx1', 'fx3', 'net1', 'net3', 'cpi', 'real1', 'real3'];

/** One country row in the route's shape; every empty cell carries its reason in null_reason, every monthly yield its basis. */
export function g20Row(r: GRow, y: S, fx: S, cpi: [number, string] | null, end: string, win: number, minDaily: number): O {
  const why: Record<string, string> = {}; const basis: Record<string, string> = {};
  const o: O = { cc: r.cc, ccy: r.ccy, flag: r.flag ?? '', name: r.name ?? '', bench: r.bench ?? '', seg: r.seg ?? '' };
  const v: Record<string, number | null> = {};
  for (const [k, n] of [['y0', 0], ['y1', 1], ['y3', 3]] as [string, number][]) {
    const at = minus(end, 365 * n); const m = ma(y, at, win, minDaily);
    v[k] = m ? m[0] : null;
    if (!m) why[k] = `no 10Y yield (daily or OECD monthly) around ${at}`; else if (m[1] !== 'daily') basis[k] = m[1];
  }
  if (r.ccy === 'USD') { v.fx1 = 0; v.fx3 = 0; }
  else {
    const f0 = windowAvg(fx, end, win);
    for (const [k, n] of [['fx1', 1], ['fx3', 3]] as [string, number][]) {
      const p = windowAvg(fx, minus(end, 365 * n), win);
      v[k] = f0 !== null && p !== null ? dep(f0, p, n) : null;
      if (v[k] === null) why[k] = !fx.length ? r.no_fx || `no daily USD rate for ${r.ccy}` : f0 === null ? `no ${r.ccy} rate in the last ${win} days` : `less than ${n}y of daily ${r.ccy} history`;
    }
  }
  v.cpi = cpi ? cpi[0] : null;
  if (!cpi) why.cpi = 'no US CPI (FRED CPIAUCSL) a year apart'; else o.cpi_month = cpi[1];
  for (const n of [1, 3]) {
    const y0 = v.y0; const f = v[`fx${n}`];
    v[`net${n}`] = y0 !== null && f !== null ? net(y0, f) : null;
    if (v[`net${n}`] === null) why[`net${n}`] = `needs the 10Y yield today and the ${n}Y FX change`;
    const ne = v[`net${n}`]; const c = v.cpi;
    v[`real${n}`] = ne !== null && c !== null ? real(ne, c) : null;
    if (v[`real${n}`] === null) why[`real${n}`] = `needs the ${n}Y net USD yield and US CPI`;
  }
  for (const k of KEYS) o[k] = v[k];
  o.basis = basis; o.null_reason = why; o.as_of = end;
  return o;
}

const num = (o: O, k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : null);

/** Country | Benchmark | 1Y real (lead) | 10Y MA30 today, -1y, -3y | FX 1Y, 3Y ann. | net 1Y, 3Y | US CPI | real 1Y, 3Y. */
export function g20Cells(rows: O[], signed: (v: number, d: number) => string, dash: string): string[][] {
  const n = (o: O, k: string) => { const x = num(o, k); return x === null ? dash : x.toFixed(2); };
  const s = (o: O, k: string) => { const x = num(o, k); return x === null ? dash : signed(x, 2); };
  return rows.map((o) => [`${o.flag ?? ''} ${o.name ?? ''}`.trim(), String(o.bench ?? ''), s(o, 'real1'), n(o, 'y0'), n(o, 'y1'), n(o, 'y3'), s(o, 'fx1'), s(o, 'fx3'), s(o, 'net1'), s(o, 'net3'), n(o, 'cpi'), s(o, 'real1'), s(o, 'real3')]);
}

export const g20Notes = (rows: O[], k: 'basis' | 'null_reason') => rows.flatMap((o) => Object.entries((o[k] as Record<string, string>) ?? {}).map(([a, b]) => `${o.cc} ${a}: ${b}`));

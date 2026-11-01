// G20 FX & PPP Matrix (#1396): the maths of the container's /v1/fx/ppp-matrix (finterm/fxmatrix.rs) and FxMatrix.kt, for the direct-fetch
// fallback, tested on the same fixture. Rates are local currency per USD (LCU/USD); series are [date or year, value], oldest first.
import { fxPppRow, windowAvg, type S } from './fxppp';

export type MRow = { ccy: string; cc: string; a3?: string; seg?: string; label?: string; no_fx?: string; fx?: string; market_quote?: boolean };
export type Leg = { ccy: string; cc: string; a3?: string; weight: number };
export type Dxy = { label?: string; constant: number; legs: Leg[] };
type O = Record<string, unknown>;

/** RPPP: a historical rate in today's prices, S_hist * (1 + pi_dom) / (1 + pi_US), pi the cumulative CPI growth over the window. */
export const rppp = (sHist: number, home0: number, home1: number, us0: number, us1: number) => (sHist * (home1 / home0)) / (us1 / us0);
/** The ICE dollar index from LCU/USD legs: constant * prod(rate ^ weight). */
export const dxy = (constant: number, legs: [number, number][]) => legs.reduce((acc, [w, x]) => acc * Math.pow(x, w), constant);
/** Today / x - 1, in percent. */
export const diff = (today: number, x: number) => (today / x - 1) * 100;
export const maKey = (y: number) => `ma_${y}y`;
export const keys = (lags: number[]) => [...lags.map(maKey), 'macro_ppp', 'retail_ppp'];

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const atYear = (s: S, y: number) => s.find(([d]) => d === String(y))?.[1];
const lastYear = (s: S) => (s.length ? Number(s[s.length - 1][0].slice(0, 4)) : null);
const num = (o: O, k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : null);

function diffs(o: O, lags: number[]) {
  const t = num(o, 'today');
  for (const k of keys(lags)) { const x = num(o, k); o[`diff_${k}`] = t !== null && x !== null ? diff(t, x) : null; }
}

/** One currency row: today, the real 30MA at each lag, macro PPP, Big Mac PPP and the four diffs (the route's shape). */
export function fxMatrixRow(r: MRow, fx: S, ppp: S, cpi: S, usCpi: S, bm: S, bmUs: S, win: number, lags: number[]): O {
  const why: Record<string, string> = {};
  const o: O = { ccy: r.ccy, cc: r.cc ?? '', seg: r.seg ?? '', label: r.label ?? '' };
  const today = fx.length ? fx[fx.length - 1] : null;
  if (!today) why.today = r.no_fx || 'no free official daily USD rate for this currency';
  const a = lastYear(cpi), b = lastYear(usCpi); const y1 = a !== null && b !== null ? Math.min(a, b) : null;
  for (const k of lags) {
    const key = maKey(k);
    const raw = today ? windowAvg(fx, iso(Date.parse(`${today[0]}T00:00:00Z`) - 365 * k * 864e5), win) : null;
    if (today && raw === null) why[key] = `less than ${k}y of daily FX history`;
    let adj: number | null = null;
    if (raw !== null) {
      const v = y1 !== null ? [atYear(cpi, y1 - k), atYear(cpi, y1), atYear(usCpi, y1 - k), atYear(usCpi, y1)] : null;
      if (!v || v.some((x) => x === undefined)) why[key] = `no World Bank CPI (FP.CPI.TOTL) for ${y1 !== null ? y1 - k : '?'} and ${y1 ?? '?'} on both sides`;
      else adj = rppp(raw, v[0]!, v[1]!, v[2]!, v[3]!);
    }
    o[key] = adj; o[`${key}_raw`] = raw;
  }
  const p = fxPppRow({ cc: r.cc, ccy: r.ccy, no_fx: r.no_fx }, fx, ppp, cpi, usCpi, win);
  const macro = typeof p.ppp === 'number' ? p.ppp : null;
  if (macro === null) why.macro_ppp = (p.null_reason as Record<string, string>)?.ppp || 'no World Bank PPP';
  o.macro_ppp = macro;
  let retail: number | null = null;
  const us = bmUs.length ? bmUs[bmUs.length - 1] : null;
  if (!us) why.retail_ppp = "no US Big Mac price in The Economist's data";
  else {
    const local = bm.find(([d]) => d === us[0])?.[1];
    if (local === undefined) why.retail_ppp = bm.length ? `no ${r.ccy} Big Mac price in the ${us[0]} survey (last ${bm[bm.length - 1][0]})` : `The Economist's Big Mac index does not cover ${r.ccy}`;
    else { retail = local / us[1]; o.bigmac_date = us[0]; }
  }
  o.retail_ppp = retail;
  o.today = today?.[1] ?? null; o.today_date = today?.[0] ?? null; o.cpi_year = y1;
  if (r.market_quote) o.market_quote = today ? 1 / today[1] : null;
  diffs(o, lags);
  o.null_reason = why;
  return o;
}

/** The DXY row: each column is the index of the legs' values in that column; a missing leg names itself (and its own reason). */
export function dxyRow(d: Dxy, byCcy: Map<string, O>, lags: number[]): O {
  const why: Record<string, string> = {};
  const o: O = { ccy: 'DXY', seg: 'Index', label: d.label ?? '' };
  for (const k of ['today', ...keys(lags)]) {
    const v: [number, number][] = []; let miss: string | null = null;
    for (const l of d.legs) { const x = byCcy.get(l.ccy); const n = x ? num(x, k) : null; if (n === null) { miss = l.ccy; break; } v.push([l.weight, n]); }
    if (miss !== null) {
      const leg = ((byCcy.get(miss)?.null_reason as Record<string, string> | undefined) ?? {})[k] ?? '';
      why[k] = leg ? `needs the ${miss} leg (${leg})` : `needs the ${miss} leg`; o[k] = null;
    } else o[k] = dxy(d.constant, v);
  }
  o.today_date = [...byCcy.values()].map((x) => x.today_date).filter((x): x is string => typeof x === 'string').sort().pop() ?? null;
  diffs(o, lags);
  o.null_reason = why;
  return o;
}

function cells(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** The Economist big-mac-full-index.csv: a3 -> [date, local_price][], oldest first. */
export function bigMac(csv: string): Map<string, S> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const out = new Map<string, S>();
  if (!lines.length) return out;
  const h = cells(lines[0].replace(/^﻿/, '')); const [iD, iA, iP] = ['date', 'iso_a3', 'local_price'].map((n) => h.indexOf(n));
  if (iD < 0 || iA < 0 || iP < 0) return out;
  for (const l of lines.slice(1)) { const c = cells(l); const p = Number(c[iP]); if (c[iP] && Number.isFinite(p)) out.set(c[iA], [...(out.get(c[iA]) ?? []), [c[iD], p]]); }
  for (const [k, v] of out) out.set(k, v.sort((x, y) => (x[0] < y[0] ? -1 : 1)));
  return out;
}

/** Currency | Seg. | Today (market quote) | 30MA -1y adj | 30MA -3y adj | Macro PPP | Retail PPP | four signed diffs (%, coloured); reasons in the note. */
export function fxMatrixCells(rows: O[], lags: number[], signed: (v: number, d: number) => string, dash: string): string[][] {
  const dg = (o: O) => (o.ccy === 'DXY' ? 2 : (num(o, 'today') ?? 0) >= 100 ? 1 : 4);
  const n = (o: O, k: string) => { const x = num(o, k); return x === null ? dash : x.toFixed(dg(o)); };
  const p = (o: O, k: string) => { const x = num(o, k); return x === null ? dash : signed(x, 1); };
  const ks = keys(lags);
  return rows.map((o) => [String(o.ccy), String(o.seg ?? ''), n(o, 'today') + (num(o, 'market_quote') !== null ? ` (${(o.market_quote as number).toFixed(4)})` : ''), ...ks.map((k) => n(o, k)), ...ks.map((k) => p(o, `diff_${k}`))]);
}

export const reasonsOf = (rows: O[]) => rows.flatMap((o) => Object.entries((o.null_reason as Record<string, string>) ?? {}).map(([k, v]) => `${o.ccy} ${k}: ${v}`));

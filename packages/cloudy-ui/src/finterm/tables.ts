// The per-item tables of the web FinTerm: a port of the APK's Performance.kt + Tables.kt (#1370). `performance` = one row per symbol with
// WTD, MTD, YTD | 1M, 3M, 1Y, 3Y, 10Y (periods over a year annualised, CAGR) and optional whole-year / risk columns; `portfolio_performance`
// = a model portfolio's legs through declared ETF proxies, rebalanced daily; `yields_matrix` = country x tenor, spot or 1y forward, with
// GDP-weighted World / DM / EM averages. Each item routes the container's /v1 first, then the panel's own source and its fallbacks (a source
// a browser cannot read is skipped); a route with `symbol_map` serves only the items it maps. A missing value is a dash with its reason in the note.
import { FetchError, apiRoute, browserReadable, buildUrl, forwardRate, NA, paramsOf, parseFeed, sig, slotsOf, type Ctx, type Dashboard, type Fetch, type Got, type Panel, type PanelData, type Route, type Source } from './engine';

export const PERF_COLUMNS = ['WTD', 'MTD', 'YTD', '1M', '3M', '1Y', '3Y', '10Y'];
export const COL_VOL = 'Vol 1Y';
export const COL_MDD = 'MaxDD 1Y';
export const TABLE_DERIVES = ['performance', 'portfolio_performance', 'yields_matrix'];

export type Close = [string, number]; // [YYYY-MM-DD, close]

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const minusMonths = (s: string, m: number) => { const d = day(s); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d.getUTCDate(), last)))); };
const minusYears = (s: string, y: number) => minusMonths(s, 12 * y);

export const simple = (start: number | null | undefined, end: number): number | null => (start == null || start <= 0 || end <= 0 ? null : end / start - 1);
export const cagr = (start: number | null | undefined, end: number, years: number): number | null =>
  start == null || start <= 0 || end <= 0 || years <= 0 ? null : years <= 1 ? simple(start, end) : Math.pow(end / start, 1 / years) - 1;

const sorted = (c: Close[]) => c.filter((x) => Number.isFinite(x[1])).slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const before = (s: Close[], d: string) => { let v: number | null = null; for (const [x, y] of s) if (x < d) v = y; return v; };
const onOrBefore = (s: Close[], d: string) => { if (!s.length || s[0][0] > d) return null; let v: number | null = null; for (const [x, y] of s) if (x <= d) v = y; return v; };

/** Port of Performance.row: fractional returns per PERF_COLUMNS. */
export function perfRow(closes: Close[]): (number | null)[] {
  const s = sorted(closes);
  if (!s.length) return PERF_COLUMNS.map(() => null);
  const [asOf, last] = s[s.length - 1];
  const d = day(asOf); const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = iso(new Date(d.getTime() - dow * 86400000));
  return [
    simple(before(s, monday), last), simple(before(s, `${asOf.slice(0, 8)}01`), last), simple(before(s, `${asOf.slice(0, 4)}-01-01`), last),
    simple(onOrBefore(s, minusMonths(asOf, 1)), last), simple(onOrBefore(s, minusMonths(asOf, 3)), last), simple(onOrBefore(s, minusYears(asOf, 1)), last),
    cagr(onOrBefore(s, minusYears(asOf, 3)), last, 3), cagr(onOrBefore(s, minusYears(asOf, 10)), last, 10),
  ];
}
/** Port of Performance.trailing: whole-year CAGR (25Y). */
export function trailing(closes: Close[], years: number): number | null {
  const s = sorted(closes); if (!s.length || years <= 0) return null;
  const [asOf, last] = s[s.length - 1];
  return cagr(onOrBefore(s, minusYears(asOf, years)), last, years);
}
export const perfFormat = (v: number | null) => (v == null || !Number.isFinite(v) ? NA : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`);

const lastYear = (closes: Close[]) => { const s = sorted(closes).filter((x) => x[1] > 0); if (!s.length) return []; const from = minusYears(s[s.length - 1][0], 1); return s.filter((x) => x[0] >= from); };
export function vol1y(closes: Close[]): number | null {
  const y = lastYear(closes).map((x) => x[1]); const r = y.slice(1).map((v, i) => Math.log(v / y[i]));
  if (r.length < 20) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt((r.reduce((a, b) => a + (b - m) * (b - m), 0) / (r.length - 1)) * 252);
}
export function maxDrawdown1y(closes: Close[]): number | null {
  const y = lastYear(closes); if (!y.length) return null;
  let peak = 0, dd = 0; for (const [, v] of y) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); }
  return dd;
}
export function column(col: string, closes: Close[], row: (number | null)[]): number | null {
  const i = PERF_COLUMNS.indexOf(col);
  if (i >= 0) return row[i];
  if (col === COL_VOL) return vol1y(closes);
  if (col === COL_MDD) return maxDrawdown1y(closes);
  const m = /^(\d+)Y$/.exec(col);
  return m ? trailing(closes, Number(m[1])) : null;
}
const fmt = (col: string, v: number | null) => (col === COL_VOL && v != null && Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : perfFormat(v));

/** Port of Tables.rebalanced: constant weights, rebalanced daily, over the dates every leg has (V0 = 100). */
export function rebalanced(legs: [number, Close[]][]): Close[] {
  if (!legs.length || legs.some((l) => !l[1].length)) return [];
  const maps = legs.map((l) => new Map(l[1]));
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  if (!dates.length) return [];
  const tw = legs.reduce((a, l) => a + l[0], 0);
  const out: Close[] = [[dates[0], 100]]; let v = 100;
  for (let i = 1; i < dates.length; i++) { v *= legs.reduce((a, l, k) => a + (l[0] / tw) * (maps[k].get(dates[i])! / maps[k].get(dates[i - 1])!), 0); out.push([dates[i], v]); }
  return out;
}
export function weighted(values: [number, number | null][]): number | null {
  const have = values.filter((x) => x[1] != null && x[0] > 0); const w = have.reduce((a, x) => a + x[0], 0);
  return !have.length || w <= 0 ? null : have.reduce((a, x) => a + x[0] * (x[1] as number), 0) / w;
}
/** Default declared minimum (`min_coverage_gdp`): an average is shown only when its countries with a value hold this GDP share. */
export const MIN_COVERAGE = 0.6;
export const COL_COV = 'Cov';
/** Share (0..1) of the members' GDP held by the members that have a value. */
export function coverage(values: [number, number | null][]): number {
  const tot = values.filter((x) => x[0] > 0).reduce((a, x) => a + x[0], 0);
  return tot <= 0 ? 0 : values.filter((x) => x[0] > 0 && x[1] != null).reduce((a, x) => a + x[0], 0) / tot;
}
/** weighted() gated by coverage(): null ("—", insufficient coverage) below min. */
export const gatedAverage = (values: [number, number | null][], min: number): number | null => (coverage(values) + 1e-12 < min ? null : weighted(values));
export const pct0 = (x: number) => `${(x * 100).toFixed(0)}%`;
export const SHORT_MAX = 12;
/** One-line name cell (Tables.shortName): "Technology (XLK)" -> "XLK Technology", long labels cut to whole 4-letter words. */
export function shortName(label: string): string {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(label.trim()); const base = (m ? m[1] : label).trim();
  const short = base.length <= SHORT_MAX ? base : base.split(/\s+/).filter(Boolean).map((w) => (w.length > 4 ? w.slice(0, 4) : w))
    .reduce((acc, w) => (!acc ? w : acc.length + 1 + w.length <= SHORT_MAX ? `${acc} ${w}` : acc), '');
  return m ? `${m[2].trim()} ${short}`.trim() : short;
}
export function cell(curve: [number, number][], t: number, forward: boolean, start: number): number | null {
  if (forward) { const r = forwardRate(curve, start, t); return curve.length && Number.isFinite(r) ? r : null; }
  const p = curve.find((x) => Math.abs(x[0] - t) < 0.02); return p ? p[1] : null;
}

// ---- fetch

type ItemGot = { got: Got; by: string; why: string };
type TFetch = Fetch & Route & { symbol_map?: Record<string, string>; proxies?: Record<string, string>; tenors?: [string, number][]; groups?: Record<string, string[]>; gdp_usd_bn?: Record<string, number>; forward_start_years?: number; min_coverage_gdp?: number };
const empty = (): Got => ({ points: [], events: [], bars: [], kv: [], rows: [], links: [] });
const isEmpty = (g: Got) => !g.points.length && !g.events.length && !g.bars.length && !g.kv.length && !g.rows.length;
const fillv = (v: string, sl: Record<string, string>) => Object.entries(sl).reduce((x, [k, y]) => x.split(`{${k}}`).join(y), v);
export const symbolFor = (route: { symbol_map?: Record<string, string> }, item: string): string | null => (route.symbol_map ? route.symbol_map[item] || null : item);

async function gather(item: string, source: Source, f: TFetch, api: { source: Source; base: string } | null, ctx: Ctx): Promise<ItemGot> {
  const why: string[] = [];
  const p = f.primary as (TFetch['primary'] & { symbol_map?: Record<string, string> }) | undefined;
  if (p?.api) {
    const sym = symbolFor(p, item);
    if (!api) why.push('mesh off');
    else if (sym) {
      try {
        const sl = { ...slotsOf(f, ctx.today, [sym]), each: sym };
        const g = parseFeed(p.parse || 'finterm_v1', await ctx.get(buildUrl(api.base, fillv(p.api, sl), paramsOf(p).map(([k, v]) => [k, fillv(v, sl)] as [string, string]))), { spec: f, each: sym });
        if (!isEmpty(g)) return { got: g, by: api.source.name, why: '' };
        why.push(`${api.source.name}: empty`);
      } catch { why.push(`${api.source.name}: no answer`); }
    }
  }
  const routes: [Source, TFetch][] = [[source, f]];
  for (const fb of f.fallbacks ?? []) {
    const s = ctx.sources.find((x) => x.id === fb.source); if (!s) continue;
    const { path: _p, params: _q, provider: _v, fallbacks: _f, primary: _r, each: _e, ...rest } = f;
    routes.push([s, { ...rest, ...fb } as TFetch]);
  }
  for (const [s, spec] of routes) {
    const sym = symbolFor(spec, item); if (!sym) continue;
    if (!browserReadable(s)) { why.push(`${s.name}: no CORS (mesh only)`); continue; }
    try {
      const sl = { ...slotsOf(spec, ctx.today, [sym]), each: sym };
      const g = parseFeed(spec.provider || s.connector || '', await ctx.get(buildUrl(s.endpoint, spec.path ?? '', paramsOf(spec).map(([k, v]) => [k, fillv(v, sl)] as [string, string]), sl)), { spec, each: sym, paths: s.paths });
      if (!isEmpty(g)) return { got: g, by: s.name, why: '' };
      why.push(`${s.name}: empty`);
    } catch { why.push(`${s.name}: no answer`); }
  }
  return { got: empty(), by: '', why: why.join('; ') || `no source for ${item}` };
}

export const closesOf = (g: Got): Close[] => {
  const m = new Map<string, number>(); for (const b of g.bars) if (b.date.length >= 10 && !m.has(b.date.slice(0, 10))) m.set(b.date.slice(0, 10), b.c);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
};
const servedBy = (all: ItemGot[]) => [...new Set(all.map((x) => x.by).filter(Boolean))].join(' + ');

export function performance(panel: Panel, f: TFetch, got: [string, ItemGot][]): PanelData {
  const perf = (panel.columns ?? []).slice(2); const labels = f.labels ?? {}; const missing: string[] = []; let asOf = '';
  const rows = got.map(([item, ig]) => {
    const cl = closesOf(ig.got); const name = labels[item] || item; const cellName = shortName(name);
    if (!cl.length) { missing.push(`${name}: ${ig.why}`); return [cellName, NA, ...perf.map(() => NA)]; }
    const last = cl[cl.length - 1]; if (last[0] > asOf) asOf = last[0];
    const row = perfRow(cl); const short = perf.filter((c) => column(c, cl, row) === null);
    if (short.length) missing.push(`${name} ${short.join('/')}: history from ${cl[0][0]}`);
    return [cellName, sig(last[1]), ...perf.map((c) => fmt(c, column(c, cl, row)))];
  });
  return { columns: panel.columns ?? [], rows, links: [], chart: [], asOf, note: missing.length ? `— ${missing.join(' · ')}` : '', servedBy: servedBy(got.map((x) => x[1])),
    details: got.map(([item]) => labels[item] || item) };
}

export function portfolio(panel: Panel, f: TFetch, legs: [string, number][], got: Map<string, ItemGot>): PanelData {
  const perf = (panel.columns ?? []).slice(2); const proxies = f.proxies ?? {};
  const series = legs.map(([n, w]) => [n, w, closesOf(got.get(n)?.got ?? empty())] as [string, number, Close[]]);
  const port = rebalanced(series.map((x) => [x[1], x[2]]));
  const line = (label: string, cl: Close[]) => (cl.length ? ((r) => [label, sig(cl[cl.length - 1][1]), ...perf.map((c) => fmt(c, column(c, cl, r)))])(perfRow(cl)) : [label, NA, ...perf.map(() => NA)]);
  const missing = series.filter((x) => !x[2].length).map((x) => `${x[0]}: ${got.get(x[0])?.why ?? ''}`);
  const note = `${port.length ? `Daily rebalanced from ${port[0][0]}; legs priced by ETF proxies.` : ''}${missing.length ? ` — ${missing.join(' · ')}` : ''}`.trim();
  const title = `Portfolio ${legs.map((l) => l[1]).join('/')}`;
  return { columns: panel.columns ?? [], rows: [line(title, port), ...series.map(([n, w, cl]) => line(`${proxies[n] ?? ''} ${n} ${w}%`.trim(), cl))],
    links: [], chart: [], asOf: port.length ? port[port.length - 1][0] : '', note, servedBy: servedBy([...got.values()]),
    details: [`${title}, daily rebalanced`, ...series.map(([n, w]) => `${n} ${w}% (${proxies[n] ?? ''})`)] };
}

export function curveOf(f: TFetch, g: Got): [number, number][] {
  const out = new Map<number, number>();
  for (const p of g.points) { const x = f.years && p.key in f.years ? f.years[p.key] : p.x; if (x > 0 && Number.isFinite(p.value) && !out.has(x)) out.set(x, p.value); }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

export function matrix(panel: Panel & { mode?: string }, f: TFetch, got: [string, ItemGot][]): PanelData {
  const forward = panel.mode === 'forward'; const start = f.forward_start_years ?? 1; const ts = f.tenors ?? [];
  const labels = f.labels ?? {}; const gdp = f.gdp_usd_bn ?? {}; const dm = f.groups?.DM ?? []; const em = f.groups?.EM ?? [];
  const curves = new Map(got.map(([k, ig]) => [k, curveOf(f, ig.got)]));
  const cells = new Map([...curves].map(([k, cv]) => [k, ts.map(([, y]) => cell(cv, y, forward, start))]));
  const min = f.min_coverage_gdp ?? MIN_COVERAGE; const hasCov = (panel.columns ?? [])[1] === COL_COV;
  const vals = (m: string[], i: number) => m.map((c) => [gdp[c] ?? 0, cells.get(c)?.[i] ?? null] as [number, number | null]);
  const avg = (m: string[]) => ts.map((_, i) => gatedAverage(vals(m, i), min));
  const cov = (m: string[]) => ts.reduce((a, _, i) => Math.max(a, coverage(vals(m, i))), 0);
  const world = [...dm, ...em]; const worldGdp = world.reduce((a, c) => a + (gdp[c] ?? 0), 0);
  const row = (label: string, c: string, v: (number | null)[]) => [label, ...(hasCov ? [c] : []), ...v.map((x) => (x == null ? NA : x.toFixed(2)))];
  const avgs: [string, string[]][] = [['World avg', world], ['DM avg', dm], ['EM avg', em]];
  const thin = avgs.filter(([, m]) => avg(m).some((x) => x == null) && cov(m) + 1e-12 < min).map(([l, m]) => `${l} ${pct0(cov(m))}`);
  const noCurve = got.filter(([k]) => !curves.get(k)?.length).map(([k, ig]) => `${k} (${ig.why})`);
  const gaps = got.filter(([k]) => curves.get(k)?.length).map(([k]) => [k, ts.filter((_, i) => cells.get(k)![i] == null).map((t) => t[0])] as [string, string[]]).filter((x) => x[1].length).map(([k, m]) => `${k} ${m.join('/')}`);
  const note = [forward ? `${start}y-forward curve from each spot curve (Forward.rate).` : null,
    `Averages GDP-weighted (IMF, USD), shown only when the countries with a value hold ${pct0(min)} of the group's GDP; Cov = that share (country rows: share of World GDP).`,
    thin.length ? `— insufficient coverage: ${thin.join(', ')} < ${pct0(min)}.` : null,
    noCurve.length ? `— no curve: ${noCurve.join(', ')}` : null, gaps.length ? `— no point at tenor: ${gaps.join(', ')}` : null].filter(Boolean).join(' ');
  const asOf = got.flatMap(([, ig]) => ig.got.points.map((p) => p.date)).reduce((m, d) => (d > m ? d : m), '');
  return { columns: panel.columns ?? [], rows: [...avgs.map(([l, m]) => row(l, pct0(cov(m)), avg(m))), ...got.map(([k]) => row(labels[k] || k, worldGdp > 0 ? pct0((gdp[k] ?? 0) / worldGdp) : NA, cells.get(k)!))],
    links: [], chart: [], asOf, note, servedBy: servedBy(got.map((x) => x[1])) };
}

/** The table panel end to end: every item fetched on its own (in parallel), then rendered by its derive. */
export async function tablePanel(panel: Panel, dash: Dashboard, source: Source, f0: Fetch, ctx: Ctx): Promise<PanelData> {
  const f = f0 as TFetch; const api = await apiRoute(panel, dash, ctx);
  // nothing answered for any item: a CORS-only source off the mesh is the key-row pattern ("open on the mesh"), else an error state
  const none = (all: ItemGot[]) => {
    if (all.some((x) => !isEmpty(x.got))) return;
    if (!browserReadable(source) && !api) throw new FetchError('blocked', `${source.name} sends no CORS header`);
    throw new Error(all[0]?.why || 'no data');
  };
  const each = async (items: string[]) => { const r = await Promise.all(items.map(async (i) => [i, await gather(i, source, f, api, ctx)] as [string, ItemGot])); none(r.map((x) => x[1])); return r; };
  switch (panel.derive) {
    case 'performance': return performance(panel, f, await each(f.each ?? []));
    case 'portfolio_performance': {
      const legs = dash.model_portfolio?.legs ?? []; const proxies = f.proxies ?? {};
      const got = new Map(await Promise.all(legs.map(async ([n]) => [n, proxies[n] ? await gather(proxies[n], source, f, api, ctx) : { got: empty(), by: '', why: 'no proxy declared' }] as [string, ItemGot])));
      none([...got.values()]);
      return portfolio(panel, f, legs, got);
    }
    case 'yields_matrix': return matrix(panel, f, await each(f.each ?? []));
    default: throw new Error(`unknown derive ${panel.derive}`);
  }
}

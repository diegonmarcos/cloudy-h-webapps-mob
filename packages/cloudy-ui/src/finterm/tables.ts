// The per-item tables of the web FinTerm: a port of the APK's Performance.kt + Tables.kt (#1370). `performance` = one row per symbol with
// WTD, MTD, YTD | 1M, 3M, 1Y, 3Y, 10Y (periods over a year annualised, CAGR) and optional whole-year / risk columns; `portfolio_performance`
// = a model portfolio's legs through declared ETF proxies, rebalanced daily; `yields_matrix` = country x tenor, spot or 1y forward, with
// GDP-weighted World / DM / EM averages. Each item routes the container's /v1 first, then the panel's own source and its fallbacks (a source
// a browser cannot read is skipped); a route with `symbol_map` serves only the items it maps. A missing value is a dash with its reason in the note.
import { FetchError, apiRoute, browserReadable, buildUrl, forwardRate, NA, paramsOf, parseFeed, sig, slotsOf, type Ctx, type Dashboard, type Fetch, type Got, type Panel, type PanelData, type Route, type Source } from './engine';
import { parseNum, signedFmt } from './fin';
import { fxPppRow, type FxRow, type S } from './fxppp';

export const PERF_COLUMNS = ['WTD', 'MTD', 'YTD', '1M', '3M', '1Y', '3Y', '10Y'];
export const COL_VOL = 'Vol 1Y';
export const COL_MDD = 'MaxDD 1Y';
export const TABLE_DERIVES = ['performance', 'portfolio_performance', 'yields_matrix', 'em_usd', 'world_bonds', 'risk_compare', 'fx_ppp'];

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

/** blocked: every route that was asked failed at the network (undefined: nothing was asked) (no CORS / offline), as FetchError('blocked') — the panel is then the blocked key row. */
type ItemGot = { got: Got; by: string; why: string; blocked?: boolean };
type TFetch = Fetch & Route & { symbol_map?: Record<string, string>; proxies?: Record<string, string>; tenors?: [string, number][]; groups?: Record<string, string[]>; gdp_usd_bn?: Record<string, number>; forward_start_years?: number; min_coverage_gdp?: number };
const empty = (): Got => ({ points: [], events: [], bars: [], kv: [], rows: [], links: [] });
const isEmpty = (g: Got) => !g.points.length && !g.events.length && !g.bars.length && !g.kv.length && !g.rows.length;
const fillv = (v: string, sl: Record<string, string>) => Object.entries(sl).reduce((x, [k, y]) => x.split(`{${k}}`).join(y), v);
export const symbolFor = (route: { symbol_map?: Record<string, string> }, item: string): string | null => (route.symbol_map ? route.symbol_map[item] || null : item);

async function gather(item: string, source: Source, f: TFetch, api: { source: Source; base: string } | null, ctx: Ctx): Promise<ItemGot> {
  const why: string[] = []; let asked = 0; let netFail = 0;
  const fail = (e: unknown) => { asked++; if (e instanceof FetchError && e.kind === 'blocked') netFail++; };
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
      } catch (e) { fail(e); why.push(`${api.source.name}: no answer`); }
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
    } catch (e) { fail(e); why.push(`${s.name}: no answer`); }
  }
  return { got: empty(), by: '', why: why.join('; ') || `no source for ${item}`, blocked: asked > 0 ? netFail === asked : undefined };
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

/** 60/40 vs 100/0 risk comparison (spec 9; Tables.riskCompare): each compared portfolio's headline row, on the same proxies. */
export function riskCompare(panel: Panel, f: TFetch, sets: [string, number][][], got: Map<string, ItemGot>): PanelData {
  const parts = sets.map((s) => portfolio(panel, f, s, got));
  const miss = parts[0]?.note.split(' — ')[1];
  return { columns: panel.columns ?? [], rows: parts.map((p) => p.rows[0]), links: [], chart: [], asOf: parts[0]?.asOf ?? '',
    note: `Same ETF proxies, each daily rebalanced; risk = Vol 1Y and MaxDD 1Y.${miss ? ` ${miss}` : ''}`, servedBy: parts[0]?.servedBy ?? '', details: parts.map((p) => p.details?.[0] ?? '') };
}

/** The /v1/fx/ppp rows as the table (Tables.fxPppTable): Currency | Spot | PPP | Over/under % | 30d avg | 30d 1y ago real | Real YoY %; reasons in the note. */
export function fxPppTable(panel: Panel, rows: Record<string, unknown>[], by: string): PanelData {
  const n = (o: Record<string, unknown>, k: string, d: number) => (typeof o[k] === 'number' ? (o[k] as number).toFixed(d) : NA);
  const sp = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'number' ? signedFmt(o[k] as number, 1) : NA);
  const dg = (o: Record<string, unknown>) => (typeof o.spot === 'number' && (o.spot as number) >= 100 ? 1 : 4);
  const why = rows.flatMap((o) => Object.entries((o.null_reason as Record<string, string>) ?? {}).map(([k, v]) => `${o.currency} ${k}: ${v}`));
  return { columns: panel.columns ?? [], rows: rows.map((o) => [String(o.currency), n(o, 'spot', dg(o)), n(o, 'ppp', dg(o)), sp(o, 'over_under_pct'), n(o, 'avg_window', dg(o)), n(o, 'avg_window_year_ago_real', dg(o)), sp(o, 'real_change_pct')]),
    links: [], chart: [], asOf: rows.map((o) => (o.spot_date as string) ?? '').filter(Boolean).sort().pop() ?? '',
    note: `Local currency per USD. Over/under % = PPP / spot - 1 (negative: undervalued); real YoY % = the year-ago window in today's prices / today's window - 1 (positive: gained in real terms).${why.length ? ` — ${why.join(' · ')}` : ''}`,
    servedBy: by, details: rows.map((o) => String(o.label ?? '')) };
}

export function curveOf(f: TFetch, g: Got): [number, number][] {
  const out = new Map<number, number>();
  for (const p of g.points) { const x = f.years && p.key in f.years ? f.years[p.key] : p.x; if (x > 0 && Number.isFinite(p.value) && !out.has(x)) out.set(x, p.value); }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

/** The container's one-call matrix (/v1/curves/matrix): values, its GDP (USD bn), each empty cell's reason (country -> tenor -> method), fill rate. */
export type One = { got: [string, ItemGot][]; gdp: Record<string, number>; why: Record<string, Record<string, string>>; fill: number | null };

/** Parse a /v1/curves/matrix body for the declared countries (declared order); null when none of them has a value. */
export function parseOne(body: string, each: string[], by: string): One | null {
  const o = JSON.parse(body) as { fill?: { rate?: number }; rows?: { country: string; gdp_usd?: number | null; tenors?: { tenor: string; value: number | null; date: string | null; method?: string }[] }[] };
  const got = new Map<string, ItemGot>(); const gdp: Record<string, number> = {}; const why: Record<string, Record<string, string>> = {};
  for (const r of o.rows ?? []) {
    if (!each.includes(r.country)) continue;
    if (r.gdp_usd && r.gdp_usd > 0) gdp[r.country] = r.gdp_usd / 1e9;
    const g = empty(); const miss: Record<string, string> = {};
    for (const t of r.tenors ?? []) {
      const y = tenorYears(t.tenor); if (y == null) continue;
      if (typeof t.value === 'number' && Number.isFinite(t.value)) g.points.push({ key: t.tenor, label: t.tenor, x: y, value: t.value, prev: null, date: t.date ?? '' } as Got['points'][number]);
      else miss[t.tenor] = t.method || 'no value';
    }
    why[r.country] = miss;
    got.set(r.country, g.points.length ? { got: g, by, why: '' } : { got: g, by: '', why: [...new Set(Object.values(miss))].join('; ') || 'no curve' });
  }
  if (![...got.values()].some((x) => !isEmpty(x.got))) return null;
  return { got: each.map((c) => [c, got.get(c) ?? { got: empty(), by: '', why: 'not in /v1/curves/matrix' }]), gdp, why, fill: typeof o.fill?.rate === 'number' ? o.fill.rate : null };
}

const tenorYears = (t: string): number | null => { const m = /^(\d+(?:\.\d+)?)\s*([WMY])$/.exec(t.trim().toUpperCase()); if (!m) return null; const n = +m[1]; return m[2] === 'Y' ? n : m[2] === 'M' ? n / 12 : n / 52; };

/** The empty cells' reasons grouped: "no free source declared for this cell: FR 3M/6M, IT 3M". */
export function reasons(why: Record<string, Record<string, string>>, ts: string[]): string[] {
  const by = new Map<string, Map<string, string[]>>();
  for (const [cc, m] of Object.entries(why)) for (const t of ts) if (m[t]) { const r = by.get(m[t]) ?? new Map(); by.set(m[t], r); r.set(cc, [...(r.get(cc) ?? []), t]); }
  return [...by].map(([r, ccs]) => `${r}: ${[...ccs].map(([cc, t]) => `${cc} ${t.join('/')}`).join(', ')}`);
}

export function matrix(panel: Panel & { mode?: string }, f: TFetch, got: [string, ItemGot][], one: One | null = null): PanelData {
  const forward = panel.mode === 'forward'; const start = f.forward_start_years ?? 1; const ts = f.tenors ?? [];
  const labels = f.labels ?? {}; const gdp: Record<string, number> = { ...(f.gdp_usd_bn ?? {}), ...(one?.gdp ?? {}) }; const dm = f.groups?.DM ?? []; const em = f.groups?.EM ?? [];
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
  const gaps = one && !forward ? [] : got.filter(([k]) => curves.get(k)?.length).map(([k]) => [k, ts.filter((_, i) => cells.get(k)![i] == null).map((t) => t[0])] as [string, string[]]).filter((x) => x[1].length).map(([k, m]) => `${k} ${m.join('/')}`);
  const note = [forward ? `${start}y-forward curve from each spot curve (Forward.rate).` : null,
    one?.fill != null ? `One call /v1/curves/matrix: ${pct0(one.fill)} of cells filled; GDP from the container (World Bank, USD).` : null,
    `Averages GDP-weighted (IMF, USD), shown only when the countries with a value hold ${pct0(min)} of the group's GDP; Cov = that share (country rows: share of World GDP).`,
    thin.length ? `— insufficient coverage: ${thin.join(', ')} < ${pct0(min)}.` : null,
    noCurve.length ? `— no curve: ${noCurve.join(', ')}` : null, gaps.length ? `— no point at tenor: ${gaps.join(', ')}` : null,
    ...(one && !forward ? reasons(Object.fromEntries(Object.entries(one.why).filter(([k]) => curves.get(k)?.length)), ts.map((t) => t[0])).map((r) => `— ${r}.`) : [])].filter(Boolean).join(' ');
  const asOf = got.flatMap(([, ig]) => ig.got.points.map((p) => p.date)).reduce((m, d) => (d > m ? d : m), '');
  return { columns: panel.columns ?? [], rows: [...avgs.map(([l, m]) => row(l, pct0(cov(m)), avg(m))), ...got.map(([k]) => row(labels[k] || k, worldGdp > 0 ? pct0((gdp[k] ?? 0) / worldGdp) : NA, cells.get(k)!))],
    links: [], chart: [], asOf, note, servedBy: servedBy(got.map((x) => x[1])) };
}

/** /v1/bonds/em-usd as Country | Ccy | Yield | 1Y | 10Y | 25Y (returns are fractions, shown as %); each empty cell's reason goes to the note. */
export function emUsd(panel: Panel, body: string, by: string): PanelData {
  const o = JSON.parse(body) as { method?: string; rows?: { country: string; currency?: string | null; yield_last?: { month: string; value: number } | null; usd_return_annualised?: Record<string, number | null>; null_reason?: string | null }[] };
  const cols = panel.columns ?? []; const hs = cols.slice(3); const why: string[] = []; let asOf = '';
  const rows = (o.rows ?? []).map((r) => {
    if (r.yield_last?.month && r.yield_last.month > asOf) asOf = r.yield_last.month;
    const cells = hs.map((h) => { const v = r.usd_return_annualised?.[h.toLowerCase()]; return typeof v === 'number' && Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : NA; });
    if (r.null_reason) why.push(`${r.country} (${r.null_reason})`);
    else if (cells.includes(NA)) why.push(`${r.country} (history shorter than ${hs.filter((_, i) => cells[i] === NA).join('/')})`);
    return [r.country, r.currency || NA, typeof r.yield_last?.value === 'number' ? r.yield_last.value.toFixed(2) : NA, ...cells];
  });
  if (!rows.length) throw new Error(`${by}: no EM bond row`);
  return { columns: cols, rows, links: [], chart: [], asOf, note: [o.method || null, why.length ? `— ${why.join(', ')}` : null].filter(Boolean).join(' '), servedBy: by };
}

/** The table panel end to end: every item fetched on its own (in parallel), then rendered by its derive. */
/** World Bonds merged table (#1370, spec 9; Tables.spreads): 2Y, 10Y and the 10Y spread over the 2Y, the Bund and the UST, in bp. */
export const SPREAD_COLS = ['Country', '2Y', '10Y', '2s10s bp', 'vs Bund bp', 'vs UST bp'];
export function spreads(m: PanelData, labels: Record<string, string>): PanelData {
  const i2 = m.columns.indexOf('2Y'), i10 = m.columns.indexOf('10Y');
  const cell = (r: string[], i: number) => (i < 0 ? NA : r[i] ?? NA);
  const num = (r: string[] | undefined, i: number) => (r && cell(r, i) !== NA ? parseNum(cell(r, i)) : null);
  const row = (cc: string) => m.rows.find((r) => r[0] === (labels[cc] || cc));
  const bund = num(row('DE'), i10), ust = num(row('US'), i10);
  const bp = (a: number | null, b: number | null) => (a === null || b === null ? NA : signedFmt((a - b) * 100, 0));
  const rows = m.rows.map((r) => { const y10 = num(r, i10); return [r[0] ?? '', cell(r, i2), cell(r, i10), bp(y10, num(r, i2)), bp(y10, bund), bp(y10, ust)]; });
  return { ...m, columns: SPREAD_COLS, rows, note: `${m.note} Spreads in bp: the 10Y minus the 2Y, minus Germany's 10Y (Bund), minus the US 10Y (UST).`.trim() };
}

export async function tablePanel(panel: Panel, dash: Dashboard, source: Source, f0: Fetch, ctx: Ctx): Promise<PanelData> {
  const f = f0 as TFetch; const api = await apiRoute(panel, dash, ctx);
  // nothing answered for any item: a CORS-only source off the mesh is the key-row pattern ("open on the mesh"), else an error state
  const none = (all: ItemGot[]) => {
    if (all.some((x) => !isEmpty(x.got))) return;
    if (!browserReadable(source) && !api) throw new FetchError('blocked', `${source.name} sends no CORS header`);
    // every item failed at the network (offline, or the browser was refused): the blocked key row, as a single-route panel would be
    const tried = all.filter((x) => x.blocked !== undefined);
    if (tried.length && tried.every((x) => x.blocked)) throw new FetchError('blocked', tried[0].why);
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
    case 'em_usd': {
      if (!api) throw new FetchError('blocked', 'mesh off: the EM USD bond table is served by the FinTerm container only');
      return emUsd(panel, await ctx.get(buildUrl(api.base, (f.primary as { api?: string } | undefined)?.api ?? '/v1/bonds/em-usd', [])), api.source.name);
    }
    case 'yields_matrix': {
      const ma = (f.primary as { matrix_api?: string } | undefined)?.matrix_api;
      if (ma && api) {
        try { const one = parseOne(await ctx.get(buildUrl(api.base, ma, [])), f.each ?? [], api.source.name); if (one) return matrix(panel, f, one.got, one); } catch { /* the per-country path below */ }
      }
      return matrix(panel, f, await each(f.each ?? []));
    }
    case 'fx_ppp': {
      const g = f as unknown as { primary?: { api?: string }; rows: FxRow[]; window_days?: number; fx_source: string; wb: { source: string; indicators: { ppp: string; cpi: string } } };
      if (api) {
        try { const rows = (JSON.parse(await ctx.get(buildUrl(api.base, g.primary?.api ?? '/v1/fx/ppp', []))) as { rows?: Record<string, unknown>[] }).rows ?? []; if (rows.length) return fxPppTable(panel, rows, api.source.name); } catch { /* the direct sources below */ }
      }
      const fxs = ctx.sources.find((x) => x.id === g.fx_source); const wbs = ctx.sources.find((x) => x.id === g.wb.source);
      if (!fxs || !wbs) throw new Error('FX vs PPP: a declared source is missing');
      const today = new Date().toISOString().slice(0, 10); const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
      const ccys = g.rows.filter((r) => !r.no_fx).map((r) => r.ccy).join(',');
      const rates = (JSON.parse(await ctx.get(buildUrl(fxs.endpoint, `/v1/${from}..${today}`, [['base', 'USD'], ['symbols', ccys]]))) as { rates?: Record<string, Record<string, number>> }).rates ?? {};
      const fx = new Map<string, S>();
      for (const d of Object.keys(rates).sort()) for (const [k, v] of Object.entries(rates[d])) fx.set(k, [...(fx.get(k) ?? []), [d, v]]);
      const wb = async (code: string) => {
        const cc = [...g.rows.map((r) => r.cc), 'US'].join(';');
        const a = JSON.parse(await ctx.get(buildUrl(wbs.endpoint, `/country/${cc}/indicator/${code}`, [['format', 'json'], ['per_page', '2000'], ['date', `2015:${today.slice(0, 4)}`]]))) as [unknown, { country: { id: string }; date: string; value: number | null }[] | null];
        const m = new Map<string, S>();
        for (const o of a[1] ?? []) if (o.value !== null) m.set(o.country.id, [...(m.get(o.country.id) ?? []), [o.date, o.value]]);
        for (const [k, v] of m) m.set(k, v.sort((x, y) => (x[0] < y[0] ? -1 : 1)));
        return m;
      };
      const ppp = await wb(g.wb.indicators.ppp); const cpi = await wb(g.wb.indicators.cpi); const us = cpi.get('US') ?? [];
      return fxPppTable(panel, g.rows.map((r) => fxPppRow(r, fx.get(r.ccy) ?? [], ppp.get(r.cc) ?? [], cpi.get(r.cc) ?? [], us, g.window_days ?? 30)), `${fxs.name} + ${wbs.name}`);
    }
    case 'risk_compare': {
      const sets = (f as { compare?: [string, number][][] }).compare ?? []; const proxies = f.proxies ?? {};
      const names = [...new Set(sets.flat().map((l) => l[0]))];
      const got = new Map(await Promise.all(names.map(async (n) => [n, proxies[n] ? await gather(proxies[n], source, f, api, ctx) : { got: empty(), by: '', why: 'no proxy declared' }] as [string, ItemGot])));
      none([...got.values()]);
      return riskCompare(panel, f, sets, got);
    }
    case 'world_bonds': return spreads(await tablePanel({ ...panel, derive: 'yields_matrix' }, dash, source, f0, ctx), f.labels ?? {});
    default: throw new Error(`unknown derive ${panel.derive}`);
  }
}

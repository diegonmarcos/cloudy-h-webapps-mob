// The web FinTerm engine (#1342): a port of the APK's Engine.kt / Providers.kt / FredCsv.kt / Forward.kt / Priority. Pure apart from the
// `get` it is given. It builds every request from the GENERATED declarations (nav/finterm.json: endpoint + path + params); no address is typed
// here. Source order of a panel: the own-fleet primary (fin-api on the private mesh) when it is declared, feeds the entry and answers, series by
// series; then the panel's own key-free public source; then its declared second-priority source (DBnomics: the Fed H.15 / H.10 mirror); a keyed
// source or one a browser cannot reach is a dashed placeholder with its reason. A source declared `cors: false` (FRED and IMF send no
// Access-Control-Allow-Origin) is never asked from the browser: the engine goes straight to the next source, so the page never waits on it.

import { TABLE_DERIVES, tablePanel } from './tables';

export type Obs = { date: string; value: number };
export type ChartPoint = { label: string; x: number; y: number };
export type PanelData = { columns: string[]; rows: string[][]; links: string[]; chart: ChartPoint[]; asOf: string; note: string; servedBy: string; alerts?: string[]; /** per row, the recent values (oldest first) for a sparkline, when the source gives history */ spark?: (number[] | null)[]; /** per row, the full name the one-line name cell shortens (detail / title) */ details?: string[] };

export type Feed = { tab: string; entries: string[] };
export type Source = {
  id: string; name: string; category?: string; primary?: boolean; priority: number; coverage?: string; endpoint: string; fleet_endpoint?: string; docs?: string;
  cors?: boolean; paths?: Record<string, string>; connector?: string | null; feeds: Feed[]; attribution?: string; user_endpoint?: boolean; auth: { type: string; signup?: string };
  schedule?: { ttl_s: number };
};
/** A model panel's route (fetch.fallbacks[] and the panel's own fetch): source, provider, path, params, per-item list. */
export type Route = { source?: string; provider?: string; path?: string; params?: Record<string, unknown>; each?: string[]; each_days?: number; each_user?: string; importance?: Record<string, number> };
export type Fetch = {
  provider: string; lookback_days?: number; path?: string; params?: Record<string, unknown>; countries?: string[]; country_names?: Record<string, string>; labels?: Record<string, string>;
  series?: { id: string; label: string; years?: number; ccy?: string; quote?: string; pair?: string; dbnomics?: string }[];
  forward?: { grid: number[][]; curve_length?: number; curve_max_start?: number };
  primary?: { source: string; topic?: string; api?: string; params?: Record<string, unknown>; parse?: string };
  // model panels (Feeds): routes, items, labels, curve tenors, SDMX / JSON-stat key dimension, event filter
  fallbacks?: Route[]; merge?: boolean; each?: string[]; each_days?: number; each_user?: string; years?: Record<string, number>; key_dim?: string;
  filter?: { days_back?: number; days_ahead?: number; importance_min?: number }; last?: number; scale?: number; forms?: string[]; cik?: string; concept?: string;
  /** The second-priority public source; a series carries its code there as `dbnomics` ("<provider>/<dataset>/<series>"). */
  fallback?: { source: string };
};
export type Panel = {
  id: string; title: string; source: string; view: string; derive?: string; fetch?: Fetch; columns?: string[]; unit?: string; chart_value?: string; change_unit?: string; better_when?: string; next_tiles?: boolean;
  value_columns?: string; alerts?: string;
  /** A source with no key / connector yet: drawn as one key row (UI spec 2; the dashed columns/rows layout is gone, checklist 1). */
  placeholder?: { reason?: string; note?: string };
  /** UI spec 6.3: drawn as a source chip of another panel's card (Yield Curves: FRED inside the Treasury card), never alone. */
  segment_of?: string; segment_label?: string;
  display?: string; tape?: boolean; heat_scale?: number; limit?: number;
};

/**
 * The panels in drawing order (UI spec 3, checklist 17; same rule as the APK's Dashboards.drawOrder): live and allocation panels in
 * their declared order, the key rows (no source yet) at the bottom; a panel declared `segment_of` another is not drawn alone.
 */
export function drawOrder(panels: Panel[]): Panel[] {
  const shown = panels.filter((p) => !p.segment_of);
  const live = (p: Panel) => !!p.fetch || (!p.placeholder && p.view === 'alloc');
  return [...shown.filter(live), ...shown.filter((p) => !live(p))];
}
export type Dashboard = { id: string; slug: string; entry: string; tab: string; subtitle: string; panels: Panel[]; model_portfolio?: { legs: [string, number][] } };
export type Catalog = { mesh: Record<string, string>; sources: Source[]; dashboards: Dashboard[]; declared?: Record<string, unknown> };

/** A request failure: `blocked` = the browser could not read the answer (CORS, off the mesh, offline), `http` = the server answered an error. */
export class FetchError extends Error {
  constructor(public kind: 'blocked' | 'http', message: string, public status = 0) { super(message); }
}
export type Get = (url: string) => Promise<string>;

// ------------------------------------------------------------------ requests

const enc = (s: string) => encodeURIComponent(s);
/** endpoint + path + the parameters, percent-encoded, in the order given; `path` may carry {name} slots. An object value is sent as its JSON text. */
export function buildUrl(endpoint: string, path: string, params: [string, string][], slots: Record<string, string> = {}): string {
  let p = path;
  for (const [k, v] of Object.entries(slots)) p = p.split(`{${k}}`).join(v);
  const q = params.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  return endpoint.replace(/\/+$/, '') + p + (q ? (p.includes('?') ? '&' : '?') + q : '');
}
/** The declared params in order; an array repeats its key (geo=EA&geo=DE), an object is sent as its JSON text. */
export const paramsOf = (f: { params?: Record<string, unknown> }): [string, string][] =>
  Object.entries(f.params ?? {}).flatMap(([k, v]): [string, string][] => (Array.isArray(v) ? v.map((x) => [k, String(x)] as [string, string]) : [[k, typeof v === 'string' ? v : JSON.stringify(v)]]));
export function minusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
/** One FRED series from `lookback` days before `today`: the public graph endpoint honours the window for a single series only. */
export const fredUrl = (endpoint: string, id: string, today: string, lookback: number) => buildUrl(endpoint, '', [['id', id], ['cosd', minusDays(today, lookback)]]);

// ------------------------------------------------------------------ parsers

/** The CSV the public FRED graph endpoint serves: header (date column, then one column per series), one row per date; "." or empty = missing. Anything else parses to nothing. */
export function parseFredCsv(csv: string): Record<string, Obs[]> {
  const lines = csv.replace(/^﻿/, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return {};
  const head = lines[0].split(',').map((c) => c.trim());
  if (head.length < 2 || !['observation_date', 'date'].includes(head[0].toLowerCase())) return {};
  const ids = head.slice(1);
  const out: Record<string, Obs[]> = Object.fromEntries(ids.map((i) => [i, [] as Obs[]]));
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells.length < 2) continue;
    const date = cells[0].trim();
    ids.forEach((id, i) => {
      const v = (cells[i + 1] ?? '').trim();
      if (v === '' || v === '.') return;
      const n = Number(v);
      if (Number.isFinite(n)) out[id].push({ date, value: n });
    });
  }
  return out;
}
/** A DataHub topic of the Fincept backend's FRED connector: {series_id, observations:[{date, value}]}; a null value is dropped. */
export function parseFinceptSeries(json: string): Obs[] {
  const o = safe(json);
  const arr = Array.isArray(o?.observations) ? (o.observations as { date?: unknown; value?: unknown }[]) : [];
  return arr.filter((x) => typeof x?.value === 'number' && Number.isFinite(x.value)).map((x) => ({ date: String(x.date ?? ''), value: x.value as number }));
}
const safe = (json: string): any => { try { return JSON.parse(json); } catch { return null; } };

export type Series = { code: string; name: string; periods: string[]; values: (number | null)[] };
export function parseDbnomics(json: string): Series[] {
  const docs = safe(json)?.series?.docs;
  if (!Array.isArray(docs)) return [];
  return docs.map((d: any) => ({ code: String(d.series_code ?? ''), name: String(d.series_name ?? ''), periods: (d.period ?? []).map(String),
    values: (d.value ?? []).map((v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) }));
}
const latestOf = (s: Series): [string, number] | null => {
  for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return [s.periods[i] ?? '', s.values[i] as number];
  return null;
};
/** The observations of a series' DBnomics answer (the first doc): periods with a numeric value; "NA" and other non-numbers are dropped. */
export function dbnomicsObs(json: string): Obs[] {
  const s = parseDbnomics(json)[0];
  if (!s) return [];
  return s.periods.flatMap((p, i) => (s.values[i] === null || s.values[i] === undefined ? [] : [{ date: p, value: s.values[i] as number }]));
}
export type CountryValue = { code: string; name: string; year: string; value: number };
export function parseWorldBank(json: string): CountryValue[] {
  const rows = safe(json)?.[1];
  if (!Array.isArray(rows)) return [];
  return rows.filter((r: any) => typeof r?.value === 'number' && Number.isFinite(r.value))
    .map((r: any) => ({ code: String(r.countryiso3code ?? ''), name: String(r.country?.value ?? ''), year: String(r.date ?? ''), value: r.value as number }));
}
export function parseImf(json: string, indicator: string, countries: string[], names: Record<string, string>): CountryValue[] {
  const by = safe(json)?.values?.[indicator];
  if (!by) return [];
  const out: CountryValue[] = [];
  for (const c of countries) {
    const years = by[c];
    if (!years) continue;
    const ys = Object.keys(years).filter((y) => typeof years[y] === 'number').sort();
    const best = ys[ys.length - 1];
    if (best) out.push({ code: c, name: names[c] ?? c, year: best, value: years[best] });
  }
  return out;
}
export type Article = { title: string; url: string; domain: string; seen: string };
/** 20261030T120000Z -> "2026-10-30 12:00"; anything else is kept as it came. */
export function seen(raw: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}Z$/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : raw;
}
export function parseGdelt(json: string): Article[] {
  const arr = safe(json)?.articles;
  if (!Array.isArray(arr)) return [];
  return arr.map((a: any) => ({ title: String(a.title ?? ''), url: String(a.url ?? ''), domain: String(a.domain ?? ''), seen: seen(String(a.seendate ?? '')) })).filter((a) => a.title.trim() !== '');
}

// ------------------------------------------------------------------ forward rates

/** A tenor label in years: "3M" 0.25, "10Y" 10, "2W" 2/52; null for anything else (Feeds.tenorYears). */
export function tenorYears(t: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*([WMY])$/.exec(t.trim().toUpperCase()); if (!m) return null;
  const n = Number(m[1]); return m[2] === 'Y' ? n : m[2] === 'M' ? n / 12 : n / 52;
}

/** Yield (percent) at maturity t years: linear between the points, flat outside. NaN for an empty curve. */
export function yieldAt(curve: [number, number][], t: number): number {
  if (!curve.length) return NaN;
  if (t <= curve[0][0]) return curve[0][1];
  if (t >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
  for (let i = 1; i < curve.length; i++) {
    const [t1, y1] = curve[i - 1];
    const [t2, y2] = curve[i];
    if (t <= t2) return t2 === t1 ? y2 : y1 + ((y2 - y1) * (t - t1)) / (t2 - t1);
  }
  return curve[curve.length - 1][1];
}
/** Forward rate (percent) from `start` for `length` years, par yields treated as annually compounded spot rates: ((1+y(s+l))^(s+l) / (1+y(s))^s)^(1/l) - 1. */
export function forwardRate(curve: [number, number][], start: number, length: number): number {
  if (!curve.length || length <= 0 || start < 0) return NaN;
  const end = start + length;
  const grownEnd = Math.pow(1 + yieldAt(curve, end) / 100, end);
  const grownStart = start === 0 ? 1 : Math.pow(1 + yieldAt(curve, start) / 100, start);
  return (Math.pow(grownEnd / grownStart, 1 / length) - 1) * 100;
}
export const forwardCurve = (curve: [number, number][], length: number, maxStart: number): [number, number][] =>
  Array.from({ length: maxStart + 1 }, (_, s) => [s, forwardRate(curve, s, length)] as [number, number]).filter((p) => Number.isFinite(p[1]));

// ------------------------------------------------------------------ format

/** Missing value (never a bare "-", which reads as a sign): the em dash. */
export const NA = '\u2014';
export const num = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : NA);
export const group = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const sig = (v: number) => (!Number.isFinite(v) ? NA : Math.abs(v) >= 100 ? v.toFixed(2) : Math.abs(v) >= 1 ? v.toFixed(4) : v.toFixed(5));
const signed = (v: number, d: number) => { const t = v.toFixed(d); return Number(t) === 0 ? Math.abs(0).toFixed(d) : (v > 0 ? '+' : '') + t; };
const change = (last: Obs, prev: Obs | undefined, scale: number, d: number) => (prev ? signed((last.value - prev.value) * scale, d) : NA);
const pct = (last: Obs, prev?: Obs) => (!prev || prev.value === 0 ? null : (last.value / prev.value - 1) * 100);
const pctChange = (last: Obs, prev?: Obs) => { const p = pct(last, prev); return p === null ? NA : signed(p, 2); };
const years = (v: number) => (v === Math.floor(v) ? String(v) : num(v, 1));

// ------------------------------------------------------------------ engine

export type PrimaryRoute = { source: Source; base: string; topic: string; peek: string };
export type Ctx = {
  get: Get; today: string; sources: Source[]; mesh: Record<string, string>; reachable: (healthUrl: string) => Promise<boolean>;
  /** The user's watchlist and alert rules (kept in this browser), and now as UTC "YYYY-MM-DDTHH:MMZ". */
  user?: UserLists; nowUtc?: string;
};

/** A browser can read a source unless it declares `cors: false` (no Access-Control-Allow-Origin header). */
export const browserReadable = (s: Source | undefined): boolean => !!s && s.cors !== false;
const blocked = (s: Source) => new FetchError('blocked', `${s.name} sends no CORS header`);

const feedsEntry = (s: Source, tab: string, entry: string) => s.feeds.some((f) => f.tab === tab && (f.entries.includes('*') || f.entries.includes(entry)));

/** The panel's preferred route: the declared primary source (priority below the panel's own, feeds the entry, has a mesh base) when it answers its health path; else null. */
export async function primaryRoute(panel: Panel, dash: Dashboard, ctx: Pick<Ctx, 'sources' | 'mesh' | 'reachable'>): Promise<PrimaryRoute | null> {
  const p = panel.fetch?.primary;
  if (!p) return null;
  const src = ctx.sources.find((s) => s.id === p.source);
  const own = ctx.sources.find((s) => s.id === panel.source);
  if (!src || !own || !feedsEntry(src, dash.tab, dash.entry) || src.priority >= own.priority) return null;
  const base = ctx.mesh[src.fleet_endpoint ?? ''] ?? '';
  const peek = src.paths?.peek ?? '';
  const health = src.paths?.health ?? '';
  if (!base || !peek || !(await ctx.reachable(base.replace(/\/+$/, '') + health))) return null;
  return { source: src, base, topic: p.topic, peek };
}

type FredSeries = { spec: NonNullable<Fetch['series']>[number]; obs: Obs[]; viaPrimary: boolean; viaFallback: boolean; last: Obs; prev?: Obs };

export async function loadPanel(panel: Panel, dash: Dashboard, ctx: Ctx): Promise<PanelData> {
  const f = panel.fetch;
  const source = ctx.sources.find((s) => s.id === panel.source);
  if (!f || !source) throw new Error(`panel ${panel.id} has no fetch`);
  if (TABLE_DERIVES.includes(panel.derive ?? '')) return tablePanel(panel, dash, source, f, ctx);
  if (MODEL_DERIVES.includes(panel.derive ?? '')) return modelPanel(panel, dash, source, f, ctx);
  const fred = ['latest_curve', 'forward_grid', 'level_change', 'fx_spot', 'fx_cross'].includes(panel.derive ?? '');
  if (!fred && !browserReadable(source)) throw blocked(source); // no request: the source is known to be CORS-blocked
  let data: PanelData;
  switch (panel.derive) {
    case 'latest_curve': case 'forward_grid': case 'level_change': case 'fx_spot': case 'fx_cross': data = await fredPanel(panel, dash, source, f, ctx); break;
    case 'latest_per_series': data = await perSeries(panel, source, f, ctx); break;
    case 'imf_latest': data = await imf(panel, source, f, ctx); break;
    case 'worldbank_latest': data = await worldBank(panel, source, f, ctx); break;
    case 'articles': data = await articles(panel, source, f, ctx); break;
    default: throw new Error(`unknown derive ${panel.derive}`);
  }
  if (!data.rows.length && !data.chart.length) throw new Error('no data');
  return data;
}

/** The static allocation of a model portfolio: its legs as rows and bars. */
export const alloc = (panel: Panel, legs: [string, number][]): PanelData => ({
  columns: panel.columns ?? ['Asset class', 'Weight'], rows: legs.map(([l, w]) => [l, `${w}%`]), links: [], chart: legs.map(([l, w], i) => ({ label: l, x: i, y: w })), asOf: '', note: '', servedBy: '',
});

async function fredPanel(panel: Panel, dash: Dashboard, source: Source, f: Fetch, ctx: Ctx): Promise<PanelData> {
  const fb = f.fallback ? ctx.sources.find((s) => s.id === f.fallback!.source) : undefined;
  const second = fb && fb.id !== source.id && feedsEntry(fb, dash.tab, dash.entry) && browserReadable(fb) ? fb : undefined;
  const own = browserReadable(source);
  const route = await primaryRoute(panel, dash, ctx);
  if (!route && !own && !second) throw blocked(source); // every route is known to be unreadable: no request at all
  const lookback = f.lookback_days ?? 30;
  const from = minusDays(ctx.today, lookback);
  const specs = f.series ?? [];
  const errs: unknown[] = [];
  const got = await Promise.all(specs.map(async (spec): Promise<FredSeries | null> => {
    let obs: Obs[] = [];
    let via = false;
    let viaFallback = false;
    if (route) {
      try {
        const url = buildUrl(route.base, route.peek, [], { topic: route.topic.split('{id}').join(spec.id) });
        obs = parseFinceptSeries(await ctx.get(url)).filter((o) => o.date >= from);
        via = obs.length > 0;
      } catch { obs = []; } // a topic the container has not published (404) or a mesh that stopped answering: this series comes from the public source
    }
    if (!obs.length && own) {
      try { obs = parseFredCsv(await ctx.get(fredUrl(source.endpoint, spec.id, ctx.today, lookback)))[spec.id] ?? []; } catch (e) { errs.push(e); obs = []; }
    }
    if (!obs.length && second && spec.dbnomics) {
      try {
        obs = dbnomicsObs(await ctx.get(buildUrl(second.endpoint, `/series/${spec.dbnomics}`, [['observations', '1'], ['metadata', '0']]))).filter((o) => o.date >= from);
        viaFallback = obs.length > 0;
      } catch (e) { errs.push(e); obs = []; }
    }
    return obs.length ? { spec, obs, viaPrimary: via, viaFallback, last: obs[obs.length - 1], prev: obs[obs.length - 2] } : null;
  }));
  const series = got.filter((s): s is FredSeries => !!s);
  if (!series.length) throw errs[0] ?? new Error('no data');
  const names = [
    route && series.some((s) => s.viaPrimary) ? route.source.name : '',
    series.some((s) => !s.viaPrimary && !s.viaFallback) ? source.name : '',
    second && series.some((s) => s.viaFallback) ? second.name : '',
  ].filter(Boolean);
  const servedBy = names.length === 1 && names[0] === source.name ? '' : names.join(' + ');
  const asOf = series.reduce((m, s) => (s.last.date > m ? s.last.date : m), '');
  const missing = specs.length - series.length;
  return { ...derived(panel, f, series, asOf, missing ? `${missing} series unavailable` : ''), servedBy };
}

function derived(panel: Panel, f: Fetch, series: FredSeries[], asOf: string, note: string): PanelData {
  const columns = panel.columns ?? [];
  const mk = (rows: string[][], chart: ChartPoint[], cols = columns): PanelData => ({ columns: cols, rows, links: [], chart, asOf, note, servedBy: '' });
  switch (panel.derive) {
    case 'latest_curve': {
      const pts = series.map((s) => ({ label: s.spec.label, x: s.spec.years ?? 0, y: s.last.value })).sort((a, b) => a.x - b.x);
      return mk(series.map((s) => [s.spec.label, num(s.last.value, 2), change(s.last, s.prev, 100, 1), s.last.date]), pts);
    }
    case 'forward_grid': {
      const fw = f.forward!;
      const curve = series.map((s) => [s.spec.years ?? 0, s.last.value] as [number, number]).sort((a, b) => a[0] - b[0]);
      const rows = fw.grid.map(([s, l]) => [`${years(s)}Y x ${years(l)}Y`, num(forwardRate(curve, s, l), 2)]);
      const pts = forwardCurve(curve, fw.curve_length ?? 1, fw.curve_max_start ?? 29).map(([s, r]) => ({ label: `${years(s)}Y`, x: s, y: r }));
      return mk(rows, pts);
    }
    case 'level_change': {
      const bp = panel.change_unit === 'bp';
      const byLevel = panel.chart_value === 'level';
      const rows = series.map((s) => [s.spec.label, group(s.last.value), bp ? change(s.last, s.prev, 100, 0) : pctChange(s.last, s.prev), s.last.date]);
      const chart = series.map((s, i) => ({ label: s.spec.label, x: i, y: byLevel ? s.last.value : pct(s.last, s.prev) ?? 0 }));
      return mk(rows, chart);
    }
    case 'fx_spot': return mk(series.map((s) => [s.spec.pair ?? '', sig(s.last.value), pctChange(s.last, s.prev), s.last.date]), []);
    default: {
      const usd: Record<string, number> = { USD: 1 };
      for (const s of series) if (s.last.value > 0) usd[s.spec.ccy ?? ''] = s.spec.quote === 'usd_per' ? s.last.value : 1 / s.last.value;
      const names = Object.keys(usd);
      return mk(names.map((i) => [i, ...names.map((j) => (i === j ? NA : sig(usd[i] / usd[j])))]), [], [...columns, ...names]);
    }
  }
}

async function perSeries(panel: Panel, source: Source, f: Fetch, ctx: Ctx): Promise<PanelData> {
  const body = await ctx.get(buildUrl(source.endpoint, f.path ?? '', paramsOf(f)));
  const found = parseDbnomics(body).map((s) => { const l = latestOf(s); return l ? { label: f.labels?.[s.code] || s.name, value: l[1], period: l[0] } : null; })
    .filter((x): x is { label: string; value: number; period: string } => !!x).sort((a, b) => b.value - a.value);
  return { columns: panel.columns ?? [], rows: found.map((x) => [x.label, num(x.value, 2), x.period]), links: [],
    chart: panel.view === 'bars' ? found.map((x, i) => ({ label: x.label, x: i, y: x.value })) : [], asOf: found.reduce((m, x) => (x.period > m ? x.period : m), ''), note: '', servedBy: '' };
}
const countryPanel = (panel: Panel, got: CountryValue[]): PanelData => ({ columns: panel.columns ?? [], rows: got.map((c) => [c.name, num(c.value, 1), c.year]), links: [], chart: [],
  asOf: got.reduce((m, c) => (c.year > m ? c.year : m), ''), note: '', servedBy: '' });
async function imf(panel: Panel, source: Source, f: Fetch, ctx: Ctx): Promise<PanelData> {
  const body = await ctx.get(buildUrl(source.endpoint, f.path ?? '', paramsOf(f)));
  return countryPanel(panel, parseImf(body, (f.path ?? '').replace(/^\/+|\/+$/g, ''), f.countries ?? [], f.country_names ?? {}).sort((a, b) => b.value - a.value));
}
async function worldBank(panel: Panel, source: Source, f: Fetch, ctx: Ctx): Promise<PanelData> {
  const body = await ctx.get(buildUrl(source.endpoint, f.path ?? '', paramsOf(f), { countries: (f.countries ?? []).join(';') }));
  return countryPanel(panel, parseWorldBank(body).sort((a, b) => b.value - a.value));
}
async function articles(panel: Panel, source: Source, f: Fetch, ctx: Ctx): Promise<PanelData> {
  const got = parseGdelt(await ctx.get(buildUrl(source.endpoint, f.path ?? '', paramsOf(f))));
  return { columns: panel.columns ?? [], rows: got.map((a) => [a.title, a.domain, a.seen]), links: got.map((a) => a.url), chart: [], asOf: got.reduce((m, a) => (a.seen > m ? a.seen : m), ''), note: '', servedBy: '' };
}

// ------------------------------------------------------------------ placeholders

export type Placeholder = { reason: 'keyed' | 'user-mapped' | 'no-connector' | 'blocked' | 'error'; note: string };
/** Why a panel is a dashed placeholder: a keyed source (keys are never stored on the web), a source the user maps, or one with no connector yet. */
export function placeholderFor(panel: Panel, sources: Source[]): Placeholder {
  const s = sources.find((x) => x.id === panel.source);
  if (!s) return { reason: 'no-connector', note: 'No source declared.' };
  if (s.user_endpoint) return { reason: 'user-mapped', note: `${s.name}: you map its endpoint and key in the Android app (Config > Sources); the web stores no keys.` };
  if (s.auth.type !== 'none') return { reason: 'keyed', note: `${s.name}: needs ${s.auth.type === 'paid' ? 'a paid subscription' : 'an API key'}; the web stores no keys (add it in the Android app, Config > Sources).` };
  return { reason: 'no-connector', note: `${s.name}: no web connector yet.` };
}
/** A fetch that failed: the browser could not read the source (CORS / off the mesh) or it answered an error. */
export function failureFor(panel: Panel, sources: Source[], e: unknown): Placeholder {
  const s = sources.find((x) => x.id === panel.source);
  if (e instanceof Error && e.message.startsWith('mesh off')) return { reason: 'blocked', note: 'Mesh off: served by the FinTerm container on the private mesh only.' }; // a container-only panel never names its public source
  if (e instanceof FetchError && e.kind === 'blocked') return { reason: 'blocked', note: `Mesh only / CORS: ${s?.name ?? 'the source'} does not allow browser requests; open this page on the mesh to read it through fin-api.` };
  return { reason: 'error', note: `${s?.name ?? 'The source'} is unavailable right now (${e instanceof Error ? e.message : 'error'}).` };
}

// ------------------------------------------------------------------ model panels (a port of Feeds.kt + Engine.model / Alerts.kt, #1351)
// The normalised model every connector parses into: points (series, quotes, curve tenors), events (calendars), bars, key/value rows,
// rows with links. Only the browser-readable connectors are parsed here (a `cors: false` source is never asked from the browser; the
// container's /v1 answer covers it on the mesh): nyfed_rates, treasury_xml, sdmx_json, jsonstat, bls_series, frankfurter_rates,
// coinbase_exchange, polymarket_events, sec_submissions, declared_events, finterm_v1.

export type Pt = { key: string; label: string; x: number; value: number; prev: number | null; date: string; hist?: number[] };
export type Ev = { ts: string; country: string; title: string; importance: number; consensus: string; actual: string; previous: string; kind: string };
export type Bar = { date: string; o: number; h: number; l: number; c: number };
export type Got = { points: Pt[]; events: Ev[]; bars: Bar[]; kv: [string, string][]; rows: string[][]; links: string[] };
export const MODEL_DERIVES = ['points', 'events', 'candles', 'kv', 'filings'];
const got = (g: Partial<Got> = {}): Got => ({ points: [], events: [], bars: [], kv: [], rows: [], links: [], ...g });
const isEmpty = (g: Got) => !g.points.length && !g.events.length && !g.bars.length && !g.kv.length && !g.rows.length;
const plus = (a: Got, b: Got): Got => ({ points: [...a.points, ...b.points], events: [...a.events, ...b.events], bars: [...a.bars, ...b.bars], kv: [...a.kv, ...b.kv], rows: [...a.rows, ...b.rows], links: [...a.links, ...b.links] });
const fin = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const objs = (a: unknown): any[] => (Array.isArray(a) ? a.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);
const ev = (e: Partial<Ev> & Pick<Ev, 'ts' | 'country' | 'title' | 'importance'>): Ev => ({ consensus: '', actual: '', previous: '', kind: 'economic', ...e });

export type ParseOpt = { spec: Record<string, any>; each?: string; paths?: Record<string, string> };
/** One connector's answer -> the model; anything unrecognised is an empty model, never an error. */
export function parseFeed(connector: string, body: string, o: ParseOpt): Got {
  try {
    switch (connector) {
      case 'nyfed_rates': return feedNyfed(body);
      case 'treasury_xml': return feedTreasury(body);
      case 'sdmx_json': return feedSdmx(body, s(o.spec.key_dim));
      case 'jsonstat': return feedJsonstat(body, s(o.spec.key_dim));
      case 'bls_series': return feedBls(body);
      case 'frankfurter_rates': return feedFrankfurter(body);
      case 'coinbase_exchange': return feedCoinbase(body, o.each ?? '');
      case 'polymarket_events': return feedPolymarket(body, o.spec.last ?? 12);
      case 'sec_submissions': return feedSec(body, o);
      case 'declared_events': return feedDeclared(body);
      case 'finterm_v1': return feedV1(body, s(o.spec.concept));
      default: return got();
    }
  } catch { return got(); }
}
export function feedNyfed(body: string): Got {
  const out: Pt[] = [];
  for (const r of objs(JSON.parse(body).refRates)) {
    const type = s(r.type), date = s(r.effectiveDate);
    if (type === 'SOFRAI') {
      for (const [k, f] of [['SOFRAI_30D', 'average30day'], ['SOFRAI_90D', 'average90day'], ['SOFRAI_180D', 'average180day'], ['SOFRAI_INDEX', 'index']]) {
        const v = fin(r[f]); if (v !== null) out.push({ key: k, label: k, x: out.length, value: v, prev: null, date });
      }
    } else { const v = fin(r.percentRate); if (v !== null) out.push({ key: type, label: type, x: out.length, value: v, prev: null, date }); }
  }
  return got({ points: out });
}
export function feedTreasury(body: string): Got {
  const days: [string, Map<string, number>][] = [];
  for (const m of body.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)) {
    const date = /<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/.exec(m[1])?.[1];
    if (!date) continue;
    const vals = new Map<string, number>();
    for (const v of m[1].matchAll(/<d:(BC_[0-9A-Z_]+) [^>]*>(-?[0-9.]+)<\/d:/g)) { const n = Number(v[2]); if (Number.isFinite(n)) vals.set(v[1], n); }
    if (vals.size) days.push([date, vals]);
  }
  days.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const last = days[days.length - 1];
  if (!last) return got();
  const prev = days[days.length - 2]?.[1];
  return got({ points: [...last[1].entries()].map(([k, v], i) => ({ key: k, label: k, x: i, value: v, prev: prev?.get(k) ?? null, date: last[0], hist: days.map((d) => d[1].get(k)).filter((x): x is number => x !== undefined) })) });
}
export function feedSdmx(body: string, keyDim: string): Got {
  const top = JSON.parse(body);
  const root = top.data ?? top;
  const dims = root.structure.dimensions;
  const k = (dims.series as any[]).findIndex((d) => d.id === keyDim);
  if (k < 0) return got();
  const keyValues = dims.series[k].values as any[];
  const times = dims.observation[0].values as any[];
  const series = root.dataSets[0].series as Record<string, { observations: Record<string, unknown[]> }>;
  const out: Pt[] = [];
  for (const sk of Object.keys(series).sort()) {
    const idx = Number(sk.split(':')[k]);
    if (!Number.isInteger(idx)) continue;
    const id = s(keyValues[idx]?.id);
    const pairs = Object.entries(series[sk].observations).flatMap(([oi, arr]): [string, number][] => {
      const t = times[Number(oi)]?.id; const v = fin(arr?.[0]);
      return t !== undefined && v !== null && typeof arr?.[0] === 'number' ? [[String(t), v]] : [];
    }).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const last = pairs[pairs.length - 1];
    if (last) out.push({ key: id, label: id, x: out.length, value: last[1], prev: pairs[pairs.length - 2]?.[1] ?? null, date: last[0] });
  }
  return got({ points: out });
}
export function feedJsonstat(body: string, keyDim: string): Got {
  const o = JSON.parse(body);
  const ids: string[] = o.id, size: number[] = o.size;
  const posToId = (d: string): Map<number, string> => {
    const idx = o.dimension[d].category.index; const m = new Map<number, string>();
    if (Array.isArray(idx)) idx.forEach((x: string, i: number) => m.set(i, x)); else for (const [x, i] of Object.entries(idx)) m.set(Number(i), x);
    return m;
  };
  const ki = ids.indexOf(keyDim), ti = ids.indexOf('time');
  if (ki < 0 || ti < 0) return got();
  const keyIds = posToId(keyDim), timeIds = posToId('time');
  const flat = new Map<number, number>();
  if (Array.isArray(o.value)) o.value.forEach((v: unknown, i: number) => { const n = fin(v); if (n !== null && typeof v === 'number') flat.set(i, n); });
  else for (const [k, v] of Object.entries(o.value ?? {})) { if (typeof v === 'number' && Number.isFinite(v)) flat.set(Number(k), v); }
  const byKey = new Map<string, [string, number][]>();
  [...keyIds.keys()].sort((a, b) => a - b).forEach((p) => byKey.set(keyIds.get(p)!, []));
  for (const [fi, v] of flat) {
    let rest = fi; const coord = new Array(size.length).fill(0);
    for (let d = size.length - 1; d >= 0; d--) { coord[d] = rest % size[d]; rest = Math.floor(rest / size[d]); }
    const key = keyIds.get(coord[ki]), t = timeIds.get(coord[ti]);
    if (key === undefined || t === undefined) continue;
    byKey.get(key)!.push([t, v]);
  }
  const out: Pt[] = [];
  for (const [key, list] of byKey) {
    const srt = [...list].sort((a, b) => (a[0] < b[0] ? -1 : 1)); const last = srt[srt.length - 1];
    if (last) out.push({ key, label: key, x: out.length, value: last[1], prev: srt[srt.length - 2]?.[1] ?? null, date: last[0] });
  }
  return got({ points: out });
}
export function feedBls(body: string): Got {
  const out: Pt[] = [];
  for (const sr of objs(JSON.parse(body).Results.series)) {
    const data = objs(sr.data).flatMap((d): [string, number][] => {
      const v = fin(d.value); const p = s(d.period);
      return v === null ? [] : [[s(d.year) + (p.startsWith('M') && p !== 'M13' ? '-' + p.slice(1) : ''), v]];
    }).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    if (data[0]) out.push({ key: s(sr.seriesID), label: s(sr.seriesID), x: out.length, value: data[0][1], prev: data[1]?.[1] ?? null, date: data[0][0] });
  }
  return got({ points: out });
}
export function feedFrankfurter(body: string): Got {
  const o = JSON.parse(body); const rates = o.rates ?? {}; const keys = Object.keys(rates);
  if (!keys.length) return got();
  if (rates[keys[0]] && typeof rates[keys[0]] === 'object') {
    const dates = keys.sort(); const last = rates[dates[dates.length - 1]]; const prev = dates.length > 1 ? rates[dates[dates.length - 2]] : undefined;
    return got({ points: Object.keys(last).sort().map((c, i) => ({ key: c, label: c, x: i, value: Number(last[c]), prev: prev && Number.isFinite(prev[c]) ? prev[c] : null, date: dates[dates.length - 1], hist: dates.map((d) => Number(rates[d]?.[c])).filter(Number.isFinite) })) });
  }
  return got({ points: keys.sort().map((c, i) => ({ key: c, label: c, x: i, value: Number(rates[c]), prev: null, date: s(o.date) })) });
}
export function feedCoinbase(body: string, each: string): Got {
  const t = body.trimStart();
  if (t.startsWith('[')) {
    const bars = (JSON.parse(t) as unknown[]).filter((c): c is number[] => Array.isArray(c) && c.length >= 5)
      .map((c) => ({ date: new Date(c[0] * 1000).toISOString().slice(0, 10), o: c[3], h: c[2], l: c[1], c: c[4] })).sort((a, b) => (a.date < b.date ? -1 : 1));
    return got({ bars });
  }
  const o = JSON.parse(t); const last = fin(o.last);
  return last === null ? got() : got({ points: [{ key: each, label: each, x: 0, value: last, prev: fin(o.open), date: '24h' }] });
}
export function feedPolymarket(body: string, last: number): Got {
  const out: Pt[] = [];
  for (const e of objs(JSON.parse(body))) for (const m of objs(e.markets)) {
    if (m.closed === true) continue;
    let prices: unknown; try { prices = JSON.parse(s(m.outcomePrices)); } catch { continue; }
    const p = Array.isArray(prices) ? fin(prices[0]) : null;
    if (p === null) continue;
    const label = s(m.groupItemTitle) || s(m.question);
    out.push({ key: s(m.slug) || label, label: `${s(e.title)}: ${label}`, x: out.length, value: p * 100, prev: null, date: s(e.endDate).slice(0, 10) });
  }
  return got({ points: out.slice(0, Math.max(1, last)) });
}
export function feedSec(body: string, o: ParseOpt): Got {
  const d = JSON.parse(body); const fy = s(d.fiscalYearEnd);
  const kv = ([['Name', s(d.name)], ['Tickers', (d.tickers ?? []).join(', ')], ['Exchanges', (d.exchanges ?? []).join(', ')], ['Industry', s(d.sicDescription)],
    ['Filer category', s(d.category)], ['Fiscal year end', fy.length === 4 ? `${fy.slice(0, 2)}-${fy.slice(2)}` : fy], ['State of incorporation', s(d.stateOfIncorporation)], ['CIK', s(d.cik)]] as [string, string][])
    .filter(([, v]) => v.trim() !== '');
  const r = d.filings?.recent;
  if (!r) return got({ kv });
  const want = new Set<string>(o.spec.forms ?? []); const cik = s(d.cik).replace(/^0+/, ''); const tpl = o.paths?.filing ?? '';
  const rows: string[][] = [], links: string[] = [];
  const forms: string[] = r.form ?? [];
  for (let i = 0; i < forms.length && rows.length < (o.spec.last ?? 12); i++) {
    if (want.size && !want.has(forms[i])) continue;
    rows.push([s(r.primaryDocDescription?.[i]).trim() || forms[i], forms[i], s(r.filingDate?.[i])]);
    links.push(tpl ? tpl.replace('{cik}', cik).replace('{accession}', s(r.accessionNumber?.[i]).replace(/-/g, '')).replace('{document}', s(r.primaryDocument?.[i])) : '');
  }
  return got({ kv, rows, links });
}
export const feedDeclared = (body: string): Got => got({ events: objs(JSON.parse(body).banks).flatMap((b) => objs(b.events).map((e) => ev({ ts: s(e.ts), country: s(b.country), title: s(e.title), importance: 3, kind: 'central_bank' }))) });
export function feedV1(body: string, concept: string): Got {
  const o = JSON.parse(body); const pts: Pt[] = [];
  for (const sr of objs(o.series)) {
    const obs = objs(sr.obs).flatMap((x): [string, number][] => { const v = fin(x.value); return v === null ? [] : [[s(x.date), v]]; }).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const last = obs[obs.length - 1]; if (!last) continue;
    pts.push({ key: s(sr.id), label: s(sr.title) || s(sr.id), x: pts.length, value: last[1], prev: obs[obs.length - 2]?.[1] ?? null, date: last[0] });
  }
  for (const q of objs(o.quotes)) { const p = fin(q.price); if (p !== null) pts.push({ key: s(q.symbol), label: s(q.name) || s(q.symbol), x: pts.length, value: p, prev: cboePrev(p, fin(q.change), fin(q.prev_close)), date: s(q.ts).slice(0, 16).replace('T', ' ') }); }
  const asof = s(o.asof); const prev = new Map<string, number>();
  if (Array.isArray(o.prev)) for (const p of objs(o.prev)) { const v = fin(p.value); if (v !== null) prev.set(s(p.label), v); }
  for (const p of objs(o.points)) { const v = fin(p.value); if (v === null) continue; const l = s(p.label); pts.push({ key: s(p.key) || l, label: l, x: fin(p.tenor_years) ?? pts.length, value: v, prev: prev.get(l) ?? null, date: asof }); }
  // /v1/curves/{CC} (finterm-store): {curve:{tenors:[{tenor, value|null, date, method}]}}; a null value (no free source) is left out
  for (const t of objs((o.curve as Record<string, unknown> | undefined)?.tenors)) { const v = fin(t.value); const k = s(t.tenor); const y = tenorYears(k); if (v === null || y === null) continue; pts.push({ key: k, label: k, x: y, value: v, prev: null, date: s(t.date) }); }
  if (o.rates && typeof o.rates === 'object') for (const c of Object.keys(o.rates).sort()) pts.push({ key: c, label: c, x: pts.length, value: Number(o.rates[c]), prev: fin(o.prev?.[c]), date: asof });
  for (const m of objs(o.implied)) { const v = fin(m.prob); if (v !== null) pts.push({ key: s(m.label), label: s(m.label), x: pts.length, value: v, prev: null, date: s(m.ends) }); }
  const facts = objs(o.facts?.[concept]).flatMap((x): [string, string, number][] => { const v = fin(x.val); return v === null ? [] : [[s(x.fy), s(x.end), v]]; }).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  facts.forEach(([fy, end, v], i) => pts.push({ key: fy, label: fy, x: i, value: v, prev: facts[i - 1]?.[2] ?? null, date: end }));
  const events = objs(o.events).map((e) => ev({ ts: s(e.ts), country: s(e.country), title: s(e.title), importance: Number(e.importance ?? 0), consensus: s(e.consensus), actual: s(e.actual), previous: s(e.previous), kind: s(e.kind) || 'economic' }));
  const bars = objs(o.bars).flatMap((b): Bar[] => { const c = fin(b.c) ?? fin(b.close); return c === null ? [] : [{ date: (s(b.t) || s(b.date)).slice(0, 10), o: fin(b.o) ?? fin(b.open) ?? c, h: fin(b.h) ?? fin(b.high) ?? c, l: fin(b.l) ?? fin(b.low) ?? c, c }]; }).sort((a, b) => (a.date < b.date ? -1 : 1));
  const kv = o.profile && typeof o.profile === 'object' ? Object.keys(o.profile).sort().map((k) => [k, s(o.profile[k])] as [string, string]) : [];
  const filings = objs(o.filings);
  return { points: pts, events, bars, kv, rows: filings.map((f) => [s(f.title) || s(f.form), s(f.form), s(f.filed)]), links: filings.map((f) => s(f.url)) };
}

// ---- watchlist and alert rules (Alerts.kt)

export type AlertRule = { kind: 'above' | 'below' | 'events'; symbol: string; level: number };
export type UserLists = { watchlist: string[]; alerts: AlertRule[] };
export const alertSymbol = (raw: string): string | null => { const t = raw.trim().toUpperCase(); return /^[A-Z0-9.^_=-]{1,15}$/.test(t) ? t : null; };
export function alertRule(raw: string): AlertRule | null {
  const t = raw.trim();
  const e = /^events\s*>=\s*([0-3])$/i.exec(t);
  if (e) return { kind: 'events', symbol: '', level: Number(e[1]) };
  const m = /^(\S+?)\s*([<>])\s*(-?[0-9]+(?:\.[0-9]+)?)$/.exec(t);
  if (!m) return null;
  const sym = alertSymbol(m[1]);
  return sym ? { kind: m[2] === '>' ? 'above' : 'below', symbol: sym, level: Number(m[3]) } : null;
}
export const ruleText = (r: AlertRule) => (r.kind === 'events' ? `events >= ${r.level}` : `${r.symbol} ${r.kind === 'above' ? '>' : '<'} ${sig(r.level)}`);
const norm = (x: string) => { const u = x.toUpperCase().replace(/^[\^_]+/, ''); return u.slice(u.lastIndexOf(':') + 1); };
export const sameSymbol = (a: string, b: string) => norm(a) === norm(b);
export const priceHits = (rules: AlertRule[], pts: Pt[]): string[] => rules.filter((r) => r.kind !== 'events').flatMap((r) =>
  pts.filter((p) => sameSymbol(p.key, r.symbol) || sameSymbol(p.label, r.symbol)).filter((p) => (r.kind === 'above' ? p.value > r.level : p.value < r.level))
    .map((p) => `ALERT ${r.symbol} ${sig(p.value)} ${r.kind === 'above' ? '>' : '<'} ${sig(r.level)}`));
export function eventHits(rules: AlertRule[], events: Ev[], nowUtc: string): string[] {
  const lv = rules.filter((r) => r.kind === 'events').map((r) => r.level);
  if (!lv.length || !nowUtc) return [];
  const min = Math.min(...lv); const now = Date.parse(nowUtc.replace(/Z?$/, 'Z').replace(/(T\d{2}:\d{2})Z$/, '$1:00Z')); const end = now + 24 * 3600e3;
  return events.filter((e) => e.importance >= min).filter((e) => {
    if (e.ts.length === 10) return e.ts === nowUtc.slice(0, 10);
    const t = Date.parse(e.ts.replace(/(T\d{2}:\d{2})Z$/, '$1:00Z'));
    return Number.isFinite(t) && t >= now && t <= end;
  }).map((e) => `ALERT ${e.ts.replace('T', ' ')} ${e.country} ${e.title}`);
}

// ---- the model engine

/** The slots a path or parameter may carry. */
export function slotsOf(f: { lookback_days?: number; cik?: string }, today: string, items: string[]): Record<string, string> {
  const d = new Date(`${today}T00:00:00Z`); const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const ym = (x: Date) => `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
  return { today, from: minusDays(today, f.lookback_days ?? 7), yyyymm: ym(d), prev_yyyymm: ym(p), cik: f.cik ?? '', each_csv: items.join(',') };
}
const fill = (v: string, sl: Record<string, string>) => Object.entries(sl).reduce((x, [k, y]) => x.split(`{${k}}`).join(y), v);
export function eachOf(f: Route, today: string, user?: UserLists): string[] {
  if (f.each_user === 'watchlist' && user?.watchlist.length) return user.watchlist;
  if ((f.each_days ?? 0) > 0) return Array.from({ length: f.each_days! }, (_, i) => minusDays(today, -i));
  return f.each ?? [];
}
const feedsEntryOf = feedsEntry;
/** The container's /v1 route of a model panel (the mesh, when it answers its health path). */
export async function apiRoute(panel: Panel, dash: Dashboard, ctx: Pick<Ctx, 'sources' | 'mesh' | 'reachable'>): Promise<{ source: Source; base: string } | null> {
  const p = panel.fetch?.primary; const api = p?.api ?? '';
  const src = ctx.sources.find((x) => x.id === p?.source); const own = ctx.sources.find((x) => x.id === panel.source);
  const v1 = src?.paths?.v1 ?? '';
  if (!p || !src || !own || !api || !v1 || !api.startsWith(v1) || !feedsEntryOf(src, dash.tab, dash.entry) || src.priority >= own.priority) return null;
  const base = ctx.mesh[src.fleet_endpoint ?? ''] ?? '';
  if (!base || !(await ctx.reachable(base.replace(/\/+$/, '') + (src.paths?.health ?? '')))) return null;
  return { source: src, base };
}
async function fetchRoute(src: Source, spec: Fetch & Route, ctx: Ctx): Promise<Got> {
  const items = eachOf(spec, ctx.today, ctx.user); const path = spec.path ?? ''; const ps = paramsOf(spec);
  const perItem = items.length > 0 && (path.includes('{each}') || ps.some(([, v]) => v.includes('{each}')));
  const list = perItem ? items : [''];
  const conn = spec.provider || src.connector || '';
  const res = await Promise.all(list.map(async (item) => {
    const sl = { ...slotsOf(spec, ctx.today, items), each: item };
    try { return parseFeed(conn, await ctx.get(buildUrl(src.endpoint, path, ps.map(([k, v]) => [k, fill(v, sl)] as [string, string]), sl)), { spec, each: item, paths: src.paths }); } catch (e) { return e instanceof Error ? e : new Error(String(e)); }
  }));
  const ok = res.filter((r): r is Got => !(r instanceof Error));
  // every item failed: the first failure says why (a CORS / off-line block stays a block)
  if (!ok.length) throw res[0];
  return ok.reduce<Got>((a, b) => plus(a, b), got());
}
/** A fallback route's spec: the panel's options with the route's own path, params, items and provider. */
function routeSpec(f: Fetch, fb: Route): Fetch & Route {
  const { path: _p, params: _q, provider: _v, fallbacks: _f, primary: _r, each: _e, each_days: _d, each_user: _u, ...rest } = f as Fetch & Route;
  return { ...rest, ...fb } as Fetch & Route;
}
async function modelPanel(panel: Panel, dash: Dashboard, source: Source, f: Fetch, ctx: Ctx): Promise<PanelData> {
  let g = got(); let by = ''; let answered = false;
  const api = await apiRoute(panel, dash, ctx);
  if (api && f.primary?.api) {
    try {
      const items = eachOf(f as Route, ctx.today, ctx.user); const sl = slotsOf(f, ctx.today, items);
      const r = parseFeed(f.primary.parse || 'finterm_v1', await ctx.get(buildUrl(api.base, fill(f.primary.api, sl), paramsOf(f.primary).map(([k, v]) => [k, fill(v, sl)] as [string, string]))), { spec: f });
      if (!isEmpty(r)) { g = r; by = api.source.name; }
    } catch { g = got(); }
  }
  if (isEmpty(g)) {
    const routes: [Source, Fetch & Route][] = [];
    if (browserReadable(source)) routes.push([source, f as Fetch & Route]);
    for (const fb of f.fallbacks ?? []) {
      const src = ctx.sources.find((x) => x.id === fb.source);
      if (src && feedsEntry(src, dash.tab, dash.entry) && browserReadable(src)) routes.push([src, routeSpec(f, fb)]);
    }
    if (!routes.length) throw blocked(source); // every public route is CORS-blocked: no request at all
    const names: string[] = []; let firstErr: unknown = null;
    for (const [src, spec] of routes) {
      let r: Got;
      try { r = await fetchRoute(src, spec, ctx); answered = true; } catch (e) { firstErr ??= e; continue; }
      if (isEmpty(r)) continue;
      g = plus(g, r); names.push(src.name);
      if (!f.merge) break;
    }
    const uniq = [...new Set(names)];
    by = uniq.length === 1 && uniq[0] === source.name ? '' : uniq.join(' + ');
    if (isEmpty(g) && !(answered && panel.derive === 'events')) throw firstErr ?? new Error('no data');
  }
  return { ...renderModel(panel, f, g, ctx), servedBy: by };
}
export function eventsIn(all: Ev[], filter: Fetch['filter'], today: string): Ev[] {
  const from = minusDays(today, filter?.days_back ?? 1), to = minusDays(today, -(filter?.days_ahead ?? 7)), min = filter?.importance_min ?? 0;
  const seen = new Set<string>();
  return all.filter((e) => e.ts.length >= 10 && e.ts.slice(0, 10) >= from && e.ts.slice(0, 10) <= to && e.importance >= min)
    .filter((e) => { const k = `${e.ts.slice(0, 13)}|${e.country}|${e.title.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.ts.slice(0, 10).localeCompare(b.ts.slice(0, 10)) || (a.ts.length === 10 ? '' : a.ts).localeCompare(b.ts.length === 10 ? '' : b.ts) || b.importance - a.importance);
}
export const dots = (n: number) => { const k = Math.max(0, Math.min(3, n)); return '\u25CF'.repeat(k) + '\u25CB'.repeat(3 - k); };
/** Previous close of a quote: price minus the absolute change; a prev_close equal to the price (Cboe's post-close roll) is unknown, not a 0 % change. */
export const cboePrev = (price: number, change: number | null, prevClose: number | null): number | null =>
  change !== null ? price - change : prevClose !== null && prevClose !== price ? prevClose : null;
/** The instrument's display decimals: 2 for a level at or above 1, 4 below. */
export const decimals = (level: number) => (Math.abs(level) >= 1 ? 2 : 4);
function renderModel(panel: Panel, f: Fetch, g: Got, ctx: Ctx): PanelData {
  const columns = panel.columns ?? [];
  const base = { columns, links: [] as string[], chart: [] as ChartPoint[], asOf: '', note: '', servedBy: '' };
  switch (panel.derive) {
    case 'events': {
      const evs = eventsIn(g.events, f.filter, ctx.today);
      const alerts = panel.alerts === 'event' ? eventHits(ctx.user?.alerts ?? [], evs, ctx.nowUtc ?? '') : [];
      return { ...base, rows: evs.map((e) => [e.ts.replace('T', ' ').replace(/Z$/, ''), e.country, e.title, dots(e.importance), e.consensus, e.actual, e.previous]), asOf: ctx.today, note: evs.length ? '' : 'No event in this window.', alerts };
    }
    case 'candles': {
      const seen = new Set<string>(); const bars = g.bars.filter((b) => (seen.has(b.date) ? false : (seen.add(b.date), true))).sort((a, b) => (a.date < b.date ? -1 : 1));
      return { ...base, chart: bars.map((b, i) => ({ label: b.date, x: i, y: b.c })), rows: bars.slice(-5).reverse().map((b) => [b.date, sig(b.o), sig(b.h), sig(b.l), sig(b.c)]), asOf: bars[bars.length - 1]?.date ?? '' };
    }
    case 'kv': return { ...base, rows: g.kv.map(([k, v]) => [k, v]) };
    case 'filings': return { ...base, rows: g.rows, links: g.links, asOf: g.rows.reduce((m, r) => ((r[2] ?? '') > m ? r[2] : m), '') };
    default: return renderPoints(panel, f, g.points, ctx, base);
  }
}
function renderPoints(panel: Panel, f: Fetch, all: Pt[], ctx: Ctx, base: Omit<PanelData, 'rows'>): PanelData {
  const keyIn = (o: Record<string, unknown>, k: string) => (k in o ? k : k.slice(k.lastIndexOf(':') + 1) in o ? k.slice(k.lastIndexOf(':') + 1) : null);
  const seen = new Set<string>();
  let pts = all.filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
  if (f.labels && Object.keys(f.labels).length) pts = pts.flatMap((p) => { const k = keyIn(f.labels!, p.key); return k === null ? [] : [{ ...p, label: f.labels![k] }]; });
  if (f.years && Object.keys(f.years).length) pts = pts.flatMap((p) => { const k = keyIn(f.years!, p.key); return k === null ? [] : [{ ...p, x: f.years![k] }]; }).sort((a, b) => a.x - b.x);
  const bp = panel.change_unit === 'bp'; const pctUnit = panel.unit === '%';
  const v = (x: number) => (pctUnit ? num(x, 2) : Math.abs(x) >= 1000 ? group(x) : sig(x));
  const plain = (x: number) => (pctUnit ? num(x, 2) : Math.abs(x) >= 10000 ? Math.round(x).toLocaleString('en-US') : String(Number(x.toFixed(4))));
  const chg = (p: Pt) => (p.prev === null ? NA : bp ? signed((p.value - p.prev) * 100, 1) : signed(p.value - p.prev, decimals(p.value)));
  const pctOf = (p: Pt) => (p.prev === null || p.prev === 0 ? null : (p.value / p.prev - 1) * 100);
  const pctText = (p: Pt) => { const x = pctOf(p); return x === null ? NA : signed(x, 2); };
  // a quotes table whose feed has no previous value (NY Fed latest) drops the change columns instead of drawing dashes
  const noChange = panel.view === 'quotes' && pts.length > 0 && pts.every((p) => p.prev === null);
  const rows = pts.map((p) => noChange ? [p.label, v(p.value), p.date] : panel.value_columns === 'actual_previous' ? [p.label, plain(p.value), p.prev === null ? NA : plain(p.prev), p.date]
    : panel.view === 'quotes' ? [p.label, v(p.value), chg(p), bp ? NA : pctText(p), p.date] : [p.label, v(p.value), bp ? chg(p) : pctText(p), p.date]);
  const chart = panel.view === 'curve' ? pts.map((p) => ({ label: p.label, x: p.x, y: p.value }))
    : panel.view === 'bars' ? pts.map((p, i) => ({ label: p.label, x: i, y: panel.chart_value === 'change_pct' ? pctOf(p) ?? 0 : p.value }))
    : panel.view === 'quotes' ? pts.map((p, i) => ({ label: p.label, x: i, y: bp ? (p.prev === null ? 0 : (p.value - p.prev) * 100) : pctOf(p) ?? 0 })) : [];
  const alerts = panel.alerts === 'price' ? priceHits(ctx.user?.alerts ?? [], pts) : [];
  const spark = pts.map((p) => (p.hist && p.hist.length > 1 ? p.hist : null));
  return { ...base, ...(noChange ? { columns: base.columns.filter((c) => !c.startsWith('Chg')) } : {}), rows, chart, asOf: pts.reduce((m, p) => (p.date > m ? p.date : m), ''), alerts, ...(spark.some(Boolean) ? { spark } : {}) };
}

// #1539 the Central Bank (CB) page logic of the web FinTerm, the same math as the APK's CbTables.kt: the GDP-weighted aggregation, the heat against history, the Taylor-rule model
// and the tables for FinMatrix. Everything it shows comes from finterm-cb.json (GENERATED from the APK's data/cb-*.json): no country, indicator or word is typed here.
export type Series = { source: string; release: string; vintage: string; unit?: string; note?: string; hist?: Record<string, number>; fc?: Record<string, number>; ytd?: { year: number; value: number; through: string }; cb_projection?: { label: string; release: string; vintage: string; fc: Record<string, number> }[] };
export type Country = { id: string; name: string; group: string; aggregate: boolean; inflation_target?: number; note?: string };
export type Indicator = { id: string; name: string; unit: string; model_only?: boolean };
export type CbData = {
  countries: { countries: Country[]; weights: { default: string; options: { id: string; label: string }[] }; ui: Record<string, string>; years: { history: number; forecast: number };
    model: { taylor: { inflation_weight: number; gap_weight: number; hold_band_pp: number; neutral: string; inflation: string; gap: string; policy: string }; predictions: string[] } };
  indicators: { simple: { groups: { id: string; label: string; items: { id: string; name: string; refs: string[] }[] }[] }; full: { groups: { id: string; label: string; items: Indicator[] }[] } };
  snapshot: { generated: string; current_year: number; history_from: number; forecast_to: number; weights: Record<string, Record<string, Record<string, number>>>; countries: Record<string, { series: Record<string, Series> }> };
};
export type Table = { header: string[]; rows: string[][]; heat: (number | null)[][]; ids: string[]; pinned: number };
export const WORLD = 'WORLD';

/** The value of a year: an actual, a forecast, else the year to date when the year is in progress; null = n/a. */
export const at = (s: Series | undefined, year: number): number | null => s?.hist?.[year] ?? s?.fc?.[year] ?? (s?.ytd && s.ytd.year === year ? s.ytd.value : null) ?? null;
export const isForecast = (s: Series, year: number): boolean => s.hist?.[year] == null && s.fc?.[year] != null;

/** Weighted mean over the (value, weight) pairs that have both; weights re-normalised; coverage = their share of all weight. */
export function weightedMean(pairs: [number | null, number | null][]): { value: number | null; countries: number; coverage: number } {
  const w = pairs.filter(([, x]) => x != null && x > 0) as [number | null, number][];
  const used = w.filter(([v]) => v != null) as [number, number][];
  const all = w.reduce((a, [, x]) => a + x, 0), sum = used.reduce((a, [, x]) => a + x, 0);
  if (!used.length || sum <= 0) return { value: null, countries: 0, coverage: 0 };
  return { value: used.reduce((a, [v, x]) => a + v * x, 0) / sum, countries: used.length, coverage: all > 0 ? sum / all : 0 };
}

export const heatOf = (history: number[], v: number): number | null => {
  if (history.length < 5) return null;
  const m = history.reduce((a, b) => a + b, 0) / history.length;
  const sd = Math.sqrt(history.reduce((a, b) => a + (b - m) * (b - m), 0) / history.length);
  return sd <= 1e-9 ? null : Math.max(-1, Math.min(1, (v - m) / sd / 2));
};

export const taylor = (m: CbData['countries']['model']['taylor'], neutral: number | null, inflation: number | null, target: number | null | undefined, gap: number | null): number | null =>
  neutral == null || inflation == null || target == null || gap == null ? null : neutral + target + m.inflation_weight * (inflation - target) + m.gap_weight * gap;
export const bias = (m: CbData['countries']['model']['taylor'], implied: number | null, policy: number | null): number | null =>
  implied == null || policy == null ? null : implied - policy > m.hold_band_pp ? 1 : implied - policy < -m.hold_band_pp ? -1 : 0;

export const fmt = (v: number): string => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2));
export const wrap = (name: string, width = 11): string => {
  const lines: string[] = [];
  for (const w of name.split(' ')) lines.length && lines[lines.length - 1].length + 1 + w.length <= width ? (lines[lines.length - 1] += ' ' + w) : lines.push(w);
  return lines.length <= 3 ? lines.join('\n') : [...lines.slice(0, 2), lines.slice(2).join(' ')].join('\n');
};

export class Cb {
  constructor(readonly d: CbData) {}
  get ui() { return this.d.countries.ui; }
  get countries() { return this.d.countries.countries; }
  get snap() { return this.d.snapshot; }
  get indicators(): Record<string, Indicator> { return Object.fromEntries(this.d.indicators.full.groups.flatMap((g) => g.items).map((i) => [i.id, i])); }
  series = (c: string, i: string): Series | undefined => this.snap.countries[c]?.series[i];
  weight = (opt: string, c: string, y: number): number | null => this.snap.weights[opt]?.[c]?.[y] ?? null;
  members = (group: string): Country[] => this.countries.filter((c) => c.aggregate && (group === WORLD || c.group === group));
  aggregate = (group: string, ind: string, y: number, opt: string) => weightedMean(this.members(group).map((c) => [at(this.series(c.id, ind), y), this.weight(opt, c.id, y)]));
  share = (group: string, y: number, opt: string): number | null => {
    const tot = this.members(WORLD).reduce((a, c) => a + (this.weight(opt, c.id, y) ?? 0), 0), mine = this.members(group).reduce((a, c) => a + (this.weight(opt, c.id, y) ?? 0), 0);
    return tot > 0 ? mine / tot : null;
  };
  years = (): number[] => Array.from({ length: this.d.countries.years.forecast + 1 }, (_, k) => this.snap.current_year - 1 + k);
  groups = (full: boolean) => (full ? this.d.indicators.full.groups : this.d.indicators.simple.groups).map((g) => ({ id: g.id, label: g.label }));
  columns = (full: boolean, group: string): { id: string; name: string; modelOnly: boolean }[] => {
    if (full) { const g = this.d.indicators.full.groups.find((x) => x.id === group) ?? this.d.indicators.full.groups[0]; return g.items.map((i) => ({ id: i.id, name: i.name, modelOnly: !!i.model_only })); }
    const g = this.d.indicators.simple.groups.find((x) => x.id === group) ?? this.d.indicators.simple.groups[0];
    return g.items.map((s) => ({ id: s.refs[0], name: s.name, modelOnly: !!this.indicators[s.refs[0]]?.model_only }));
  };
  private miss = (modelOnly: boolean) => (modelOnly ? this.ui.model_only : this.ui.na);
  private aggName = (g: string) => (g === WORLD ? this.ui.world : g === 'DM' ? this.ui.dm : this.ui.em);
  private cell(col: { id: string; modelOnly: boolean }, c: string, y: number): [string, number | null] {
    const s = this.series(c, col.id), v = at(s, y);
    return s == null || v == null ? [this.miss(col.modelOnly), null] : [fmt(v), heatOf(Object.values(s.hist ?? {}), v)];
  }
  private aggCell(col: { id: string; modelOnly: boolean }, g: string, y: number, opt: string): [string, number | null] {
    const a = this.aggregate(g, col.id, y, opt);
    if (a.value == null) return [this.miss(col.modelOnly), null];
    const hist: number[] = []; for (let h = this.snap.history_from; h < this.snap.current_year; h++) { const x = this.aggregate(g, col.id, h, opt).value; if (x != null) hist.push(x); }
    return [fmt(a.value), heatOf(hist, a.value)];
  }
  countriesTable(full: boolean, group: string, y: number, opt: string): Table {
    const cols = this.columns(full, group), pins = [WORLD, 'DM', 'EM'], rows: string[][] = [], heat: (number | null)[][] = [], ids: string[] = [];
    for (const g of pins) { const cs = cols.map((c) => this.aggCell(c, g, y, opt)); rows.push([this.aggName(g), ...cs.map((x) => x[0])]); heat.push([null, ...cs.map((x) => x[1])]); ids.push(g); }
    for (const c of this.countries) { const cs = cols.map((k) => this.cell(k, c.id, y)); rows.push([c.name, ...cs.map((x) => x[0])]); heat.push([null, ...cs.map((x) => x[1])]); ids.push(c.id); }
    return { header: ['', ...cols.map((c) => wrap(c.name))], rows, heat, ids, pinned: pins.length };
  }
  groupsTable(full: boolean, group: string, y: number, opt: string): Table {
    const cols = this.columns(full, group), rows: string[][] = [], heat: (number | null)[][] = [], ids: string[] = [];
    for (const g of [WORLD, 'DM', 'EM']) {
      const cs = cols.map((c) => this.aggCell(c, g, y, opt)), sh = this.share(g, y, opt);
      rows.push([this.aggName(g), sh == null ? this.ui.na : `${Math.round(sh * 100)}%`, ...cs.map((x) => x[0])]); heat.push([null, null, ...cs.map((x) => x[1])]); ids.push(g);
    }
    return { header: ['', this.ui.share, ...cols.map((c) => wrap(c.name))], rows, heat, ids, pinned: rows.length };
  }
  implied(c: Country, y: number): number | null {
    const m = this.d.countries.model.taylor;
    return taylor(m, at(this.series(c.id, m.neutral), y), at(this.series(c.id, m.inflation), y), c.inflation_target, at(this.series(c.id, m.gap), y));
  }
  predictionsTable(): Table {
    const y = this.snap.current_year, n = this.d.countries.years.forecast, inds = this.d.countries.model.predictions.map((i) => this.indicators[i]).filter(Boolean), t = this.d.countries.model.taylor;
    const header = ['', ...inds.flatMap((i) => Array.from({ length: n }, (_, k) => `${i.name}\n${y + k}`)), this.indicators[t.policy]?.name ?? '', ...Array.from({ length: n }, (_, k) => `${this.ui.taylor}\n${y + k}`), this.ui.bias];
    const rows: string[][] = [], ids: string[] = [];
    for (const c of this.countries) {
      const cells: string[] = [];
      for (const i of inds) for (let k = 0; k < n; k++) { const v = at(this.series(c.id, i.id), y + k); cells.push(v == null ? this.ui.na : fmt(v)); }
      const s = this.series(c.id, t.policy), pol = s ? (s.ytd?.value ?? (s.hist ? s.hist[Math.max(...Object.keys(s.hist).map(Number))] : null) ?? null) : null;
      cells.push(pol == null ? this.ui.na : fmt(pol));
      const path = Array.from({ length: n }, (_, k) => this.implied(c, y + k));
      cells.push(...path.map((v) => (v == null ? this.ui.na : fmt(v))));
      const b = bias(t, path[n - 1] ?? null, pol); cells.push(b == null ? this.ui.na : b > 0 ? '+' : b < 0 ? '-' : '=');
      rows.push([c.name, ...cells]); ids.push(c.id);
    }
    return { header, rows, heat: rows.map(() => []), ids, pinned: 0 };
  }
}

export const transpose = (t: Table): Table => ({
  header: ['', ...t.rows.map((r) => r[0])],
  rows: t.header.slice(1).map((h, j) => [h.replace(/\n/g, ' '), ...t.rows.map((r) => r[j + 1] ?? '')]),
  heat: t.header.slice(1).map((_, j) => [null, ...t.heat.map((r) => r[j + 1] ?? null)]),
  ids: t.header.slice(1), pinned: 0,
});

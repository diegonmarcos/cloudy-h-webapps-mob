// PM > D1 "EM Bonds CALCULATOR" and D0 "EM Carry Trade" (#1447): the maths and tables of the APK's EmCalc.kt, tested on the same numbers. One engine: the monthly
// EUR return on the NAV of a bond paying gross yield g against an inflation (or funding yield) i, at an FX level, after the capital-gains tax and the exchange spread:
//   real = (1 + g) / (1 + i) - 1;  net = NAV * real / 12 * (FX centre / FX) * (1 - CG) * (1 - spread).  Rates are fractions here; the tables show percents.
import { FetchError, buildUrl, browserReadable, type Ctx, type Fetch, type Panel, type PanelData, type Source } from './engine';
import { cpiYoY } from './g20bonds';
import { windowAvg, type S } from './fxppp';

export type EmInputs = { navEur: number; cg: number; spread: number; exchStep: number; yieldStep: number; centerDiff: number; round: number; n: number; ma: boolean };
export type EmLive = { yHigh: number; yFund: number | null; infl: number; brlUsd: number; brlEur: number; basis: string; fails: string[] };
export const EM_DEFAULTS: EmInputs = { navEur: 200000, cg: 0.17, spread: 0.02, exchStep: 0.05, yieldStep: 0.0075, centerDiff: 0, round: 250, n: 3, ma: false };

export const real = (g: number, infl: number) => (1 + g) / (1 + infl) - 1;
/** The tax and the spread bite a gain only; a loss is shown as it is. */
export const netOf = (gross: number, cg: number, spread: number) => (gross > 0 ? gross * (1 - cg) * (1 - spread) : gross);
export const monthlyNet = (navEur: number, g: number, infl: number, fxCentre: number, fx: number, cg: number, spread: number) => netOf((navEur * real(g, infl)) / 12 * (fxCentre / fx), cg, spread);
/** Display rounding to the nearest `step` (half up); a step of 0 or less shows the exact value. */
export const roundTo = (v: number, step: number) => (step <= 0 ? v : Math.floor(v / step + 0.5) * step);
/** 2n + 1 levels centred on c, `step` apart (relative: c * (1 + k * step); else c + k * step). */
export const axis = (c: number, step: number, n: number, relative: boolean) => Array.from({ length: 2 * n + 1 }, (_, i) => { const k = i - n; return relative ? c * (1 + k * step) : c + k * step; });

export function grid(live: EmLive, i: EmInputs) {
  const yields = axis(live.yHigh + i.centerDiff, i.yieldStep, i.n, false);
  const fxUsd = axis(live.brlUsd, i.exchStep, i.n, true); const fxEur = axis(live.brlEur, i.exchStep, i.n, true);
  return { yields, fxUsd, fxEur, cells: fxEur.map((fx) => yields.map((g) => roundTo(monthlyNet(i.navEur, g, live.infl, live.brlEur, fx, i.cg, i.spread), i.round))) };
}
/** Cell tints -1 (red) .. +1 (green): the distance from the centre cell over the largest distance in the grid. */
export function heat(cells: number[][]): number[][] {
  const c = cells[Math.floor(cells.length / 2)][Math.floor(cells[0].length / 2)];
  const span = Math.max(...cells.flat().map((v) => Math.abs(v - c)));
  return cells.map((r) => r.map((v) => (span === 0 ? 0 : (v - c) / span)));
}

export const pct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;
export const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fxs = (v: number) => v.toFixed(2);
const joinFails = (l: EmLive) => (l.fails.length ? ` — ${l.fails.join(' · ')}` : '');

export function emMatrix(panel: Panel, live: EmLive, i: EmInputs, by: string, asOf: string): PanelData {
  const g = grid(live, i); const h = heat(g.cells); const c = i.n;
  const none = Array(g.yields.length + 2).fill(null) as null[];
  const rows = [['', 'Inflation', ...g.yields.map(() => pct(live.infl))], ['', 'EUR - infl', ...g.yields.map((y) => pct(real(y, live.infl)))],
    ...g.cells.map((row, r) => [fxs(g.fxUsd[r]), fxs(g.fxEur[r]), ...row.map(money)])];
  const note = `Monthly EUR net return on a ${money(i.navEur)} NAV after ${pct(i.cg, 0)} capital-gains tax and ${pct(i.spread, 0)} exchange spread${i.round > 0 ? `, rounded to ${i.round}` : ''}. ` +
    `Real yield = (1 + gross) / (1 + inflation) - 1; rows move the BRL level by ${pct(i.exchStep, 1)}, columns the gross yield by ${pct(i.yieldStep)}.${live.basis ? ` ${live.basis}.` : ''}${joinFails(live)}`;
  return { columns: ['BRL/USD', 'BRL/EUR', ...g.yields.map((y) => pct(y))], rows, links: [], chart: [], asOf, note, servedBy: by, heat: [none, none, ...h.map((r) => [null, null, ...r])],
    bold: [[c + 2, c + 2], [1, c + 2], [0, c + 2], [c + 2, 0], [c + 2, 1]] };
}

export function emInputs(panel: Panel, live: EmLive, i: EmInputs, by: string, asOf: string): PanelData {
  const rows = [['NAV (Gross) usd', money((i.navEur * live.brlEur) / live.brlUsd)], ['NAV (Gross) eur', money(i.navEur)], ['NAV (Gross) brl', money(i.navEur * live.brlEur)],
    ['Tax CG', pct(i.cg, 0)], ['Tax Exch Spread', pct(i.spread, 0)], ['Gross Yield', `Brazil Gov Bonds ${pct(live.yHigh)}`], ['Inflation', `Germany ${pct(live.infl)}`],
    ['Center', i.ma ? 'MA 7 days' : 'Now'], ['Center Diff', pct(i.centerDiff)], ['Exch step', pct(i.exchStep, 1)], ['Yield step', `${pct(i.yieldStep)} (${Math.round(i.yieldStep * 10000)} bps)`],
    ['BRL per USD', fxs(live.brlUsd)], ['BRL per EUR', fxs(live.brlEur)]];
  return { columns: panel.columns ?? [], rows, links: [], chart: [], asOf, note: live.fails.join(' · '), servedBy: by };
}

export function emCarry(panel: Panel, live: EmLive, i: EmInputs, by: string, asOf: string): PanelData {
  if (live.yFund === null) throw new Error('no funding-currency yield');
  const yf = live.yFund; const carry = live.yHigh - yf;
  const be = 1 - (1 + yf) / (1 + live.yHigh); // the high-yielder's 12M fall vs the funding currency that wipes the carry out
  const flat = monthlyNet(i.navEur, live.yHigh, yf, 1, 1, i.cg, i.spread);
  /** The 12M carry (1 + real) compounded with a BRL move m vs EUR, as a monthly figure like the calculator's; m = -breakeven gives 0. */
  const scen = (m: number) => netOf((i.navEur * ((1 + real(live.yHigh, yf)) * (1 + m) - 1)) / 12, i.cg, i.spread);
  const rows = [['Funding yield (EUR, Germany 10Y)', pct(yf)], ['High-yielder yield (BRL, Brazil 10Y)', pct(live.yHigh)], ['Carry (high-yielder - funding)', pct(carry)],
    ['Breakeven BRL fall vs EUR, 12M', pct(be)], ['Net carry EUR per month (after tax and spread)', money(flat)], ['Net carry % a year on NAV', pct((flat * 12) / i.navEur)],
    ['Net EUR per month if BRL -10% in 12M', money(scen(-0.1))], ['Net EUR per month if BRL +10% in 12M', money(scen(0.1))], ['BRL per EUR now', fxs(live.brlEur)]];
  const note = `Funding EUR against BRL on a ${money(i.navEur)} NAV; the same ${pct(i.cg, 0)} capital-gains tax and ${pct(i.spread, 0)} exchange spread as the calculator (monthlyNet). ` +
    `Carry = the two 10Y yields, a stand-in for the short rates. A BRL fall larger than the breakeven turns the carry into a loss.${live.basis ? ` ${live.basis}.` : ''}${joinFails(live)}`;
  return { columns: panel.columns ?? [], rows, links: [], chart: [], asOf, note, servedBy: by };
}

type O = Record<string, unknown>;
export const inputsOf = (f: O): EmInputs => { const o = (f.inputs ?? {}) as O; const d = EM_DEFAULTS; const n = (k: string, x: number) => (typeof o[k] === 'number' ? (o[k] as number) : x);
  return { navEur: n('nav_eur', d.navEur), cg: n('cg', d.cg), spread: n('spread', d.spread), exchStep: n('exch_step', d.exchStep), yieldStep: n('yield_step', d.yieldStep), centerDiff: n('center_diff', d.centerDiff), round: n('round', d.round), n: n('n', d.n), ma: o.center === 'ma7' }; };

/** The latest value (the centre "Now"), or the `win`-day average ending at its last point (the centre "MA 7 days"). */
export function pick(s: S, useMa: boolean, win: number): [number, string] | null {
  if (!s.length) return null;
  const last = [...s].sort((a, b) => (a[0] < b[0] ? -1 : 1)).pop()!;
  if (!useMa || last[0].length !== 10) return [last[1], last[0]];
  return [windowAvg(s, last[0], win) ?? last[1], `MA ${win} d to ${last[0]}`];
}

/** The live inputs through the #1397 feeds: OECD monthly 10Y and CPI on DBnomics, ECB rates (Frankfurter). A source a browser cannot read says so. */
export async function emLive(f: Fetch, i: EmInputs, ctx: Ctx): Promise<{ live: EmLive; by: string; asOf: string }> {
  const g = f as unknown as O & { oecd?: { path: string; prefix: string; suffix: string; cpi_suffix: string } };
  const o = g.oecd!; const hi = String(g.high_a3); const fu = String(g.fund_a3); const ic = String(g.infl_a3);
  const fails: string[] = []; const used: string[] = []; let first: unknown = null;
  const src = (id: unknown) => ctx.sources.find((x) => x.id === id);
  const read = async (s: Source | undefined, go: (s: Source) => Promise<void>) => {
    if (!s) return;
    if (!browserReadable(s)) { fails.push(`${s.name} sends no CORS header (open on the mesh)`); return; }
    try { await go(s); used.push(s.name); } catch (e) { first ??= e; fails.push(`${s.name}: ${(e as Error).message}`); }
  };
  const y = new Map<string, S>(); let cpi: [number, string] | null = null;
  await read(src(g.oecd_source), async (s) => {
    const ids = [...new Set([hi + o.suffix, fu + o.suffix, ic + o.cpi_suffix])].map((x) => o.prefix + x).join(',');
    const a = JSON.parse(await ctx.get(buildUrl(s.endpoint, o.path, [['series_ids', ids], ['observations', '1'], ['limit', '100']]))) as { series?: { docs?: { series_code: string; period: string[]; value: (number | string | null)[] }[] } };
    for (const d of a.series?.docs ?? []) {
      const pts = d.period.flatMap((p, k) => (typeof d.value[k] === 'number' ? [[p, d.value[k] as number] as [string, number]] : []));
      if (d.series_code.endsWith(o.cpi_suffix)) { if (d.series_code.startsWith(ic)) cpi = cpiYoY(pts); } else { const k = d.series_code.split('.')[0]; y.set(k, [...(y.get(k) ?? []), ...pts]); }
    }
  });
  const fx = new Map<string, S>();
  await read(src(g.fx_source), async (s) => {
    const to = ctx.today; const from = new Date(Date.parse(`${to}T00:00:00Z`) - 30 * 864e5).toISOString().slice(0, 10);
    const rates = (JSON.parse(await ctx.get(buildUrl(s.endpoint, `/v1/${from}..${to}`, [['base', 'USD'], ['symbols', 'BRL,EUR']]))) as { rates?: Record<string, Record<string, number>> }).rates ?? {};
    for (const d of Object.keys(rates).sort()) for (const [k, v] of Object.entries(rates[d])) fx.set(k, [...(fx.get(k) ?? []), [d, v]]);
  });
  const yh = pick(y.get(hi) ?? [], i.ma, 7); const yf = pick(y.get(fu) ?? [], i.ma, 7); const brl = pick(fx.get('BRL') ?? [], i.ma, 7); const eur = pick(fx.get('EUR') ?? [], i.ma, 7);
  const missing = [!yh && 'no Brazil 10Y yield', !cpi && 'no Germany CPI a year apart', (!brl || !eur) && 'no BRL / EUR rate'].filter(Boolean) as string[];
  if (missing.length) { const m = [...missing, ...fails].join(' · '); throw first instanceof FetchError && !used.length ? new FetchError('blocked', m) : new Error(m); }
  const c = cpi as unknown as [number, string];
  return { live: { yHigh: yh![0] / 100, yFund: yf ? yf[0] / 100 : null, infl: c[0] / 100, brlUsd: brl![0], brlEur: brl![0] / eur![0], basis: `Yield ${yh![1]}, CPI ${c[1]}, FX ${brl![1]}`, fails },
    by: used.join(' + '), asOf: (fx.get('BRL') ?? []).map((x) => x[0]).sort().pop() ?? '' };
}

export async function emPanel(panel: Panel, f: Fetch, ctx: Ctx): Promise<PanelData> {
  const i = inputsOf(f as unknown as O); const { live, by, asOf } = await emLive(f, i, ctx);
  if (panel.derive === 'em_carry') return emCarry(panel, live, i, by, asOf);
  return (f as unknown as O).part === 'inputs' ? emInputs(panel, live, i, by, asOf) : emMatrix(panel, live, i, by, asOf);
}

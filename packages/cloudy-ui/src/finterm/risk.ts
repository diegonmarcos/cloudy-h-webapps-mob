// #1478 the PM tables (finterm.json pm: Vol, Commodities, Profiles) and the Vol risk-level filter, mirroring RiskTabs.kt / PmTables.kt of the APK.
// Vol rows name their portfolio dashboard; the filter tab is the dashboard's declared `risk` tier (finterm.json risk_tabs). Everything shown is the declaration's.
export type RiskTab = { id: string; label: string; market?: string; equity_max?: number };
export type PmRow = { dashboard?: string; name?: string; cells: string[] };
export type PmTab = { id: string; label: string; leads: string; rows: string[][] };
export type PmTableDecl = { columns: string[]; label_fracs: number[]; note: string; heat?: [number, number]; tool?: { label: string; dashboard: string }; rows?: PmRow[]; tabs?: PmTab[] };
export const RISK_ALL = 'all';
/** The Vol filter: every row for `all`, else the rows whose portfolio's declared risk tier (`riskOf`, a dashboard id) is `selected`. */
export function filterRows<T extends { dashboard?: string }>(rows: T[], riskOf: (dashboard: string) => string, selected: string): T[] {
  return selected === RISK_ALL ? rows : rows.filter((r) => riskOf(r.dashboard ?? '') === selected);
}
/** The matrix rows: the label cell (the declared name, else the portfolio's `entry` via `nameOf`) then the declared cells. */
export const matrixRows = (rows: PmRow[], nameOf: (dashboard: string) => string): string[][] => rows.map((r) => [r.name ?? nameOf(r.dashboard ?? ''), ...r.cells]);
/** Heat of each cell: its weight over the largest weight of the `range` columns (matrix column indices, 0..1 green), null outside the range or when not a number (PmTables.heat). */
export function heatOf(rows: PmRow[], range: [number, number] | undefined): (number | null)[][] {
  if (!range) return rows.map(() => []);
  const num = (r: PmRow, i: number) => { const v = parseFloat(r.cells[i - 1] ?? ''); return Number.isFinite(v) ? v : null; };
  const cols = Array.from({ length: range[1] - range[0] + 1 }, (_, k) => range[0] + k);
  const max = Math.max(0, ...rows.flatMap((r) => cols.map((i) => num(r, i) ?? 0)));
  if (max <= 0) return rows.map(() => []);
  return rows.map((r) => Array.from({ length: r.cells.length + 1 }, (_, i) => (i >= range[0] && i <= range[1] && num(r, i) != null ? num(r, i)! / max : null)));
}

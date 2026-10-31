// FinTerm terminal UI logic (UI spec 1.2 FinFormat, 2.6 beat/miss, 2.3 sort, 5.1 RefreshPolicy): pure functions, shared by every component and unit-tested.
export type Dir = 'up' | 'down' | 'flat';
export const DASH = '—';

/** A number in a source string ("180K", "4.2%", "-0.3", "1,234.5"); null when there is none. */
export function parseNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = /[-+]?\d[\d,]*(?:\.\d+)?|[-+]?\.\d+/.exec(String(s).replace(/−/g, '-'));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
/** Direction of a formatted change ("+0.12", "-3.0", "0.00", "—"). */
export function dirOf(s: string | null | undefined): Dir {
  const n = parseNum(s);
  if (n === null || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}
/** Always signed, zero unsigned: +0.12 / -0.12 / 0.00; missing = em dash. */
export function signedFmt(v: number | null | undefined, d = 2, suffix = ''): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const t = Math.abs(v).toFixed(d);
  if (Number(t) === 0) return t + suffix;
  return (v > 0 ? '+' : '-') + t + suffix;
}
/** Price: #,##0.00; FX below 10 four decimals; crypto/large >= 1000 grouped with 2 (0 when >= 100k). */
export function price(v: number | null | undefined, kind: 'fx' | 'rate' | 'crypto' | 'num' = 'num'): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const d = kind === 'fx' && Math.abs(v) < 10 ? 4 : kind === 'crypto' && Math.abs(v) >= 1000 ? 0 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
/** "better when": lower for unemployment, inflation and jobless claims; higher otherwise. */
export const betterWhen = (title: string): 'higher' | 'lower' => (/unemploy|jobless|claims|\bcpi\b|inflation|hicp|\bppi\b|pce|price index/i.test(title) ? 'lower' : 'higher');
/** Beat/miss colour of an actual against its forecast (or previous); '' when either is missing. */
export function beatMiss(actual: string, forecast: string, better: 'higher' | 'lower' = 'higher'): Dir | '' {
  const a = parseNum(actual), f = parseNum(forecast);
  if (a === null || f === null) return '';
  if (a === f) return 'flat';
  return (a > f) === (better === 'higher') ? 'up' : 'down';
}
/** Sort rows by a column: numbers numerically, text lexically; 'none' keeps the source order. */
export function sortRows(rows: string[][], col: number, dir: 'asc' | 'desc' | 'none'): string[][] {
  if (dir === 'none' || col < 0) return rows;
  const k = (r: string[]) => parseNum(r[col]);
  const numeric = rows.every((r) => k(r) !== null || (r[col] ?? '') === DASH || (r[col] ?? '') === '');
  const out = rows.map((r, i) => [r, i] as const).sort(([a, ia], [b, ib]) => {
    let c: number;
    if (numeric) { const x = k(a), y = k(b); c = x === null ? (y === null ? 0 : 1) : y === null ? -1 : x - y; if (x !== null && y !== null && dir === 'desc') c = -c; }
    else { c = (a[col] ?? '').localeCompare(b[col] ?? ''); if (dir === 'desc') c = -c; }
    return c || ia - ib;
  });
  return out.map(([r]) => r);
}
/** Down-sample to at most n points, keeping the first and last. */
export function resample(v: number[], n = 20): number[] {
  if (v.length <= n) return v.slice();
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(v[Math.round((i * (v.length - 1)) / (n - 1))]);
  return out;
}
/** SVG path of a sparkline in a w x h box; '' for fewer than 2 points. */
export function sparkPath(values: number[], w: number, h: number, pad = 1): string {
  const v = resample(values.filter(Number.isFinite));
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  return v.map((y, i) => `${i ? 'L' : 'M'}${(pad + (i * (w - 2 * pad)) / (v.length - 1)).toFixed(1)},${(h - pad - ((y - lo) / span) * (h - 2 * pad)).toFixed(1)}`).join(' ');
}
export const sparkDir = (v: number[]): Dir => (v.length < 2 || v[v.length - 1] === v[0] ? 'flat' : v[v.length - 1] > v[0] ? 'up' : 'down');
/** Emoji flag of an ISO-2 country ("EA"/"EU" = the EU flag); '' when not two letters. */
export function flag(cc: string): string {
  const c = (cc === 'EA' ? 'EU' : cc).toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65, 0x1f1e6 + c.charCodeAt(1) - 65);
}
/** Heat fill weight in [-1, 1] for a change % clamped at +-scale. */
export const heat = (pct: number | null, scale = 3): number => (pct === null || !Number.isFinite(pct) ? 0 : Math.max(-1, Math.min(1, pct / scale)));

// 5.1 RefreshPolicy: cadence and stale threshold per source (ms).
const MIN = 60_000, H = 3_600_000;
const POLICY: [RegExp, number, number][] = [
  [/^(coinbase|kraken)$/, 15_000, MIN],
  [/^(cboe|stooq|finnhub)$/, MIN, 5 * MIN],
  [/^(frankfurter|nyfed|treasury_xml|ecb_data)$/, 5 * MIN, 30 * MIN],
  [/^(gdelt|polymarket)$/, 5 * MIN, 30 * MIN],
  [/^(forexfactory|central_banks|nasdaq_calendar)$/, 15 * MIN, 2 * H],
  [/^(fred|dbnomics|eia)$/, 30 * MIN, 6 * H],
  [/^(bls|eurostat|oecd|imf|worldbank|sec_edgar|sec_xbrl)$/, 6 * H, 48 * H],
];
export function refreshPolicy(sourceId: string): { everyMs: number; staleMs: number } {
  for (const [re, every, stale] of POLICY) if (re.test(sourceId)) return { everyMs: every, staleMs: stale };
  return { everyMs: 30 * MIN, staleMs: 6 * H };
}
/** +-10 % jitter so panels do not fire together; doubled per consecutive failure, max 10 min. */
export function nextDelay(everyMs: number, failures: number, rnd = Math.random()): number {
  const base = failures > 0 ? Math.min(everyMs * 2 ** failures, 10 * MIN) : everyMs;
  return Math.round(base * (0.9 + 0.2 * rnd));
}
export const isStale = (fetchedAt: number, now: number, sourceId: string) => now - fetchedAt > refreshPolicy(sourceId).staleMs;

// 2.10 search: local catalogue, prefix on symbol, substring on name, max 30.
export type SearchItem = { kind: 'EQ' | 'FX' | 'FI' | 'CR' | 'CO' | 'EV' | 'DB' | 'WL'; symbol: string; name: string; href: string };
export function search(items: SearchItem[], q: string, max = 30): SearchItem[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const score = (it: SearchItem) => { const s = it.symbol.toLowerCase(), n = it.name.toLowerCase(); return s === t ? 0 : s.startsWith(t) ? 1 : n.startsWith(t) ? 2 : n.includes(t) || s.includes(t) ? 3 : 9; };
  const seen = new Set<string>();
  return items.map((it) => [it, score(it)] as const).filter(([it, sc]) => sc < 9 && !seen.has(it.kind + it.symbol + it.href) && (seen.add(it.kind + it.symbol + it.href), true))
    .sort((a, b) => a[1] - b[1]).slice(0, max).map(([it]) => it);
}

/** A large answer kept in browser storage trimmed to its last `keep` observations (a DBnomics series is its whole history, ~0.5 MB, and the
 *  API has no observation limit): it then fits the storage quota and later visits within the TTL do not download it again. */
export function trimBody(body: string, keep = 400, min = 100_000): string {
  if (body.length < min) return body;
  try {
    const o = JSON.parse(body);
    const docs = o?.series?.docs;
    if (!Array.isArray(docs)) return body;
    for (const d of docs) for (const k of ['period', 'value', 'period_start_day', 'indexed_at']) if (Array.isArray(d[k])) d[k] = d[k].slice(-keep);
    return JSON.stringify(o);
  } catch { return body; }
}
/** A footer source name (#1370 shorter footers): the declared name without its parenthetical or " / " detail; each " + " part alike (FinFormat.shortSource). */
export const shortSource = (name: string): string => name.split(' + ').map((n) => n.split(' (')[0].split(' / ')[0].trim() || n.trim()).join(' + ');

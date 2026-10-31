import { describe, expect, it } from 'vitest';
import { trimBody, beatMiss, betterWhen, dirOf, flag, heat, isStale, nextDelay, parseNum, price, refreshPolicy, resample, search, signedFmt, sortRows, sparkDir, sparkPath, DASH } from './fin';

describe('FinFormat', () => {
  it('signs every change, zero unsigned, missing is the em dash (never a bare "-")', () => {
    expect(signedFmt(0.123)).toBe('+0.12');
    expect(signedFmt(-0.123)).toBe('-0.12');
    expect(signedFmt(0)).toBe('0.00');
    expect(signedFmt(-0.001)).toBe('0.00');
    expect(signedFmt(null)).toBe(DASH);
    expect(signedFmt(1.234, 2, '%')).toBe('+1.23%');
  });
  it('prices: FX under 10 has 4 decimals, crypto over 1000 none, else grouped 2', () => {
    expect(price(1.08423, 'fx')).toBe('1.0842');
    expect(price(157.25, 'fx')).toBe('157.25');
    expect(price(101234.6, 'crypto')).toBe('101,235');
    expect(price(6812.1)).toBe('6,812.10');
    expect(price(NaN)).toBe(DASH);
  });
  it('parses numbers in source strings and reads direction', () => {
    expect(parseNum('180K')).toBe(180);
    expect(parseNum('1,234.5')).toBe(1234.5);
    expect(parseNum('-0.3%')).toBe(-0.3);
    expect(parseNum('n/a')).toBeNull();
    expect(dirOf('+0.40')).toBe('up');
    expect(dirOf('-5.0')).toBe('down');
    expect(dirOf('0.00')).toBe('flat');
    expect(dirOf(DASH)).toBe('flat');
  });
});

describe('beat / miss', () => {
  it('higher is better by default; lower for unemployment, CPI, claims', () => {
    expect(betterWhen('Non-Farm Employment Change')).toBe('higher');
    expect(betterWhen('Unemployment Rate')).toBe('lower');
    expect(betterWhen('Core CPI m/m')).toBe('lower');
    expect(betterWhen('Unemployment Claims')).toBe('lower');
    expect(beatMiss('254K', '180K')).toBe('up');
    expect(beatMiss('150K', '180K')).toBe('down');
    expect(beatMiss('4.3%', '4.1%', 'lower')).toBe('down');
    expect(beatMiss('4.0%', '4.1%', 'lower')).toBe('up');
    expect(beatMiss('4.1%', '4.1%', 'lower')).toBe('flat');
    expect(beatMiss('', '4.1%')).toBe('');
  });
});

describe('sort', () => {
  const rows = [['b', '10', 'x'], ['a', '-2', 'y'], ['c', '3.5', 'z'], ['d', DASH, 'w']];
  it('numbers numerically (missing last), text lexically, none keeps the source order', () => {
    expect(sortRows(rows, 1, 'desc').map((r) => r[0])).toEqual(['b', 'c', 'a', 'd']);
    expect(sortRows(rows, 1, 'asc').map((r) => r[0])).toEqual(['a', 'c', 'b', 'd']);
    expect(sortRows(rows, 0, 'asc').map((r) => r[0])).toEqual(['a', 'b', 'c', 'd']);
    expect(sortRows(rows, 0, 'desc').map((r) => r[0])).toEqual(['d', 'c', 'b', 'a']);
    expect(sortRows(rows, 1, 'none')).toBe(rows);
  });
});

describe('sparkline', () => {
  it('resamples to 20 keeping both ends, draws a path, reads direction', () => {
    const v = Array.from({ length: 100 }, (_, i) => i);
    const r = resample(v);
    expect(r).toHaveLength(20);
    expect(r[0]).toBe(0);
    expect(r[19]).toBe(99);
    expect(sparkPath([1], 56, 20)).toBe('');
    expect(sparkPath([1, 2], 56, 20)).toBe('M1.0,19.0 L55.0,1.0');
    expect(sparkDir([3, 1, 4])).toBe('up');
    expect(sparkDir([3, 5, 2])).toBe('down');
    expect(sparkDir([3, 3])).toBe('flat');
  });
});

describe('flags and heat', () => {
  it('emoji flag from ISO-2, euro area = EU', () => {
    expect(flag('US')).toBe('\u{1F1FA}\u{1F1F8}');
    expect(flag('EA')).toBe('\u{1F1EA}\u{1F1FA}');
    expect(flag('USD')).toBe('');
  });
  it('heat clamps at the scale', () => {
    expect(heat(1.5)).toBe(0.5);
    expect(heat(-9)).toBe(-1);
    expect(heat(null)).toBe(0);
  });
});

describe('RefreshPolicy', () => {
  it('cadence per data type', () => {
    expect(refreshPolicy('coinbase').everyMs).toBe(15_000);
    expect(refreshPolicy('cboe').everyMs).toBe(60_000);
    expect(refreshPolicy('nyfed').everyMs).toBe(300_000);
    expect(refreshPolicy('forexfactory').everyMs).toBe(900_000);
    expect(refreshPolicy('bls').everyMs).toBe(21_600_000);
    expect(refreshPolicy('unknown').everyMs).toBe(1_800_000);
  });
  it('jitter +-10 %, backoff x2 per failure capped at 10 min', () => {
    expect(nextDelay(60_000, 0, 0)).toBe(54_000);
    expect(nextDelay(60_000, 0, 1)).toBe(66_000);
    expect(nextDelay(60_000, 1, 0.5)).toBe(120_000);
    expect(nextDelay(300_000, 3, 0.5)).toBe(600_000);
  });
  it('stale after the source threshold', () => {
    expect(isStale(0, 59_000, 'coinbase')).toBe(false);
    expect(isStale(0, 61_000, 'coinbase')).toBe(true);
    expect(isStale(0, 61_000, 'fred')).toBe(false);
  });
});

describe('search', () => {
  const items = [
    { kind: 'EQ' as const, symbol: '_SPX', name: 'S&P 500', href: '/q?s=_SPX' },
    { kind: 'FX' as const, symbol: 'EUR', name: 'Euro per USD', href: '/fx' },
    { kind: 'DB' as const, symbol: 'Yield Curves', name: 'FI dashboard', href: '/fi/yc' },
    { kind: 'CR' as const, symbol: 'BTC-USD', name: 'Bitcoin', href: '/cr' },
  ];
  it('exact, then symbol prefix, then name; empty query is nothing', () => {
    expect(search(items, 'eur').map((i) => i.symbol)).toEqual(['EUR']);
    expect(search(items, 'b').map((i) => i.symbol)).toEqual(['BTC-USD', 'Yield Curves']);
    expect(search(items, 'bitcoin').map((i) => i.symbol)).toEqual(['BTC-USD']);
    expect(search(items, 'yield').map((i) => i.symbol)).toEqual(['Yield Curves']);
    expect(search(items, '  ')).toEqual([]);
  });
});

describe('trimBody (DBnomics cache)', () => {
  it('keeps the last observations of a large series answer, leaves small or foreign bodies alone', () => {
    const n = 20_000;
    const big = JSON.stringify({ series: { docs: [{ series_code: 'X', period: Array.from({ length: n }, (_, i) => `p${i}`), value: Array.from({ length: n }, (_, i) => i) }] } });
    const t = JSON.parse(trimBody(big));
    expect(t.series.docs[0].period).toHaveLength(400);
    expect(t.series.docs[0].period[399]).toBe(`p${n - 1}`);
    expect(t.series.docs[0].value[0]).toBe(n - 400);
    expect(trimBody(big).length).toBeLessThan(big.length / 10);
    expect(trimBody('{"a":1}')).toBe('{"a":1}');
    const other = JSON.stringify({ x: 'y'.repeat(200_000) });
    expect(trimBody(other)).toBe(other);
  });
});

describe('shortSource (#1370 shorter footers)', () => {
  it('drops the parenthetical and the " / " detail, part by part', async () => {
    const { shortSource } = await import('./fin');
    expect(shortSource('Cloud-Fincept / fin_api (private mesh)')).toBe('Cloud-Fincept');
    expect(shortSource('US Treasury par yield curve (XML)')).toBe('US Treasury par yield curve');
    expect(shortSource('FRED (St. Louis Fed) + Cloud-Fincept / fin_api (private mesh)')).toBe('FRED + Cloud-Fincept');
    expect(shortSource('Eurostat')).toBe('Eurostat');
  });
});

describe('calendar window chips (#1370)', () => {
  it('All keeps everything, Today the date, This week Monday to Sunday', async () => {
    const { inCalWindow } = await import('./fin');
    const today = '2026-10-29'; // a Thursday
    expect(inCalWindow('2026-12-01 08:30', 0, today)).toBe(true);
    expect(inCalWindow('2026-10-29 14:00', 1, today)).toBe(true);
    expect(inCalWindow('2026-10-30 14:00', 1, today)).toBe(false);
    expect(inCalWindow('2026-10-26', 2, today)).toBe(true);
    expect(inCalWindow('2026-11-01 23:00', 2, today)).toBe(true);
    expect(inCalWindow('2026-10-25 23:00', 2, today)).toBe(false);
    expect(inCalWindow('2026-11-02 00:00', 2, today)).toBe(false);
  });
});

describe('Credit/Macro better_when colouring (#1370)', () => {
  it('flips the colour where lower is better; the declaration wins', async () => {
    const { lowerBetter, tone } = await import('./fin');
    expect(lowerBetter(undefined, 'US Unemployment rate')).toBe(true);
    expect(lowerBetter(undefined, 'ICE BofA US HY OAS')).toBe(true);
    expect(lowerBetter(undefined, 'S&P 500')).toBe(false);
    expect(lowerBetter('lower', 'S&P 500')).toBe(true);
    expect(lowerBetter('higher', 'CPI YoY')).toBe(false);
    expect(tone('up', true)).toBe('down');
    expect(tone('down', true)).toBe('up');
    expect(tone('up', false)).toBe('up');
    expect(tone('flat', true)).toBe('flat');
  });
});


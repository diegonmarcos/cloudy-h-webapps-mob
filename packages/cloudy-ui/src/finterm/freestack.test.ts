import { describe, expect, it } from 'vitest';
import finterm from '../../nav/finterm.json';
import { freeRows, rateText, state, type FreeStackDecl } from './freestack';

const fs = (finterm as unknown as { free_stack: FreeStackDecl }).free_stack;
const src = (id: string) => fs.sources.find((s) => s.id === id)!;

describe('FinTerm About > Data sources (#1416)', () => {
  it('mirrors the five declared sources with a generic contact', () => {
    expect(fs.sources.map((s) => s.id)).toEqual(['fred', 'openfigi', 'fmp', 'sec_edgar', 'yahoo']);
    expect(fs.contact).toMatch(/^admin@/);
  });
  it('a keyed source without its key needs one, with the declared reason', () => {
    expect(state(src('fmp'), false)).toBe('needs_key');
    expect(state(src('fmp'), true)).toBe('ready');
    const r = freeRows(fs).find((x) => x.id === 'fmp')!;
    expect(r.status).toBe('needs_key');
    expect(r.reason).toMatch(/^FMP needs a free API key/);
    expect(r.key).toBe('free key');
    expect(freeRows(fs, () => true).find((x) => x.id === 'fmp')!.status).toBe('ready');
  });
  it('Yahoo is off by default and the last fallback', () => {
    const r = freeRows(fs).find((x) => x.id === 'yahoo')!;
    expect(r.status).toBe('flag_off');
    expect(r.reason).toBe('feature flag FINTERM_YAHOO is off; last fallback after cboe, fred, coinbase');
    expect(state(src('yahoo'), true, true)).toBe('ready');
  });
  it('shows each declared rate limit', () => {
    expect(rateText(src('sec_edgar'))).toBe('10/s');
    expect(rateText(src('fmp'))).toBe('5/min, 250/day');
    expect(rateText({ per_min: 0 })).toBe('0/min');
    expect(freeRows(fs).find((x) => x.id === 'fred')!.status).toBe('ready');
  });
});

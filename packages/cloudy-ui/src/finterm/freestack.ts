// #1416 the web mirror of FinTerm's About > Data sources: the free, non-real-time stack declared in the Android app's universe.json
// free_stack (GENERATED into finterm.json by scripts/gen-finterm.mjs). The same rules as the APK (FreeStack.kt) and the container
// (freestack.rs): a keyed source without its key needs one (with the declared reason), a flagged source is off unless its flag is on.
// The web holds no key: a keyed source shows what the container needs from the fleet secret store.
export type FreeSource = {
  id: string; name: string; coverage: string; licence: string; terms: string; per_min: number; per_day?: number;
  key?: { env: string; slot: string; header: string; signup: string; reason: string } | null;
  flag?: { env: string; default: boolean; after: string[] } | null;
};
export type FreeStackDecl = { contact: string; route: string; sources: FreeSource[] };
export type FreeState = 'ready' | 'needs_key' | 'flag_off';
export type FreeRow = { id: string; name: string; coverage: string; licence: string; terms: string; rate: string; key: string; status: FreeState; reason: string };

export function rateText(s: Pick<FreeSource, 'per_min' | 'per_day'>): string {
  const r = s.per_min > 0 && s.per_min % 60 === 0 ? `${s.per_min / 60}/s` : `${s.per_min}/min`;
  return s.per_day ? `${r}, ${s.per_day}/day` : r;
}

export function state(s: FreeSource, hasKey: boolean, flagOn: boolean = s.flag?.default ?? false): FreeState {
  if (s.key && !hasKey) return 'needs_key';
  if (s.flag && !flagOn) return 'flag_off';
  return 'ready';
}

export function freeRows(fs: FreeStackDecl, hasKey: (slot: string) => boolean = () => false): FreeRow[] {
  return fs.sources.map((s) => {
    const st = state(s, s.key ? hasKey(s.key.slot) : true);
    const reason = st === 'needs_key' ? s.key!.reason : st === 'flag_off' ? `feature flag ${s.flag!.env} is off; last fallback after ${s.flag!.after.join(', ')}` : '';
    return { id: s.id, name: s.name, coverage: s.coverage, licence: s.licence, terms: s.terms, rate: rateText(s), key: s.key ? 'free key' : 'no key', status: st, reason };
  });
}

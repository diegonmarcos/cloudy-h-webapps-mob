<script lang="ts">
  // One FinTerm dashboard on the web (#1342, terminal UI per the FinTerm UI spec): flat dark canvas, ticker tape, KPI tiles, monitor rows with
  // sparklines, chart cards with gridlines and crosshair, sortable tables, the calendar with importance and beat/miss, global search ("/"),
  // quote detail, per-source auto refresh ("R" refreshes all), skeletons, stale badges, one footer line per panel with the source attribution.
  // A panel with no browser route is one compact row saying why; when this browser once read it through the FinTerminal server, the last good copy shows, marked stale.
  import { onMount, onDestroy } from 'svelte';
  import './components/fin.css';
  import { FINTERM, sourceOf } from './catalog';
  import { alertRule, alertSymbol, alloc, drawOrder, failureFor, loadPanel, placeholderFor, ruleText, FetchError, type AlertRule, type Ctx, type Dashboard, type Panel, type PanelData, type Placeholder, type UserLists } from './engine';
  import { trimBody, betterWhen, beatMiss, dirOf, isStale, nextDelay, parseNum, refreshPolicy, signedFmt, DASH, type SearchItem } from './fin';
  import Skel from './components/Skel.svelte';
  import FinFooter from './components/FinFooter.svelte';
  import FinKeyRow from './components/FinKeyRow.svelte';
  import FinKpi, { type Kpi } from './components/FinKpi.svelte';
  import FinRows, { type Row } from './components/FinRows.svelte';
  import FinHeat from './components/FinHeat.svelte';
  import FinTable from './components/FinTable.svelte';
  import FinChart from './components/FinChart.svelte';
  import FinCalendar from './components/FinCalendar.svelte';
  import FinTape, { type TapeItem } from './components/FinTape.svelte';
  import type { Quote } from './components/FinQuote.svelte';
  import FinNews from './components/FinNews.svelte';

  let { dash }: { dash: Dashboard } = $props();
  type State = { phase: 'loading' } | { phase: 'data'; data: PanelData; at: number; stale: boolean; lastGood?: boolean } | { phase: 'placeholder'; ph: Placeholder };
  let states = $state<Record<string, State>>({});
  let flashes = $state<Record<string, Record<number, string>>>({});
  let now = $state(Date.now());
  const today = () => new Date().toISOString().slice(0, 10);

  const net = async (url: string): Promise<string> => {
    let r: Response;
    try { r = await fetch(url, { signal: AbortSignal.timeout(12000) }); } catch (e) { throw new FetchError('blocked', e instanceof Error ? e.message : 'blocked'); }
    if (!r.ok) throw new FetchError('http', `HTTP ${r.status}`, r.status);
    return r.text();
  };
  // Each answer is kept in this browser for its source's declared schedule.ttl_s, and the last good copy answers when the source fails (the panel
  // then says it is stale). A large answer (a DBnomics series is the whole history, ~0.5 MB; its API has no observation limit) is kept trimmed to
  // its last 400 observations, so it fits the storage quota and later visits do not download it again within the TTL.
  const ttlOf = (url: string) => (FINTERM.sources.find((s) => s.endpoint && url.startsWith(s.endpoint))?.schedule?.ttl_s ?? 60) * 1000;
  const store = (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
  type Run = { stale: Set<string>; oldest: number; force: boolean };
  const getFor = (run: Run) => async (url: string): Promise<string> => {
    if (url.startsWith('asset:')) {
      const doc = FINTERM.declared?.[url.slice(6)];
      if (doc === undefined) throw new FetchError('http', 'not declared');
      return JSON.stringify(doc);
    }
    const key = `finterm.cache:${url}`;
    const hit = store(key) as { at: number; body: string } | null;
    if (!run.force && hit && Date.now() - hit.at < ttlOf(url)) { run.oldest = Math.min(run.oldest, hit.at); return hit.body; }
    try {
      const body = trimBody(await net(url));
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), body })); } catch { /* full storage: serve without keeping */ }
      return body;
    } catch (e) {
      if (!hit) throw e;
      run.stale.add(new Date(hit.at).toISOString().slice(0, 16).replace('T', ' '));
      run.oldest = Math.min(run.oldest, hit.at);
      return hit.body;
    }
  };
  // the watchlist and alert rules of this browser; nothing leaves the page
  const loadUser = (): UserLists => ({
    watchlist: ((store('finterm.watchlist') ?? []) as string[]).map(alertSymbol).filter((x): x is string => !!x),
    alerts: ((store('finterm.alerts') ?? []) as string[]).map(alertRule).filter((x): x is AlertRule => !!x),
  });
  let user = $state<UserLists>({ watchlist: [], alerts: [] });
  let stars = $state<string[]>([]);
  const watched = $derived(new Set([...user.watchlist, ...stars]));
  let entry = $state('');
  let entryBad = $state(false);
  const hasUserLists = dash.panels.some((p) => p.fetch?.each_user || p.alerts);
  function saveUser(next: UserLists) {
    user = next;
    localStorage.setItem('finterm.watchlist', JSON.stringify(next.watchlist));
    localStorage.setItem('finterm.alerts', JSON.stringify(next.alerts.map(ruleText)));
    loadAll(true);
  }
  function addEntry() {
    const r = alertRule(entry); const sym = r ? null : alertSymbol(entry);
    if (r) saveUser({ ...user, alerts: [...user.alerts.filter((x) => ruleText(x) !== ruleText(r)), r] });
    else if (sym) saveUser({ ...user, watchlist: [...user.watchlist.filter((x) => x !== sym), sym] });
    else { entryBad = true; return; }
    entry = ''; entryBad = false;
  }
  // a star on any row: instruments of any asset class are kept in finterm.stars; tradable symbols also join the watchlist the engine quotes
  function toggleStar(sym: string) {
    const on = watched.has(sym);
    stars = on ? stars.filter((s) => s !== sym) : [...stars, sym];
    localStorage.setItem('finterm.stars', JSON.stringify(stars));
    const t = alertSymbol(sym);
    if (t && (on ? user.watchlist.includes(t) : !user.watchlist.includes(t)) && /^[A-Z_^.]{1,12}$/.test(sym)) saveUser({ ...user, watchlist: on ? user.watchlist.filter((x) => x !== t) : [...user.watchlist, t] });
  }
  let meshUp: Promise<boolean> | null = null;
  const reachable = (url: string) => (meshUp ??= fetch(url, { signal: AbortSignal.timeout(2500) }).then((r) => r.ok, () => false));

  const lastGoodKey = (p: Panel) => `finterm.panel:${dash.id}:${p.id}`;
  const fails: Record<string, number> = {};
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  function flashRows(id: string, before: PanelData | undefined, after: PanelData) {
    if (!before) return;
    const f: Record<number, string> = {};
    after.rows.forEach((r, i) => { const o = before.rows[i]; if (!o || o[0] !== r[0] || o[1] === r[1]) return; const a = parseNum(r[1]), b = parseNum(o[1]); if (a !== null && b !== null && a !== b) f[i] = a > b ? 'flash-up' : 'flash-down'; });
    if (!Object.keys(f).length) return;
    flashes[id] = f; setTimeout(() => { flashes[id] = {}; }, 750);
  }
  function loadOne(p: Panel, force: boolean) {
    clearTimeout(timers[p.id]);
    if (p.view === 'alloc' && dash.model_portfolio) { states[p.id] = { phase: 'data', data: alloc(p, dash.model_portfolio.legs), at: Date.now(), stale: false }; return; }
    if (!p.fetch) { states[p.id] = { phase: 'placeholder', ph: placeholderFor(p, FINTERM.sources) }; return; }
    const prev = states[p.id];
    if (!prev) states[p.id] = { phase: 'loading' };
    const run: Run = { stale: new Set(), oldest: Date.now(), force };
    const ctx: Ctx = { get: getFor(run), today: today(), sources: FINTERM.sources, mesh: FINTERM.mesh, reachable, user, nowUtc: new Date().toISOString().slice(0, 16) + 'Z' };
    loadPanel(p, dash, ctx).then(
      (data) => {
        fails[p.id] = 0;
        const stale = run.stale.size > 0;
        const d = stale ? { ...data, note: [data.note, `The source did not answer; last good copy of ${[...run.stale].sort()[0]} UTC.`].filter(Boolean).join(' ') } : data;
        flashRows(p.id, prev?.phase === 'data' ? prev.data : undefined, d);
        states[p.id] = { phase: 'data', data: d, at: run.oldest, stale };
        if (!stale) try { localStorage.setItem(lastGoodKey(p), JSON.stringify({ at: run.oldest, data: d })); } catch { /* quota */ }
      },
      (e) => {
        fails[p.id] = (fails[p.id] ?? 0) + 1;
        if (prev?.phase === 'data') { states[p.id] = { ...prev, stale: true }; return; }
        const ph = failureFor(p, FINTERM.sources, e);
        const lg = store(lastGoodKey(p)) as { at: number; data: PanelData } | null;
        if (lg?.data && (ph.reason === 'blocked' || ph.reason === 'error')) {
          states[p.id] = { phase: 'data', data: { ...lg.data, note: `Via your FinTerminal server: last good copy; ${ph.note}` }, at: lg.at, stale: true, lastGood: true };
          return;
        }
        states[p.id] = { phase: 'placeholder', ph };
      },
    ).finally(() => {
      // auto refresh at the source's cadence (jittered, backed off after failures); only for panels that can be read at all
      const s = states[p.id];
      if (s?.phase === 'placeholder' && s.ph.reason !== 'error') return;
      timers[p.id] = setTimeout(() => { if (document.hidden) { pending.add(p.id); return; } loadOne(p, false); }, nextDelay(refreshPolicy(p.source).everyMs, fails[p.id] ?? 0));
    });
  }
  const pending = new Set<string>();
  let refreshedAt = $state('');
  function loadAll(force = false) {
    for (const p of dash.panels) loadOne(p, force);
    refreshedAt = new Date().toTimeString().slice(0, 5);
  }
  let root = $state('');
  let searchOpen = $state(false);
  let quote = $state<Quote | null>(null);
  let usedSearch = false, usedQuote = false; // sticky, plain lets: set once, read only through the deriveds below
  const searchUsed = $derived.by(() => { if (searchOpen) usedSearch = true; return usedSearch; });
  const quoteUsed = $derived.by(() => { if (quote) usedQuote = true; return usedQuote; });
  let clock: ReturnType<typeof setInterval>;
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === '/') { e.preventDefault(); searchOpen = true; }
    else if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) loadAll(true);
  };
  const onVis = () => { if (!document.hidden) { for (const id of pending) { const p = dash.panels.find((x) => x.id === id); if (p) loadOne(p, false); } pending.clear(); } };
  onMount(() => {
    root = location.pathname.replace(new RegExp(`${dash.tab}/${dash.slug}/?$`, 'i'), '');
    user = loadUser();
    stars = (store('finterm.stars') ?? []) as string[];
    loadAll();
    clock = setInterval(() => (now = Date.now()), 30_000);
    addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    const s = new URLSearchParams(location.search).get('s');
    if (s) pendingOpen = s;
  });
  onDestroy(() => { for (const t of Object.values(timers)) clearTimeout(t); clearInterval(clock); if (typeof window !== 'undefined') { removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); } });

  // ---------- view models ----------
  const attribution = (p: Panel) => { const s = sourceOf(p.source); return s ? { name: s.name, docs: s.docs ?? '' } : { name: p.source, docs: '' }; };
  const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5);
  const footState = (st: State): 'fresh' | 'stale' | 'error' | 'none' => (st.phase !== 'data' ? 'none' : st.lastGood ? 'error' : st.stale || isStale(st.at, now, '') && false ? 'stale' : 'fresh');
  const staleOf = (p: Panel, st: State) => st.phase === 'data' && (st.stale || isStale(st.at, now, p.source));
  // UI spec 6.3: a quotes panel declares how it is drawn (`display`: kpi | rows | heat), the same declaration the APK reads.
  const isKpi = (p: Panel) => p.view === 'quotes' && (p.display ? p.display === 'kpi' : p.change_unit === 'bp' || p.unit === '%');
  const isHeat = (p: Panel) => p.view === 'quotes' && (p.display ? p.display === 'heat' : dash.id === 'market_monitor' && p.source === 'frankfurter');
  const assetOf = (p: Panel): SearchItem['kind'] => (/coinbase|kraken/.test(p.source) ? 'CR' : /frankfurter|fx/.test(p.source + p.id + dash.id) ? 'FX' : /cboe|equity|stooq|sec/.test(p.source + dash.id) ? 'EQ' : /energy|commod|eia/.test(p.id + dash.id) ? 'CO' : /calendar|forexfactory/.test(p.source + dash.id) ? 'EV' : 'FI');
  const short = (s: string) => s.replace(/ per USD$/, '').replace(/^UST /, 'UST');
  function rowsOf(p: Panel, d: PanelData): Row[] {
    return d.rows.map((r, i) => ({ sym: short(r[0] ?? ''), name: r[0] ?? '', last: r[1] ?? DASH, chg: r[2] ?? DASH, pct: r[3] ?? DASH, spark: d.spark?.[i] ?? null, flash: flashes[p.id]?.[i] }));
  }
  function kpisOf(p: Panel, d: PanelData): Kpi[] {
    const unit = p.change_unit === 'bp' ? 'bp' : '';
    const t: Kpi[] = d.rows.map((r, i) => ({ label: r[0] ?? '', value: r[1] ?? DASH, chg: r[2] ?? '', unit, asOf: r[4] ?? r[3] ?? '', spark: d.spark?.[i] ?? null, flash: flashes[p.id]?.[i] }));
    // the 2s10s spread (UI spec 3.1, derive: spread): 10Y minus 2Y in bp, its change from the two tiles' changes
    const two = d.rows.findIndex((r) => /2Y$/.test(r[0] ?? '')), ten = d.rows.findIndex((r) => /10Y$/.test(r[0] ?? ''));
    if (two >= 0 && ten >= 0) {
      const a = parseNum(d.rows[ten][1]), b = parseNum(d.rows[two][1]);
      const ca = parseNum(d.rows[ten][2]), cb = parseNum(d.rows[two][2]);
      const hs = d.spark?.[ten] && d.spark?.[two] && d.spark[ten]!.length === d.spark[two]!.length ? d.spark[ten]!.map((v, k) => (v - d.spark![two]![k]) * 100) : null;
      if (a !== null && b !== null) t.push({ label: '2s10s', value: signedFmt((a - b) * 100, 0), chg: ca !== null && cb !== null ? signedFmt(ca - cb, 1) : '', unit: 'bp', asOf: d.rows[ten][4] ?? '', spark: hs });
    }
    return t;
  }
  const curvePrev = (d: PanelData): number[] | null => {
    const j = d.columns.findIndex((c) => /bp/i.test(c));
    if (j < 0 || d.rows.length !== d.chart.length) return null;
    const pv = d.rows.map((r, i) => { const c = parseNum(r[j]); return c === null ? NaN : d.chart[i].y - c / 100; });
    return pv.every(Number.isFinite) ? pv : null;
  };
  const tape = $derived.by((): TapeItem[] => {
    const out: TapeItem[] = [];
    // UI spec 2.1: the tape carries the panels that declare `tape` (any quotes panel when a dashboard declares none)
    const declared = dash.panels.some((p) => p.tape);
    const miss = (v?: string) => !v || v === DASH || v === '-';
    for (const p of dash.panels) {
      const st = states[p.id];
      if (p.view !== 'quotes' || st?.phase !== 'data' || (declared && !p.tape)) continue;
      for (const r of st.data.rows) out.push({ sym: short(r[0] ?? ''), last: r[1] ?? DASH, pct: p.change_unit === 'bp' ? (miss(r[2]) ? DASH : `${r[2]} bp`) : !miss(r[3]) ? r[3]! : miss(r[2]) ? DASH : r[2]! });
    }
    return out.slice(0, 12);
  });
  const tapeStale = $derived(dash.panels.some((p) => p.view === 'quotes' && staleOf(p, states[p.id] ?? { phase: 'loading' })));
  function openQuote(p: Panel, d: PanelData, i: number) {
    const r = d.rows[i]; if (!r) return;
    quote = { sym: short(r[0] ?? ''), name: r[0] ?? '', last: r[1] ?? DASH, chg: r[2] ?? DASH, pct: p.view === 'quotes' ? r[3] ?? DASH : DASH, asOf: r[4] ?? d.asOf, source: attribution(p).name, unit: '', hist: d.spark?.[i] ?? null };
  }
  function openSym(sym: string) {
    for (const p of dash.panels) { const st = states[p.id]; if (st?.phase !== 'data') continue; const i = st.data.rows.findIndex((r) => short(r[0] ?? '') === sym || r[0] === sym); if (i >= 0) { openQuote(p, st.data, i); return true; } }
    return false;
  }
  let pendingOpen = $state('');
  $effect(() => { if (pendingOpen && openSym(pendingOpen)) pendingOpen = ''; });
  // search catalogue: every dashboard, every symbol a panel declares, the watchlist
  const catalogue = $derived.by((): SearchItem[] => {
    if (!root) return [];
    const items: SearchItem[] = [];
    for (const d of FINTERM.dashboards) {
      const href = `${root}${d.tab}/${d.slug}/`;
      items.push({ kind: 'DB', symbol: d.entry, name: `${d.tab.toUpperCase()} dashboard`, href });
      for (const p of d.panels) {
        const f = (p.fetch ?? {}) as { labels?: Record<string, string>; each?: string[]; series?: { id: string; label: string }[] };
        const names = [...Object.values(f.labels ?? {}), ...(f.each ?? []).filter((e) => !f.labels?.[e]), ...(f.series ?? []).map((s) => `${s.label}`)];
        for (const n of names) items.push({ kind: assetOf({ ...p, id: p.id } as Panel), symbol: short(n), name: `${n} · ${d.entry}`, href: `${href}?s=${encodeURIComponent(short(n))}` });
      }
    }
    for (const w of [...user.watchlist, ...stars]) items.push({ kind: 'WL', symbol: w, name: 'Watchlist', href: `${root}eq/watchlist/?s=${encodeURIComponent(w)}` });
    return items;
  });
  function pick(it: SearchItem) {
    const u = new URL(it.href, location.href);
    if (u.pathname === location.pathname) { const s = u.searchParams.get('s'); if (s && !openSym(s)) pendingOpen = s; return; }
    location.href = it.href;
  }
  const keyHref = $derived(`${root}config/`);
  let minImp = $state(0);
  const actualBeat = (p: Panel) => (r: string[], j: number) => (p.value_columns === 'actual_previous' && j === 1 ? beatMiss(r[1] ?? '', r[2] ?? '', betterWhen(r[0] ?? '')) : '');
</script>

<div class="fin dash" data-testid="finterm-dash" data-dash={dash.id}>
  <div class="bar">
    <button type="button" class="sbtn" onclick={() => (searchOpen = true)} data-testid="fin-search-open" aria-label="Search symbols and dashboards"><span aria-hidden="true">⌕</span><span>Search symbols, pairs, dashboards</span><kbd>/</kbd></button>
    <button type="button" class="rbtn" onclick={() => loadAll(true)} title="Refresh all (R)" aria-label="Refresh all"><span aria-hidden="true">↻</span>{#if refreshedAt}<span class="cap num">{refreshedAt}</span>{/if}</button>
  </div>
  {#if tape.length}<FinTape items={tape} stale={tapeStale} onOpen={(s) => openSym(s)} />{/if}
  {#if hasUserLists}
    <section class="panel" data-testid="finterm-userlists">
      <div class="th"><h3>My symbols &amp; alerts</h3><span class="cap">kept in this browser</span></div>
      <form class="add" onsubmit={(e) => { e.preventDefault(); addEntry(); }}>
        <input bind:value={entry} placeholder="Add symbol or rule: AAPL, _SPX, AAPL > 230, events >= 3" aria-label="Symbol or rule" data-testid="finterm-entry" />
        <button type="submit">Add</button>
      </form>
      {#if entryBad}<p class="cap bad">Not a symbol or a rule.</p>{/if}
      {#if user.watchlist.length || user.alerts.length || stars.length}
        <div class="chips">
          {#each [...new Set([...user.watchlist, ...stars])] as w}<button class="chip" onclick={() => (user.watchlist.includes(w) ? saveUser({ ...user, watchlist: user.watchlist.filter((x) => x !== w) }) : toggleStar(w))}><span class="sym">{w}</span> ×</button>{/each}
          {#each user.alerts as r}<button class="chip al" onclick={() => saveUser({ ...user, alerts: user.alerts.filter((x) => ruleText(x) !== ruleText(r)) })}>🔔 {ruleText(r)} ×</button>{/each}
        </div>
      {:else}
        <p class="cap">No symbols yet. Add one above, or tap ☆ on any row of any dashboard.</p>
      {/if}
    </section>
  {/if}
  {#each drawOrder(dash.panels) as p (p.id)}
    {@const st = states[p.id] ?? { phase: 'loading' }}
    {@const at = attribution(p)}
    {@const ph = st.phase === 'placeholder'}
    <section class="panel" class:key={ph} data-testid="finterm-panel" data-panel={p.id} data-state={ph ? `placeholder-${st.ph.reason}` : st.phase}>
      {#if st.phase === 'placeholder'}
        <FinKeyRow title={p.title} reason={st.ph.reason} note={st.ph.reason === 'blocked' ? `Via your FinTerminal server. ${st.ph.note}` : st.ph.note} href={keyHref} />
        <span class="cap ka" data-testid="finterm-attr">{at.name}</span>
      {:else}
        <div class="th"><h3>{p.title}</h3>{#if staleOf(p, st)}<span class="clk" title="Stale: last fetched {st.phase === 'data' ? hhmm(st.at) : ''}" data-testid="fin-stale">◷</span>{/if}</div>
        {#if st.phase === 'loading'}
          <div class="skel" aria-busy="true">
            {#if p.view === 'quotes'}{#each [0, 1, 2, 3] as _}<div class="sr"><Skel w={88} /><Skel w={56} h={16} /><Skel w={64} /><Skel w={56} /></div>{/each}
            {:else if p.view === 'curve' || p.view === 'candles'}<Skel h={200} r={8} />
            {:else}{#each [0, 1, 2, 3, 4] as _}<div class="sr"><Skel w="40%" /><Skel w={56} /><Skel w={56} /></div>{/each}{/if}
          </div>
          <div class="cap ftl" data-testid="finterm-attr">{at.name}</div>
        {:else}
          {@const d = st.data}
          {#each d.alerts ?? [] as a}<p class="alert" data-testid="finterm-alert">🔔 {a}</p>{/each}
          {#if p.view === 'quotes'}
            {#if isHeat(p)}
              <div data-testid="finterm-quotes"><FinHeat tiles={d.rows.map((r) => ({ sym: short(r[0] ?? ''), last: r[1] ?? '', pct: r[3] ?? DASH }))} scale={p.heat_scale ?? 1} onOpen={(i) => openQuote(p, d, i)} /><span class="sr-only">{d.rows.map((r) => r[0]).join(', ')}</span></div>
            {:else if isKpi(p)}
              <FinKpi tiles={kpisOf(p, d)} onOpen={(i) => openQuote(p, d, i)} />
            {:else}
              <FinRows rows={rowsOf(p, d)} {watched} onOpen={(i) => openQuote(p, d, i)} onStar={toggleStar} />
            {/if}
          {:else if p.view === 'calendar'}
            <div class="fchips" role="group" aria-label="Importance">{#each [[0, 'All'], [2, '●● and up'], [3, '●●● only']] as [v, l]}<button type="button" class="chip" class:sel={minImp === v} onclick={() => (minImp = v as number)}>{l}</button>{/each}</div>
            <FinCalendar rows={d.rows} columns={d.columns} {minImp} />
          {:else if p.view === 'news'}
            <FinNews rows={d.rows} links={d.links} />
          {:else}
            {#if d.chart.length && (p.view === 'curve' || p.view === 'candles')}
              <FinChart points={d.chart} kind="line" title={p.title} prev={p.view === 'curve' ? curvePrev(d) : null} unit={p.unit === '%' ? '%' : ''} even={p.view === 'curve'} />
            {:else if d.chart.length && (p.view === 'bars' || p.view === 'alloc')}
              <FinChart points={d.chart} kind="bars" title={p.title} unit={p.view === 'alloc' ? '%' : ''} />
            {/if}
            {#if d.rows.length}
              {#if p.view === 'bars' || p.view === 'alloc'}
                <details class="tbl"><summary class="cap">Table ({d.rows.length})</summary><FinTable columns={d.columns} rows={d.rows} links={d.links} limit={50} /></details>
              {:else}
                <FinTable columns={d.columns} rows={d.rows} links={d.links} details={d.details ?? []} beat={actualBeat(p)} />
              {/if}
            {/if}
          {/if}
          {#if d.note && !(p.view === 'calendar' && !d.rows.length)}<p class="nt cap"><span class="ad"></span>{d.note}</p>{/if}
          <FinFooter state={footState(st)} fetched={hhmm(st.at)} asOf={d.asOf} name={at.name} docs={at.docs} via={d.servedBy && d.servedBy !== at.name ? d.servedBy : ''} onRefresh={() => loadOne(p, true)} />
        {/if}
      {/if}
    </section>
  {/each}
  <p class="cap src">Data: {[...new Set(dash.panels.map((p) => attribution(p).name))].join(' · ')}. Delayed or end-of-day; not investment advice. Auto refresh per source; press R to refresh, / to search.</p>
</div>
<!-- search and the quote card are overlays, not first paint: lazy chunks mounted on first use, kept mounted after -->
{#if searchUsed}{#await import('./components/FinSearch.svelte') then m}<m.default items={catalogue} bind:open={searchOpen} onPick={pick} />{/await}{/if}
{#if quoteUsed}{#await import('./components/FinQuote.svelte') then m}<m.default bind:q={quote} {watched} onStar={toggleStar} />{/await}{/if}

<style>
  .dash { padding: 8px 12px 96px; display: flex; flex-direction: column; gap: 8px; background: var(--fin-canvas); min-height: 100%; box-sizing: border-box; }
  .bar { display: flex; gap: 8px; }
  .sbtn { all: unset; box-sizing: border-box; cursor: text; flex: 1; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 10px; background: var(--fin-raised); color: var(--fin-text2); font: 400 13px var(--fin-sans); }
  .sbtn kbd { margin-left: auto; font: 500 10px var(--fin-mono); border: 1px solid var(--fin-hairline); border-radius: 4px; padding: 1px 5px; }
  .rbtn { all: unset; cursor: pointer; display: flex; align-items: center; gap: 4px; height: 36px; padding: 0 10px; border-radius: 10px; background: var(--fin-raised); color: var(--fin-text2); font-size: 15px; }
  .panel { border-radius: 12px; background: var(--fin-surface); border: 1px solid var(--fin-hairline); padding: 10px 12px 6px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .panel.key { order: 1; padding: 0 12px; gap: 0; background: transparent; }
  .ka { display: none; }
  .th { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 20px; }
  h3 { margin: 0; font: 600 13px/18px var(--fin-sans); letter-spacing: .3px; text-transform: uppercase; color: var(--fin-text); }
  .clk { color: var(--fin-amber); font-size: 15px; }
  .skel { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
  .sr { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .ftl { min-height: 24px; line-height: 24px; }
  .nt { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--fin-text2); }
  .ad { width: 6px; height: 6px; border-radius: 50%; background: var(--fin-amber); flex: none; }
  .alert { margin: 0; color: var(--fin-amber); font: 600 12px var(--fin-sans); }
  .bad { color: var(--fin-down); margin: 0; }
  .add { display: flex; gap: 6px; }
  .add input { flex: 1; min-width: 0; height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--fin-hairline); background: var(--fin-raised); color: var(--fin-text); font: 400 13px var(--fin-sans); }
  .add button { border: 0; background: var(--fin-accent); color: var(--fin-canvas); border-radius: 8px; padding: 0 14px; font: 600 13px var(--fin-sans); cursor: pointer; }
  .chips, .fchips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border: 1px solid var(--fin-hairline); background: transparent; color: var(--fin-text); border-radius: 8px; height: 28px; padding: 0 10px; cursor: pointer; font: 500 12px var(--fin-sans); }
  .chip.sel { border-color: var(--fin-accent); color: var(--fin-accent); background: color-mix(in srgb, var(--fin-accent) 20%, transparent); }
  .chip.al { color: var(--fin-amber); }
  details.tbl summary { cursor: pointer; color: var(--fin-text2); }
  .src { margin: 4px 2px 0; order: 2; color: var(--fin-text3); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>

<script lang="ts">
  // #1539 a CB sub-page: the central-bank macro table as the dense FinMatrix, like the APK's CbPage. Countries x the group's indicators (or the inverse), the World / DM / EM aggregates on the
  // first rows (GDP-weighted, PPP or market FX), a simple or full indicator list, a forecast-year selector, heat against each country's own history, and a tap on a country opens its
  // detail with a sparkline and the source and vintage of every value. All words, countries and indicators come from finterm-cb.json (generated); the data loads on first open.
  import FinMatrix from './components/FinMatrix.svelte';
  import { at, Cb, transpose, fmt, isForecast, WORLD, type CbData, type Table } from './cb';
  import cbUrl from '../../nav/finterm-cb.json?url';
  let { view }: { view: string } = $props();
  let cb = $state<Cb | null>(null);
  let failed = $state(false);
  // the half-megabyte snapshot ships in the build as a hashed static asset (?url), not as a JS chunk: it stays out of the lazy-chunk budget and is read from the same origin on first open
  $effect(() => { fetch(cbUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((d) => { cb = new Cb(d as CbData); }).catch(() => { failed = true; }); });
  let full = $state(false), group = $state(''), year = $state(0), weight = $state(''), invert = $state(false), detail = $state('');
  const AGG = [WORLD, 'DM', 'EM'];
  const g = $derived(cb ? (cb.groups(full).find((x) => x.id === group)?.id ?? cb.groups(full)[0].id) : '');
  const y = $derived(year || (cb?.snap.current_year ?? 0));
  const w = $derived(weight || (cb?.d.countries.weights.default ?? ''));
  const table = $derived<Table | null>(!cb ? null : view === 'groups' ? cb.groupsTable(full, g, y, w) : view === 'predictions' ? cb.predictionsTable() : cb.countriesTable(full, g, y, w));
  const inv = $derived(invert && view === 'countries');
  const shown = $derived(table && inv ? transpose(table) : table);
  const label = $derived(inv ? 0.3 : 0.2);
  const open = (i: number) => { const id = shown?.ids[i]; if (id && !AGG.includes(id)) detail = id; };
  const note = $derived(!cb ? '' : view === 'groups' ? cb.ui.note_groups : view === 'predictions' ? cb.ui.note_predictions : cb.ui.note_countries);
  const spark = (hist: number[], fc: number[]) => {
    const all = [...hist, ...fc]; if (all.length < 2) return { h: '', f: '' };
    const lo = Math.min(...all), span = Math.max(...all) - lo || 1, pt = (i: number) => `${(i * 96) / (all.length - 1)},${(20 * (1 - (all[i] - lo) / span)).toFixed(1)}`;
    return { h: all.slice(0, hist.length).map((_, i) => pt(i)).join(' '), f: all.map((_, i) => i).filter((i) => i >= hist.length - 1).map(pt).join(' ') };
  };
  const rows = $derived(!cb || !detail ? [] : (full ? cb.d.indicators.full.groups.flatMap((x) => [x.label, ...x.items]) : cb.d.indicators.simple.groups.flatMap((x) => [x.label, ...x.items.map((s) => cb!.indicators[s.refs[0]])])));
</script>

{#if failed}<p class="note" data-testid="cb-failed">n/a</p>
{:else if cb && shown}
<section class="cb" data-testid="finterm-cb" data-view={view}>
  {#if detail}
    {@const c = cb.countries.find((x) => x.id === detail)!}
    <button type="button" class="back" data-testid="cb-back" onclick={() => (detail = '')}>&lt; {c.name}</button>
    {#if c.note}<p class="note faint">{c.note}</p>{/if}
    {#each rows as r}
      {#if typeof r === 'string'}<h3 class="grp">{r}</h3>
      {:else}{@const s = cb.series(detail, r.id)}
        <div class="item" data-testid="cb-item" data-ind={r.id}>
          <div class="line"><span class="nm">{r.name}</span>
            {#if s}{#each cb.years() as yy}{@const vv = at(s, yy)}<span class="v" class:fc={isForecast(s, yy)}>{vv != null ? fmt(vv) : cb.ui.na}</span>{/each}
              {@const sp = spark(Object.keys(s.hist ?? {}).sort().map((k) => s.hist![k]), Object.keys(s.fc ?? {}).sort().map((k) => s.fc![k]))}
              <svg width="96" height="20" viewBox="0 0 96 20" aria-hidden="true"><polyline points={sp.h} fill="none" stroke="var(--fin-text2)" stroke-width="1.5" /><polyline points={sp.f} fill="none" stroke="var(--fin-amber, #E3B341)" stroke-width="1.5" /></svg>
            {:else}<span class="miss">{(r as { model_only?: boolean }).model_only ? cb.ui.model_only : cb.ui.na_long}</span>{/if}
          </div>
          {#if s}<p class="note faint">{r.unit} · {cb.ui.source}: {s.source}, {cb.ui.vintage} {s.vintage}{s.note ? `, ${s.note}` : ''}</p>
            {#each s.cb_projection ?? [] as p}<p class="note faint">{p.label}: {Object.entries(p.fc).map(([k, v]) => `${k} ${fmt(v)}`).join(' ')}, {cb.ui.vintage} {p.vintage}</p>{/each}{/if}
        </div>
      {/if}
    {/each}
  {:else}
    <div class="chips">
      <button type="button" class="chip" class:on={!full} onclick={() => (full = false)}>{cb.ui.simple}</button><button type="button" class="chip" class:on={full} onclick={() => (full = true)}>{cb.ui.full}</button>
      {#if view !== 'predictions'}{#each cb.d.countries.weights.options as o}<button type="button" class="chip" class:on={w === o.id} data-testid="cb-weight" onclick={() => (weight = o.id)}>{o.label}</button>{/each}{/if}
      {#if view === 'countries'}<button type="button" class="chip" class:on={!invert} onclick={() => (invert = false)}>{cb.ui.rows_countries}</button><button type="button" class="chip" class:on={invert} onclick={() => (invert = true)}>{cb.ui.rows_indicators}</button>{/if}
    </div>
    {#if view !== 'predictions'}<div class="chips">{#each cb.groups(full) as x}<button type="button" class="chip" class:on={x.id === g} data-testid="cb-group" onclick={() => (group = x.id)}>{x.label}</button>{/each}</div>{/if}
    <div class="chips">{#each cb.years() as yy}<button type="button" class="chip" class:on={yy === y} data-testid="cb-year" onclick={() => (year = yy)}>{yy}</button>{/each}</div>
    <div class="scroll"><div style:min-width="{Math.max(0, shown.header.length - 1) * 64 + 140}px">
      {#key `${view}${full}${g}${y}${w}${inv}`}<FinMatrix columns={shown.header} rows={shown.rows} heat={shown.heat} labels={[label]} rowHref={inv ? undefined : (i) => (AGG.includes(shown.ids[i]) ? null : `#${shown.ids[i]}`)} />{/key}
    </div></div>
    <p class="note faint" data-testid="cb-note">{note} {cb.ui.vintage} {cb.snap.generated}</p>
  {/if}
</section>
{/if}
<svelte:window onhashchange={() => { const h = location.hash.slice(1); if (cb && cb.countries.some((x) => x.id === h)) detail = h; }} />

<style>
  .cb { padding: 12px 16px 96px; display: flex; flex-direction: column; gap: 8px; }
  .chips { display: flex; gap: 8px; overflow-x: auto; }
  .chip, .back { all: unset; cursor: pointer; box-sizing: border-box; min-height: 32px; padding: 0 10px; display: flex; align-items: center; border-radius: 8px; white-space: nowrap;
    border: 1px solid var(--fin-hairline, #243040); color: var(--fin-text2, #9AA7B4); font: 500 11px/16px var(--fin-sans); letter-spacing: .4px; }
  .back { border: 0; padding: 0; color: var(--fin-accent, #5AA7FF); font: 600 15px/20px var(--fin-sans); letter-spacing: 0; }
  .chip.on { border-color: var(--fin-accent, #5AA7FF); color: var(--fin-accent, #5AA7FF); background: color-mix(in srgb, var(--fin-accent, #5AA7FF) 20%, transparent); }
  .scroll { overflow-x: auto; }
  .note { margin: 0; color: var(--fin-text2, #9AA7B4); font: 400 11px/16px var(--fin-sans); }
  .note.faint { color: var(--fin-text3, #6B7886); }
  .grp { margin: 8px 0 0; color: var(--fin-text2, #9AA7B4); font: 500 11px/16px var(--fin-sans); letter-spacing: .4px; }
  .line { display: flex; align-items: center; gap: 8px; }
  .nm { flex: 1; color: var(--fin-text, #E6EDF3); font: 400 13px/16px var(--fin-sans); }
  .v { width: 64px; text-align: right; color: var(--fin-text, #E6EDF3); font: 400 11px/16px var(--fin-mono); }
  .v.fc { color: var(--fin-amber, #E3B341); }
  .miss { color: var(--fin-text3, #6B7886); font: 400 11px/16px var(--fin-sans); }
</style>

<script lang="ts">
  // #1416 FinTerm About > Data sources (the web mirror of the APK's): every free-stack source, GENERATED from the Android declaration.
  import { freeRows, type FreeStackDecl } from './freestack';
  let { decl }: { decl: FreeStackDecl } = $props();
  const rows = $derived(freeRows(decl));
</script>

<section class="ds" data-testid="finterm-data-sources">
  <h2>About ▸ Data sources</h2>
  {#each rows as r (r.id)}
    <article class="card" data-testid="data-source" data-source={r.id} data-status={r.status}>
      <header><span class="name">{r.name}</span><span class="pill {r.status}">{r.status === 'ready' ? 'ready' : r.status === 'needs_key' ? 'needs key' : 'off'}</span></header>
      <p>{r.coverage}</p>
      <p class="meta">Licence / terms: <a href={r.terms} rel="noopener noreferrer" target="_blank">{r.licence}</a></p>
      <p class="meta">Rate limit: {r.rate} · {r.key}</p>
      {#if r.reason}<p class="meta">Status: {r.reason}</p>{/if}
    </article>
  {/each}
</section>

<style>
  .ds { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px 96px; color: var(--fin-text, #E6EDF3); }
  h2 { font-size: 16px; margin: 0; }
  .card { padding: 12px; border-radius: 12px; background: var(--fin-surface, #121A23); border: 1px solid var(--fin-hairline, #243040); }
  header { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
  .name { font-weight: 600; }
  p { margin: 6px 0 0; font-size: 13px; line-height: 1.35; }
  .meta { color: var(--fin-text2, #9AA7B4); font-size: 12px; }
  a { color: var(--fin-accent, #5AA7FF); }
  .pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor; }
  .ready { color: #3FB950; } .needs_key, .flag_off { color: #D29922; }
</style>

<script lang="ts">
  import { shortSource } from '../fin';
  // 2.11 one-line footer: status dot, fetched time, as-of, source link, "via" when another route served.
  let { state, fetched, asOf, name, docs, via, onRefresh }: { state: 'fresh' | 'stale' | 'error' | 'none'; fetched: string; asOf: string; name: string; docs: string; via: string; onRefresh: () => void } = $props();
  const today = new Date().toISOString().slice(0, 10);
</script>
<div class="ft cap" data-testid="finterm-meta">
  {#if state !== 'none'}<span class="dot d-{state}" title={state}></span>{/if}
  {#if fetched}<span class="num">{fetched}</span><span class="sep">·</span>{/if}
  {#if asOf}<span>as of <span class="num" data-testid="finterm-asof">{asOf}</span></span><span class="sep">·</span>{/if}
  <span data-testid="finterm-attr">{#if docs}<a href={docs} target="_blank" rel="noopener noreferrer">{shortSource(name)} ↗</a>{:else}{shortSource(name)}{/if}</span>
  {#if via}<span class="via">via {shortSource(via)}</span>{/if}
  <button class="rf" type="button" onclick={onRefresh} title="Refresh now (R)" aria-label="Refresh {name}">↻</button>
</div>
<style>
  .ft { display: flex; align-items: center; gap: 4px; min-height: 24px; white-space: nowrap; overflow: hidden; }
  .ft a { color: var(--fin-accent); text-decoration: none; }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .d-fresh { background: var(--fin-up); } .d-stale { background: var(--fin-amber); } .d-error { background: var(--fin-down); }
  .via { margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
  .rf { margin-left: auto; border: 0; background: none; color: var(--fin-text2); font-size: 14px; cursor: pointer; padding: 0 2px; line-height: 1; }
  .via + .rf { margin-left: 6px; }
  .sep { color: var(--fin-text3); }
</style>

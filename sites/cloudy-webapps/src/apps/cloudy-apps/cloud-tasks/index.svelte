<script lang="ts">
  // Cloud Tasks: Tasks = a checklist; Calendar ▸ Events / Invites = an agenda that is list-detail from the medium window
  // class (nav-overlay list_detail: cloud-tasks.calendar); Calendar ▸ Calendar = a month grid; Settings = device-only.
  import { ListRow, EmptyState, SettingsRow, StatusBanner } from '@cloudy/ui';
  type Ev = { title: string; when: string; where: string; notes: string };
  let { data }: { data: { section: string; page: string | null; tasks: { title: string; due: string; list: string; done: boolean }[]; events: Ev[]; invites: Ev[]; listDetail: boolean } } = $props();
  let done = $state(data.tasks.map((t) => t.done));
  let pick = $state(0);
  const list = $derived(data.page === 'invites' ? data.invites : data.events);
  const days = Array.from({ length: 35 }, (_, i) => i - 2);
</script>

<div class="tasks" data-testid="app-body">
  <div class="banner"><StatusBanner text="Sample data: the phone syncs your lists from CalDAV." state="idle" /></div>
  {#if data.section === 'tasks'}
    {#each data.tasks as t, i (i)}
      <label class="task" class:done={done[i]}><input type="checkbox" bind:checked={done[i]} /><ListRow label={t.title} secondary="{t.list} · {t.due}" /></label>
    {/each}
  {:else if data.section === 'calendar' && data.page === 'calendar'}
    <div class="month" data-testid="tasks-month">{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d}<b>{d}</b>{/each}{#each days as d}<span class:out={d < 1 || d > 31}>{d < 1 ? d + 30 : d > 31 ? d - 31 : d}</span>{/each}</div>
  {:else if data.section === 'calendar'}
    <div class="ld" class:split={data.listDetail} data-testid="tasks-agenda">
      <div>{#each list as e, i (i)}<button class="pick" class:on={i === pick} onclick={() => (pick = i)}><ListRow label={e.title} secondary={e.when} leading={e.where[0]} /></button>{/each}</div>
      <aside class="detail" data-testid="tasks-detail">{#if list[pick]}<h2>{list[pick].title}</h2><SettingsRow title="When" subtitle={list[pick].when} /><SettingsRow title="Calendar" subtitle={list[pick].where} /><SettingsRow title="Notes" subtitle={list[pick].notes} />{/if}</aside>
    </div>
  {:else}
    <EmptyState title={null} caption="Live on the device: these settings are the phone's." />
  {/if}
</div>

<style>
  .tasks { padding: 0 12px 12px; }
  .banner { padding-bottom: 8px; }
  .task { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .task input { accent-color: var(--f-tab-selected); width: 18px; height: 18px; }
  .task.done :global(.l) { text-decoration: line-through; opacity: 0.6; }
  .pick { display: block; width: 100%; background: none; border: 0; padding: 0 8px; text-align: left; color: inherit; border-radius: 12px; cursor: pointer; }
  .detail { display: none; }
  @container pane (min-width: 600px) {
    .ld.split { display: grid; grid-template-columns: 360px 1fr; gap: 12px; }
    .ld.split .pick.on { background: #7c3aed44; }
    .ld.split .detail { display: block; border-left: 1px solid var(--f-island-border); padding-left: 12px; }
  }
  .month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; font: 400 var(--type-body-medium-size) var(--type-family-sans); }
  .month b { color: var(--f-ink-dim); font-weight: 500; padding: 6px 0; }
  .month span { padding: 10px 0; border-radius: 8px; background: #ffffff0a; }
  .month .out { opacity: 0.35; }
  h2 { margin: 8px 0; font: 500 var(--type-title-medium-size) / normal var(--type-family-sans); }
</style>

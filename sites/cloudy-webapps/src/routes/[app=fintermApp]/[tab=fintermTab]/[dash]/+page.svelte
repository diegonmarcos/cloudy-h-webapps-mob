<script lang="ts">
  import { FleetShell } from '@cloudy/ui';
  import FinTermDashboard from '@cloudy/ui/src/finterm/Dashboard.svelte';
  import FinTermHome from '@cloudy/ui/src/finterm/Home.svelte';
  import FinTermPm from '@cloudy/ui/src/finterm/PmTable.svelte';
  import FinTermCb from '@cloudy/ui/src/finterm/CbTable.svelte';
  import { FINTERM } from '@cloudy/ui/src/finterm/catalog.ts';
  let { data } = $props();
  const v = $derived(data.view);
  const dash = $derived(data.dashId ? FINTERM.dashboards.find((d) => d.id === data.dashId)! : null);
</script>

<svelte:head><title>{v.title}</title></svelte:head>

<FleetShell app={v.app.id} background={v.background} crumbs={v.crumbs} related={v.related} sections={v.sections} section={v.section}
  tabs={v.tabs} tab={v.tabSelected} subtabs={v.subtabs} subtab={v.subSelected} aiHref={v.aiHref} profileHref={v.profileHref} configsHref={v.configsHref} mode={v.mode} groups={v.groups} sideItems={v.sideItems} navUiDecl={v.navUi}>
  {#if data.home}<FinTermHome tab={v.section ?? ''} cards={data.home} />{:else if data.cbView}<FinTermCb view={data.cbView} />{:else if data.appOnly}<p class="app-only" data-testid="finterm-app-only">{data.appOnly}: delayed quotes are fetched live in the Android app.</p>{:else if data.pmTable}<FinTermPm table={data.pmTable} base={`${data.base}/`} />{:else if dash}<FinTermDashboard {dash} />{/if}
</FleetShell>

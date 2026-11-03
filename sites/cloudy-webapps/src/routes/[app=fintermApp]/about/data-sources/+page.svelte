<script lang="ts">
  import { FleetShell } from '@cloudy/ui';
  import DataSources from '@cloudy/ui/src/finterm/DataSources.svelte';
  import finterm from '@cloudy/ui/nav/finterm.json';
  import type { FreeStackDecl } from '@cloudy/ui/src/finterm/freestack';
  let { data } = $props();
  const v = $derived(data.view);
</script>

<svelte:head><title>{v.title}</title></svelte:head>

<FleetShell app={v.app.id} background={v.background} crumbs={v.crumbs} related={v.related} sections={v.sections} section={v.section}
  tabs={v.tabs} tab={v.tabSelected} subtabs={v.subtabs} subtab={v.subSelected} aiHref={v.aiHref} profileHref={v.profileHref} configsHref={v.configsHref} mode={v.mode} groups={v.groups} sideItems={v.sideItems} navUiDecl={v.navUi}>
  <DataSources decl={(finterm as unknown as { free_stack: FreeStackDecl }).free_stack} />
</FleetShell>

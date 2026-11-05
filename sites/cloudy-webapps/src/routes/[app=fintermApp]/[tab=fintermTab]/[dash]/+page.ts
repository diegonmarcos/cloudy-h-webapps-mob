import type { PageLoad } from './$types';

// The heavy dashboard engine (panels, tables, charts) is a chunk of its own, loaded only by a dashboard page: the tab Homepage and the PM table pages never pay for it
// (the lazy-chunk budget, scripts/budget.mjs). Awaited here, so the prerendered HTML still contains the dashboard.
export const load: PageLoad = async ({ data }) => ({
  ...data,
  Dashboard: data.dashId ? (await import('@cloudy/ui/src/finterm/Dashboard.svelte')).default : null,
});

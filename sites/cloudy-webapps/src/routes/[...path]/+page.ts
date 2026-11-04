// One lazily loaded chunk per fleet app (B.3): src/apps/cloudy-apps/<app-id>/index.svelte, else the generic body. Universal load, so the
// component is resolved at prerender (SSR) and again on the client; the app's data came from +page.server.ts.
import type { Component } from 'svelte';
const MODS = import.meta.glob('../../apps/cloudy-apps/*/index.svelte') as Record<string, () => Promise<{ default: Component<any> }>>;

export const load = async ({ data }) => {
  if (data.view.kind !== 'app') return { ...data, body: null };
  const loader = MODS[`../../apps/cloudy-apps/${data.view.app.id}/index.svelte`] ?? MODS['../../apps/cloudy-apps/_generic/index.svelte'];
  return { ...data, body: (await loader()).default };
};

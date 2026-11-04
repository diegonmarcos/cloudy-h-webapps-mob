import { error } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { EntryGenerator } from './$types';
import { ENTRY_PATHS, superappView, appView, aboutView, shellData, declaredAbout, appStack } from '$lib/server/nav';

// Every SuperApp section/page and every fleet app/section/page from the GENERATED routes.json (B.6): one prerendered URL each.
export const entries: EntryGenerator = () => ENTRY_PATHS.map((p) => ({ path: p.replace(/\/$/, '') }));

// Per-app build-time data (src/apps/cloudy-apps/<id>/server.ts load(view)): only the slice the page renders reaches the client.
const SERVERS = import.meta.glob('../../apps/cloudy-apps/*/server.ts', { eager: true }) as Record<string, { load?: (v: unknown) => unknown }>;

export const load = ({ params }) => {
  const path = params.path ? `${params.path}/` : '';
  const sa = superappView(base, path);
  if (sa) return { view: sa, shell: shellData(base) };
  const about = aboutView(base, path);
  if (about) return { view: about, shell: shellData(base) };
  const view = appView(base, path);
  if (!view) error(404, `No page ${path}`);
  const srv = SERVERS[`../../apps/cloudy-apps/${view.app.id}/server.ts`];
  if (srv?.load) view.data = srv.load(view);
  else if (view.section === 'about') { const d = declaredAbout(view.app.id); if (d) view.data = { about: d }; }
  if (!view.data && !srv?.load) { const stack = appStack(view.app.id, view.section); if (stack) view.data = { stack }; }
  return { view, shell: null };
};

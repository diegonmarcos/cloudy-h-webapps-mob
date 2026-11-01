import { error, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import finterm from '@cloudy/ui/nav/finterm.json';
import { appView } from '$lib/server/nav';
import type { EntryGenerator } from './$types';

// One prerendered page per FinTerm dashboard (#1342), plus (#1399) each tab's Homepage (`<tab>-home`, the tab's first sub-page: a grid of
// cards, one per dashboard) and the removed pages' deep links (finterm.redirects: FI Market Monitor -> the FI Homepage).
export const entries: EntryGenerator = () => [
  ...finterm.dashboards.map((d) => ({ app: finterm.app_id, tab: d.tab, dash: d.slug })),
  ...finterm.tabs.map((tab) => ({ app: finterm.app_id, tab, dash: `${tab}-home` })),
  ...finterm.redirects.map((r) => ({ app: finterm.app_id, tab: r.tab, dash: r.slug })),
];

export const load = ({ params }) => {
  const moved = finterm.redirects.find((r) => r.tab === params.tab && r.slug === params.dash);
  if (moved) redirect(308, `${base}/${params.app}/${moved.tab}/${moved.to}/`);
  const view = appView(base, `${params.app}/${params.tab}/${params.dash}/`);
  if (params.dash === `${params.tab}-home`) {
    const cards = (finterm.homes as Record<string, { slug: string; title: string; icon: string; subtitle: string }[]>)[params.tab];
    if (!cards || !view) error(404, `No FinTerm tab ${params.tab}`);
    return { view, dashId: null, home: cards.map((c) => ({ ...c, href: `${base}/${params.app}/${params.tab}/${c.slug}/` })) };
  }
  const dash = finterm.dashboards.find((d) => d.tab === params.tab && d.slug === params.dash);
  if (!dash || !view) error(404, `No dashboard ${params.tab}/${params.dash}`);
  view.crumbs = [...view.crumbs, { label: dash.entry, href: null }];
  view.title = `${dash.entry} · ${view.title}`;
  return { view, dashId: dash.id, home: null };
};

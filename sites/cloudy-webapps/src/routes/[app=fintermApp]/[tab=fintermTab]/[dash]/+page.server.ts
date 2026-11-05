import { error, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import finterm from '@cloudy/ui/nav/finterm.json';
import { appView } from '$lib/server/nav';
import type { EntryGenerator } from './$types';

// One prerendered page per FinTerm dashboard (#1342), per PM table page (#1478: Vol, Commodities, Profiles), plus (#1399) each tab's Homepage (`<tab>-home`, the tab's first sub-page: a grid of
// cards, one per dashboard) and the removed pages' deep links (finterm.redirects: FI Market Monitor -> the FI Homepage).
type PmPage = { kind: string; title: string; page?: string; table?: string };
const pmPages = (tab: string) => ((finterm.stacks as unknown as Record<string, PmPage[]>)[tab] ?? []).filter((e) => e.kind === 'pm_table');
export const entries: EntryGenerator = () => [
  ...finterm.tabs.flatMap((tab) => pmPages(tab).map((e) => ({ app: finterm.app_id, tab, dash: e.page! }))),
  ...finterm.dashboards.map((d) => ({ app: finterm.app_id, tab: d.tab, dash: d.slug })),
  ...finterm.tabs.map((tab) => ({ app: finterm.app_id, tab, dash: `${tab}-home` })),
  ...finterm.redirects.map((r) => ({ app: finterm.app_id, tab: r.tab, dash: r.slug })),
];

export const load = ({ params }) => {
  const moved = finterm.redirects.find((r) => r.tab === params.tab && r.slug === params.dash);
  if (moved) redirect(308, `${base}/${params.app}/${moved.tab}/${moved.to}/`);
  // A dashboard that is not a page of the Android nav (#1478: PM keeps Homepage, Vol, Commodities, Profiles; a table row opens the portfolio) is drawn in its tab's chrome.
  const isDash = finterm.dashboards.some((d) => d.tab === params.tab && d.slug === params.dash);
  const view = appView(base, `${params.app}/${params.tab}/${params.dash}/`) ?? (isDash ? appView(base, `${params.app}/${params.tab}/`) : null);
  if (params.dash === `${params.tab}-home`) {
    const cards = (finterm.homes as Record<string, { slug: string; title: string; icon: string; subtitle: string }[]>)[params.tab];
    if (!cards || !view) error(404, `No FinTerm tab ${params.tab}`);
    return { view, dashId: null, home: cards.map((c) => ({ ...c, href: `${base}/${params.app}/${params.tab}/${c.slug}/` })), pmTable: null, base };
  }
  const pmPage = pmPages(params.tab).find((e) => e.page === params.dash);
  if (pmPage && view) {
    view.crumbs = [...view.crumbs, { label: pmPage.title, href: null }];
    view.title = `${pmPage.title} · ${view.title}`;
    return { view, dashId: null, home: null, pmTable: pmPage.table!, base };
  }
  const dash = finterm.dashboards.find((d) => d.tab === params.tab && d.slug === params.dash);
  if (!dash || !view) error(404, `No dashboard ${params.tab}/${params.dash}`);
  view.crumbs = [...view.crumbs, { label: dash.entry, href: null }];
  view.title = `${dash.entry} · ${view.title}`;
  return { view, dashId: dash.id, home: null, pmTable: null, base };
};

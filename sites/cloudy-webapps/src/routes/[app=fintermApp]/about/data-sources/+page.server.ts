import { error } from '@sveltejs/kit';
import { base } from '$app/paths';
import finterm from '@cloudy/ui/nav/finterm.json';
import { appView } from '$lib/server/nav';
import type { EntryGenerator } from './$types';

// #1416 FinTerm About > Data sources (prerendered): the generated free stack, under the app's About section.
export const entries: EntryGenerator = () => [{ app: finterm.app_id }];

export const load = ({ params }) => {
  const view = appView(base, `${params.app}/about/`) ?? appView(base, `${params.app}/`);
  if (!view) error(404, `No FinTerm app ${params.app}`);
  view.crumbs = [...view.crumbs, { label: 'Data sources', href: null }];
  view.title = `Data sources · ${view.title}`;
  return { view };
};

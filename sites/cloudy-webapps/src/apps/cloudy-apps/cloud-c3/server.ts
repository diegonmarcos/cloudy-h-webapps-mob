// Cloud C3 (ac_cloud-c3) on the web: the six sections over the C3 snapshot (@cloudy/c3-data); the same views serve the
// cloudy-c3 site.
import { c3View } from '@cloudy/c3-data/views';
import type { AppView } from '$lib/server/nav';

export const load = (view: AppView) => c3View(view.section, view.sub ?? view.page, view.listDetail);

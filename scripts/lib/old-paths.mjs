// Old URL -> new URL (#1320 M7). Shared by test-routes.mjs, gen-redirects.mjs and test-old-urls.mjs; plain JS so the
// Pages deploy (ship.yml, no TypeScript) can run gen-redirects.mjs straight from the mirror.

/** /cloud-superapp/apps/<id>/<section>/<page> (the old replica) -> the new cloud-<id>/<section>/<page>/, or the nearest
 *  existing ancestor when Android has since dropped that page. */
export function oldAppTarget(oldPath, routeSet) {
  const m = /^apps\/([^/]+)\/?(.*)$/.exec(oldPath.replace(/\/$/, ''));
  if (!m) return null;
  const parts = [`cloud-${m[1]}`, ...m[2].split('/').filter(Boolean)];
  return nearest(parts, routeSet);
}

function nearest(parts, routeSet) {
  for (let n = parts.length; n > 0; n--) { const p = parts.slice(0, n).join('/') + '/'; if (routeSet.has(p)) return p; }
  return null;
}

/** SuperApp sections the Android app has renamed or folded since the replica was cut (longest prefix wins). */
export const SA_RENAMES = {
  'browser/': 'cloud-browser/',
  'cloud/c3/': 'c3/',
  'communication/cloud-rss/': 'communication/',
  'communication/msgs/': 'boards/msgs/',
  'config/ai/': 'config/agents/',
  'drive/': 'cloud-drive/',
  'home-apps/': 'cloud/apps/',
  'infos/my-pm/': 'boards/my-pm/',
  'infos/work-pm/': 'boards/',
  'infos/': 'boards/',
  'myfin/': 'cloud-wallet/',
  'solutions/': 'cloud/',
  'vault/pw-list/': 'vault/passwords/',
  'wallet/': 'cloud-wallet/',
};

/** /cloud-superapp/<path> -> a cloudy-webapps route (relative to /cloud-webapps/). */
export function oldSuperAppTarget(oldPath, routeSet) {
  const p = oldPath.replace(/^\/+/, '');
  if (p.startsWith('apps/')) return oldAppTarget(p, routeSet) ?? '';
  if (p === '' || routeSet.has(p)) return p;
  const from = Object.keys(SA_RENAMES).sort((a, b) => b.length - a.length).find((k) => p.startsWith(k));
  const q = from ? SA_RENAMES[from] + p.slice(from.length) : p;
  return nearest(q.split('/').filter(Boolean), routeSet) ?? '';
}

/** The old /cloud/ C3 portal pages -> /cloudy-c3/ (the same ids as @cloudy/c3-data PORTAL[].old; a unit test keeps them equal). */
export const C3_OLD = {
  '': '', 'index.html': '', 'error.html': '', 'oauth-callback.html': '',
  'cloud_control_center.html': 'portal/control-center/', 'cloud_control.html': 'portal/cloud-control/', 'architecture.html': 'portal/architecture/',
  'products.html': 'portal/products/', 'feed_docs.html': 'portal/feed-docs/', 'c3_gallery.html': 'portal/gallery/', mcp: 'portal/mcp/', api: 'portal/api/',
};

/** The old /cloud-webapps/<app>/ stub folders whose id is not a fleet app any more (the others keep their URL). */
export const STUB_RENAMES = {
  'ai-chat': '/cloud-webapps/cloud-tools-small-llms/',
  'c3-bot': '/cloud-webapps/c3/',
  'c3-dns-routing': '/cloudy-c3/ops/net/net_dns/',
  'c3-mail': '/cloud-webapps/cloud-mail/',
  'c3-mcp-apis': '/cloudy-c3/portal/mcp/',
  'c3-observability': '/cloudy-c3/observ/',
  'c3-security-network': '/cloudy-c3/portal/architecture/',
  'cloud-media': '/cloud-webapps/cloud-media-center/',
  'cloud-superapp': '/cloud-webapps/',
  'cloud-terminal': '/cloud-webapps/cloud-terminal-termux/',
};

/** Any old absolute URL path -> its new absolute path, or null when this map does not know the URL.
 *  routeSet: the cloudy-webapps routes (relative, trailing slash); a path that still exists maps to itself. */
export function oldUrlTarget(url, routeSet) {
  let m;
  if ((m = /^\/cloud-superapp\/(.*)$/.exec(url))) return `/cloud-webapps/${oldSuperAppTarget(m[1], routeSet)}`;
  if (/^\/cloud-mobile(\/|$)/.test(url)) return `/cloud-webapps/${oldSuperAppTarget(url.replace(/^\/cloud-mobile\/?/, ''), routeSet)}`;
  if ((m = /^\/cloud\/(.*)$/.exec(url))) { const k = m[1].replace(/\/$/, ''); return `/cloudy-c3/${C3_OLD[k] ?? ''}`; }
  if (/^\/cloud-web\/?$/.test(url)) return '/cloud-webapps/cloud/webapps/';
  if ((m = /^\/cloud-webapps\/([^/]+)\/$/.exec(url))) return STUB_RENAMES[m[1]] ?? (routeSet.has(`${m[1]}/`) ? url : null);
  return null;
}

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// One CSS file ('kit') for the styles of the @cloudy/ui components the section and fleet pages share: split per component they
// gzip worse than as one file. Only the style sub-modules are grouped (no JS deps), so no code moves and the home page, which uses
// none of them (its shell is SuperAppShell + EmptyState), does not load it.
const KIT = /\/packages\/cloudy-ui\/src\/(components\/(?!EmptyState\.)[A-Z]\w*|fleet\/Fleet(Shell|FirstRow|SecondRows?|BottomBar|SideMenu))\.svelte\?svelte&type=style/;

// The generated FinTerm declarations (nav/finterm.json, about 20 kB gzip) are data, not code: their own chunk, so the FinTerm code chunk
// stays under the per-chunk budget (scripts/budget.mjs) as the declarations grow. Only the FinTerm pages load it.
const FINTERM_DATA = /\/packages\/cloudy-ui\/nav\/finterm\.json$/;

export default defineConfig({
  plugins: [sveltekit()],
  // @cloudy/ui is a workspace package consumed as source.
  server: { fs: { allow: ['../..'] } },
  build: { rollupOptions: { output: { manualChunks: (id) => (KIT.test(id) ? 'kit' : FINTERM_DATA.test(id) ? 'finterm-data' : undefined) } } },
});

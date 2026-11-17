import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { shot } from './shot';
import { BASE } from './helpers';

// #1335: the Lnktree row (Omniverse, FinTerm, CAD, BioMed), their pages and the FinTerm terminal link. Every expected URL is READ from the generated
// declarations (app-links.json, apps-ui.json), none is typed here.
const J = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const links = J('packages/cloudy-ui/nav/app-links.json').links as { id: string; kind: string; href: string; mesh?: boolean; backend?: { href: string } }[];
const apps = J('packages/cloudy-ui/nav/nav.json').apps as { id: string; dir: string | null; sections?: { id: string; pages?: { id: string }[] }[] }[];
// #1777 a stack is keyed by its page id; a sub-page lives at <section>/<page>/ (Hardtech-CAD: models/mcad, sim2real/sap2000), a page without a parent at <id>/
const routeOf = (app: string, key: string) => { const s = apps.find((a) => a.id === app)?.sections?.find((x) => x.pages?.some((p) => p.id === key)); return s ? `${s.id}/${key}` : key; };
const ui = J('packages/cloudy-ui/nav/apps-ui.json').apps as Record<string, { stacks: Record<string, { kind?: string; title?: string; url?: string; planned?: boolean }[]> }>;
const finId = apps.find((a) => a.dir?.startsWith('ad_Capital-'))!.id;
const terminal = links.find((l) => l.id === finId)!;

test('the Projects row (formerly Lnktree, #1756): four web app pages (FinTerm is the web terminal, its backend is a separate mesh link)', async ({ page }, info) => {
  await page.goto(`${BASE}/cloud/`);
  const row = page.locator('[data-group="Projects"]');
  // the Projects row: Wiki, the SuperApp's own tile, Omniverse, FinTerm, BioMed, CAD and Circusverse (#1777: BioMed replaces Sim2Real, Wiki and Circusverse joined)
  await expect(row.locator('[data-tile]')).toHaveCount(7);
  for (const [tile, id] of [['omniverse', 'cg-omniverse'], ['cad', 'hardtech-cad'], ['biomed', 'hardtech-biomed']] as const) {
    const a = row.locator(`[data-tile="${tile}"]`);
    await expect(a).toHaveAttribute('href', links.find((l) => l.id === id)!.href);
    await expect(a).not.toHaveClass(/grey/);
  }
  const fin = row.locator('[data-tile="finterm"]');
  await expect(fin).toHaveAttribute('href', terminal.href);
  expect(terminal.kind).toBe('webapp');
  await expect(fin).not.toHaveAttribute('target', '_blank');
  await expect(fin.getByTestId('mesh-badge')).toHaveCount(0);
  await shot(page, info, 'lnktree-row');
});

test('each Lnktree app page lists its entries: a declared target or a greyed planned card', async ({ page }) => {
  for (const id of ['cg-omniverse', 'hardtech-cad', 'hardtech-biomed']) {
    for (const [sec, all] of Object.entries(ui[id].stacks).filter(([k]) => k !== 'about')) {
      // a page drawn by its declared kind (CG-Omniverse avatar/galaxy/store, #1366) has no stack cards, as the unit test (lnktree.test.ts) skips them
      const list = (all as { kind?: string; url?: string }[]).filter((e) => !e.kind || e.kind === 'info' || e.kind === 'nav' || e.kind === 'section_title');   // #1777 info, nav and section-title entries are cards too
      // a page with a model library (hardtech-cad) is drawn by the generic body, not by stack cards (appStack returns null)
      if ((all as { kind?: string }[]).some((e) => e.kind === 'library')) continue;
      await page.goto(`${BASE}/${id}/${routeOf(id, sec)}/`);
      const cards = page.getByTestId('stack-card');
      await expect(cards, `${id}/${sec}`).toHaveCount(list.length);
      for (const [i, e] of list.entries()) {
        const card = cards.nth(i);
        if (e.kind === 'info' || e.kind === 'section_title') { await expect(card, `${id}/${sec}`).not.toHaveAttribute('data-planned', /.*/); await expect(card.locator('a.open')).toHaveCount(0); }
        else if (e.kind === 'nav') { await expect(card.locator('a.open'), `${id}/${sec}`).toHaveCount(1); }
        else if (e.url) { await expect(card.locator('a.open'), `${id}/${sec}`).toHaveAttribute('href', e.url); await expect(card).not.toHaveAttribute('data-planned', /.*/); }
        else { await expect(card, `${id}/${sec}`).toHaveAttribute('data-planned', 'true'); await expect(card.locator('a.open')).toHaveCount(0); }
      }
    }
  }
});

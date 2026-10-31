import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { shot } from './shot';
import { BASE } from './helpers';

// #1335: the Lnktree row (Omniverse, FinTerm, CAD, Sim2Real), their pages and the FinTerm terminal link. Every expected URL is READ from the generated
// declarations (app-links.json, apps-ui.json), none is typed here.
const J = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const links = J('packages/cloudy-ui/nav/app-links.json').links as { id: string; kind: string; href: string; mesh?: boolean; backend?: { href: string } }[];
const apps = J('packages/cloudy-ui/nav/nav.json').apps as { id: string; dir: string | null }[];
const ui = J('packages/cloudy-ui/nav/apps-ui.json').apps as Record<string, { stacks: Record<string, { kind?: string; title?: string; url?: string; planned?: boolean }[]> }>;
const finId = apps.find((a) => a.dir?.startsWith('ad_Capital-'))!.id;
const terminal = links.find((l) => l.id === finId)!;

test('the Lnktree row: four web app pages (FinTerm is the web terminal, its backend is a separate mesh link)', async ({ page }, info) => {
  await page.goto(`${BASE}/cloud/`);
  const row = page.locator('[data-group="Lnktree"]');
  // the SuperApp's own tile leads the row (Android 1719aee0d5), then the four apps
  await expect(row.locator('[data-tile]')).toHaveCount(5);
  for (const [tile, id] of [['omniverse', 'cg-omniverse'], ['cad', 'hardtech-cad'], ['sim2real', 'hardtech-sim2real']] as const) {
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
  for (const id of ['cg-omniverse', 'hardtech-cad', 'hardtech-sim2real']) {
    for (const [sec, all] of Object.entries(ui[id].stacks).filter(([k]) => k !== 'about')) {
      // a page drawn by its declared kind (CG-Omniverse avatar/galaxy/store, #1366) has no stack cards, as the unit test (lnktree.test.ts) skips them
      const list = (all as { kind?: string; url?: string }[]).filter((e) => !e.kind);
      await page.goto(`${BASE}/${id}/${sec}/`);
      const cards = page.getByTestId('stack-card');
      await expect(cards, `${id}/${sec}`).toHaveCount(list.length);
      for (const [i, e] of list.entries()) {
        const card = cards.nth(i);
        if (e.url) { await expect(card.locator('a.open'), `${id}/${sec}`).toHaveAttribute('href', e.url); await expect(card).not.toHaveAttribute('data-planned', /.*/); }
        else { await expect(card, `${id}/${sec}`).toHaveAttribute('data-planned', 'true'); await expect(card.locator('a.open')).toHaveCount(0); }
      }
    }
  }
});

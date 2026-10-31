import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { shot } from './shot';
import { BASE, groupOf } from './helpers';

// #1326: every fleet app links back to its real web service; phone-only apps are grey and open an About page.
const links = JSON.parse(readFileSync('packages/cloudy-ui/nav/app-links.json', 'utf8')).links as { id: string; kind: string; href: string | null }[];
const container = (id: string) => links.find((l) => l.id === id)!;

test('a grey tile (Dialer) opens its About page, the back arrow returns to the grid', async ({ page }, info) => {
  await page.goto(`${BASE}/cloud/`);
  await page.getByTestId('tile-groups').first().waitFor();
  const tile = page.locator(`[data-group="${groupOf('dialer')}"] [data-tile="dialer"]`);
  await expect(tile).toHaveClass(/grey/);
  expect(await tile.locator('.glyph').evaluate((e) => getComputedStyle(e).filter)).toContain('grayscale');
  await tile.click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/cloud-dialer/about/$`));
  await expect(page.getByTestId('about-name')).toHaveText('Dialer');
  await expect(page.getByTestId('about-line')).toContainText('part of the cloudy APK fleet and runs on the phone only');
  await shot(page, info, 'about-dialer');
  await page.getByTestId('toolbar-back').click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/cloud/$`));
});

test('the About page is a direct URL and its back arrow falls back to the grid', async ({ page }) => {
  await page.goto(`${BASE}/cloud-keyboard/about/`);
  await expect(page.getByTestId('about-name')).toHaveText('Keyboard');
  await page.getByTestId('toolbar-back').click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/$`));
});

test('container tiles carry the private mesh URL, open in a new tab and wear the mesh badge', async ({ page }, info) => {
  await page.goto(`${BASE}/cloud/`);
  for (const [tile, app] of [['mail', 'cloud-mail'], ['vault', 'cloud-vault'], ['news', 'cloud-news']] as const) {
    const a = page.locator(`[data-tile="${tile}"]`).first();
    await expect(a).toHaveAttribute('href', container(app).href!);
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a.getByTestId('mesh-badge')).toBeVisible();
    expect(container(app).href).toMatch(/^https:\/\/([a-z0-9-]+\.mesh\.diegonmarcos\.com|c3-pvt\.diegonmarcos\.com)\//);
  }
  await expect(page.locator('[data-tile="wallet"]').first()).toHaveAttribute('href', 'https://wallet.google.com/');
  await expect(page.locator('[data-tile="c3-bot"]').first()).toHaveAttribute('href', 'https://t.me/Cloud_bot_C3_Infra_bot');
  await expect(page.locator('[data-tile="maps"]').first()).toHaveAttribute('href', '/cloud-desktop/cloud-nav/navigation/');
  await shot(page, info, 'grid-links');
});

test('every phone-only app has a rendered About page', async ({ page }) => {
  for (const l of links.filter((x) => x.kind === 'phone-only')) {
    const r = await page.goto(`${BASE}/${l.id}/about/`);
    expect(r!.status(), l.id).toBe(200);
    await expect(page.getByTestId('about-line'), l.id).toBeVisible();
  }
});

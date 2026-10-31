import { expect, test } from '@playwright/test';
import { BASE, cloudGroups } from './helpers';

// Port of a_Portals/cloud-superapp/test/embed.spec.mjs: the APK opens /cloud-webapps/?embed=1 with the UA marker
// " CloudSuperApp-Embed/1" (aa_cloud-superapp test-cloud-webapps-tab.sh T6, WebAppsEmbedTest).
const chrome = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const vis = (sel: string) => { const e = document.querySelector(sel); if (!e) return false; const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  const c = document.querySelector('.content')?.getBoundingClientRect();
  return { embed: document.documentElement.classList.contains('embed'), topBar: vis('.status-strip') || vis('.app-top-bar'), bottomNav: vis('.bottom-nav'), contentTop: c ? Math.round(c.top) : -1 };
});

for (const path of ['/cloud/', '/cloud-c3/']) {
  test(`default ${path}: full chrome`, async ({ page }) => {
    await page.goto(`${BASE}${path}`);
    const r = await chrome(page);
    expect(r.embed).toBe(false);
    expect(r.topBar).toBe(true);
    if (path === '/cloud/') expect(r.bottomNav).toBe(true);
  });
}
for (const path of ['/cloud/', '/cloud-c3/', '/']) {
  test(`?embed=1 ${path}: chrome hidden, content at the top`, async ({ page }) => {
    await page.goto(`${BASE}${path}?embed=1`);
    const r = await chrome(page);
    expect(r).toMatchObject({ embed: true, topBar: false, bottomNav: false });
    expect(r.contentTop).toBeLessThanOrEqual(0);
  });
  test(`UA marker ${path}: chrome hidden`, async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 CloudSuperApp-Embed/1' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`);
    expect(await chrome(page)).toMatchObject({ embed: true, topBar: false, bottomNav: false });
    await ctx.close();
  });
}
test('?embed=1 home is the Cloud > Apps grid, and the flag survives a tile click', async ({ page }) => {
  await page.goto(`${BASE}/?embed=1`);
  await expect(page.locator(`.embed-apps [data-group="${cloudGroups[0].title}"]`)).toBeVisible();
  await expect(page.getByTestId('home-cube')).toBeHidden();
  await page.locator('.embed-apps a.tile').first().click();
  await page.waitForLoadState('load');
  expect(await page.evaluate(() => document.documentElement.classList.contains('embed'))).toBe(true);
});

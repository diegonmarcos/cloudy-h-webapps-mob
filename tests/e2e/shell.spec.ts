import { expect, test } from '@playwright/test';
import { shot } from './shot';
import { BASE, cloudGroups, isTablet, swipe } from './helpers';

// M2: the SuperApp shell at phone (412x915) and tablet (1280x800, 800x1280).
test.describe('SuperApp shell', () => {
  test('home: status strip, corner orbs, cube, the 5-item island with Home selected', async ({ page }, info) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByTestId('strip')).toBeVisible();
    await expect(page.getByTestId('home-cube')).toBeVisible();
    const items = page.locator('.bottom-nav__item');
    await expect(items).toHaveCount(5);
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.bottom-nav__item .label')).toHaveText(['Notify', 'Boards', 'Home', 'Cloud', 'Phone']);
    await shot(page, info, 'home');
  });

  test('island geometry: 80% of the width, stadium of islandFill, 12dp above the bottom', async ({ page }) => {
    await page.goto(`${BASE}/cloud/`);
    const vw = page.viewportSize()!.width;
    const box = (await page.getByTestId('island').boundingBox())!;
    expect(Math.abs(box.width - vw * 0.8)).toBeLessThanOrEqual(1);
    expect(Math.abs(page.viewportSize()!.height - (box.y + box.height) - 12)).toBeLessThanOrEqual(1);
    expect(await page.getByTestId('island').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(20, 11, 38)');
    const sel = page.locator('.bottom-nav__item.on');
    expect(await sel.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(230, 224, 233)');
  });

  test('Cloud: tabs App | WebApps | Linktree | Configs, Quickmarks tile groups from build.json', async ({ page }, info) => {
    await page.goto(`${BASE}/cloud/`);
    await expect(page.locator('[data-testid="content"] [data-testid="page-tabs"] .page-tabs__item')).toHaveText(['APP', 'WEBAPPS', 'LINKTREE', 'CONFIGS']);
    await expect(page.locator('.group-title').first()).toHaveText('Quickmarks');
    const first = cloudGroups[0];
    await expect(page.locator(`[data-group="${first.title}"] .tile__label`).first()).toHaveText(first.tiles.find((t) => !t.separator)!.label);
    await shot(page, info, 'cloud-apps');
  });

  test('tablet = sw600dp master 40% | detail 60%; phone = one pane', async ({ page }, info) => {
    await page.goto(`${BASE}/communication/`);
    const detail = page.getByTestId('detail');
    if (isTablet(info.project.name)) {
      await expect(detail).toBeVisible();
      await expect(detail).toContainText('Select an item');
      const m = (await page.getByTestId('content').boundingBox())!;
      expect(Math.abs(m.width - page.viewportSize()!.width * 0.4)).toBeLessThanOrEqual(2);
      await expect(page.getByTestId('bottom-nav')).toBeVisible();
    } else {
      await expect(detail).toBeHidden();
    }
    await shot(page, info, 'communication');
  });

  test('a page-tab swipe walks the tabs and changes the URL', async ({ page }) => {
    await page.goto(`${BASE}/cloud/apps/`);
    await swipe(page, '[data-testid="content"]', -160);
    await expect(page).toHaveURL(/\/cloud\/webapps\/$/);
  });

  test('Back from a page lands on the section first tab, then Home', async ({ page }) => {
    await page.goto(`${BASE}/cloud/lnktree/`);
    await page.getByTestId('toolbar-back').click();
    await expect(page).toHaveURL(/\/cloud\/apps\/$/);
    await page.getByTestId('toolbar-back').click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/$`));
  });

  test('the drawer opens from the hamburger with the home groups', async ({ page }, info) => {
    await page.goto(`${BASE}/cloud/`);
    await page.getByTestId('toolbar-menu').click();
    await expect(page.getByTestId('drawer')).toBeVisible();
    await expect(page.getByTestId('drawer')).toContainText('Home Apps');
    await shot(page, info, 'drawer');
  });

  test('the minimalist theme drops the chrome', async ({ page }, info) => {
    await page.goto(`${BASE}/?theme=cloud_minimalist_black`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cloud_minimalist_black');
    await expect(page.getByTestId('bottom-nav')).toBeHidden();
    await shot(page, info, 'home-minimalist');
  });

  for (const path of ['boards/', 'phone/', 'mail/inbox/', 'c3/', 'config/']) {
    test(`renders ${path}`, async ({ page }, info) => {
      const r = await page.goto(`${BASE}/${path}`);
      expect(r?.status()).toBe(200);
      await expect(page.getByTestId('page-body')).toBeVisible();
      await shot(page, info, path.replace(/\//g, '_'));
    });
  }
});

test('offline: a visited page reloads from the service worker', async ({ page, context }) => {
  await page.goto(`${BASE}/cloud-calc/calculator/calc/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-app="cloud-calc"]')).toBeVisible();
  await context.setOffline(false);
});

test('/t/ resolves Android targets', async ({ page }) => {
  await page.goto(`${BASE}/t/?page:cloud/lnktree`);
  await expect(page).toHaveURL(/\/cloud\/lnktree\/$/);
  await page.goto(`${BASE}/t/#extapp:cloud-calc#page:calculator/graph`);
  await expect(page).toHaveURL(/\/cloud-calc\/calculator\/graph\/$/);
});

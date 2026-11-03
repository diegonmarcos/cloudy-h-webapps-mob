import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { shot } from './shot';
import { BASE, isTablet } from './helpers';

// M3 pilots: every declared page of cloud-calc, cloud-c3 and cloud-tasks renders in the fleet chrome at phone and tablet.
type P = { id: string; pages?: P[] };
const nav = JSON.parse(readFileSync('packages/cloudy-ui/nav/nav.json', 'utf8')) as { apps: { id: string; sections: P[] }[] };
const PILOTS = ['cloud-calc', 'cloud-c3', 'cloud-tasks'];
const paths: string[] = [];
for (const id of PILOTS) {
  const a = nav.apps.find((x) => x.id === id)!;
  paths.push(`${id}/`);
  const walk = (prefix: string, pages: P[] = []) => { for (const p of pages) { paths.push(`${prefix}${p.id}/`); walk(`${prefix}${p.id}/`, p.pages); } };
  for (const s of a.sections) { paths.push(`${id}/${s.id}/`); walk(`${id}/${s.id}/`, s.pages); }
}

test.describe('pilot apps: every page', () => {
  for (const p of paths) {
    test(p, async ({ page }) => {
      const r = await page.goto(`${BASE}/${p}`);
      expect(r?.status()).toBe(200);
      await expect(page.getByTestId('fleet-shell')).toBeVisible();
      await expect(page.getByTestId('fleet-first-row')).toBeVisible();
    });
  }
});

test('cloud-calc: the declared keypad computes (7 × 6 = 42; 500 / 3 = 166.6666667)', async ({ page }, info) => {
  await page.goto(`${BASE}/cloud-calc/calculator/calc/`);
  const pad = page.getByTestId('calc-pad');
  for (const k of ['7', '*', '6', '=']) await pad.locator(`[data-key="${k}"]`).click();
  await expect(page.getByTestId('calc-result')).toHaveText('42');
  for (const k of ['AC', '5', '0', '0', '/', '3', '=']) await pad.locator(`[data-key="${k}"]`).click();
  await expect(page.getByTestId('calc-result')).toHaveText('166.6666667');
  await shot(page, info, 'calc');
});

// The expectations are READ from the generated navdata (nav.json, from Android build.json), never hard-coded: the default
// section's last page, its group row when the section has two rows (nav_mode horizontal_two_rows), and the bottom bar.
type Sec = { id: string; label: string; pages: { id: string; label: string }[]; groups?: { id: string; pages: string[] }[] };
const calc = nav.apps.find((x) => x.id === 'cloud-calc') as unknown as { name: string; label: string; default_section: string; bottom_nav: string[]; sections: Sec[] };
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('cloud-calc: the breadcrumb, the second row and the bottom bar follow build.json', async ({ page }) => {
  const sec = calc.sections.find((x) => x.id === calc.default_section)!;
  const pg = sec.pages[sec.pages.length - 1];
  await page.goto(`${BASE}/cloud-calc/${sec.id}/${pg.id}/`);
  const crumb = `${esc(sec.label)} / ${esc(pg.label)}$`;
  await expect(page.getByTestId('fleet-title')).toHaveText(new RegExp(`${esc(calc.name)} / ${crumb}|${crumb}`));
  const group = sec.groups?.find((g) => g.pages.includes(pg.id));
  if (group) await expect(page.getByTestId(`frow-${group.id}`).locator('.tab.on')).toHaveAttribute('aria-label', pg.label);
  else await expect(page.getByTestId(`ftab-${pg.id}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-testid="fleet-bottom"] a')).toHaveCount(calc.bottom_nav.length);
  await page.getByTestId('fleet-title').click();
  await expect(page.getByTestId('fleet-dropdown')).toContainText(pg.label);
});

test('cloud-tasks: calendar events are list-detail on a tablet only', async ({ page }, info) => {
  await page.goto(`${BASE}/cloud-tasks/calendar/events/`);
  if (isTablet(info.project.name)) await expect(page.getByTestId('tasks-detail')).toBeVisible();
  else await expect(page.getByTestId('tasks-detail')).toBeHidden();
  await shot(page, info, 'tasks-events');
});

test('cloud-c3: home stats and the containers table', async ({ page }, info) => {
  await page.goto(`${BASE}/cloud-c3/`);
  await expect(page.locator('[data-testid="app-body"]')).toContainText('machines');
  await shot(page, info, 'c3-app-home');
  await page.goto(`${BASE}/cloud-c3/containers/table/`);
  await expect(page.getByTestId('c3-list').locator('[data-testid="list-row"]').first()).toBeVisible();
  await shot(page, info, 'c3-app-table');
});

for (const p of ['cloud-calc/calculator/calc/', 'cloud-tasks/tasks/', 'cloud-c3/containers/table/']) {
  test(`a11y: no critical axe violation on ${p}`, async ({ page }) => {
    await page.goto(`${BASE}/${p}`);
    const r = await new AxeBuilder({ page }).analyze();
    const critical = r.violations.filter((v) => v.impact === 'critical');
    expect(critical.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test.describe('light pages', () => {
  test.use({ colorScheme: 'light' });
  test('cloud-tasks on a light device: kit rows take the page ink, not the dark theme\'s white', async ({ page }) => {
    await page.goto(`${BASE}/cloud-tasks/calendar/events/`);
    const rgb = await page.getByTestId('list-row').first().locator('.l').evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
    expect((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toBeLessThan(0.5);
  });
});

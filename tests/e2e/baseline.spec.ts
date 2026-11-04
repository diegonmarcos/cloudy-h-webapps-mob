import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE } from './helpers';

// The web halves of the M4 baseline pairs (scripts/compare-baseline.mjs): the same screens BaselineShots renders on
// Android, captured full viewport at the same size and density, reduced motion (still frames), clock frozen.
// BaselineShots draws the fleet chrome with dark = true (PageBackground.THEME on a dark device): same scheme here.
test.use({ reducedMotion: 'reduce', colorScheme: 'dark' });
const out = (p: string) => { mkdirSync(`tests/results/baseline-web/${p}`, { recursive: true }); return `tests/results/baseline-web/${p}`; };

const SHOTS: [string, string][] = [
  ['island', '/'],
  ['cloud-tabs', '/cloud/'],
  ['kit-cloud', '/_gallery/kit/?theme=cloud'],
  ['kit-cloud_minimalist_black', '/_gallery/kit/?theme=cloud_minimalist_black'],
  ['fleet-cloud-calc', '/cloud-calc/calculator/calc/'],
  ['fleet-cloud-tasks', '/cloud-tasks/tasks/calendar/'],
  ['fleet-cloud-c3', '/cloud-c3/containers/all/all_table/'],
  ['launcher-home', '/'],
  ['launcher-cloud-apps', '/cloud/apps/'],
  ['launcher-notify', '/communication/'],
  ['launcher-boards', '/boards/'],
  ['launcher-phone', '/phone/'],
  ['launcher-c3', '/c3/'],
  ['launcher-config', '/config/'],
];
for (const [name, path] of SHOTS) {
  test(`baseline web ${name}`, async ({ page }, info) => {
    await page.clock.setFixedTime(new Date('2026-10-30T09:41:00Z'));
    await page.goto(`${BASE}${path}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out(info.project.name)}/${name}.png` });
  });
}

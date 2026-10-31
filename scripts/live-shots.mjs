#!/usr/bin/env node
// live-shots.mjs <base-url> <out-dir> <path>... : full-page phone + tablet screenshots of LIVE pages (#1374), plus, per FinTerm table,
// a shot scrolled to the right edge and a JSON line with its geometry (scrollWidth / clientWidth, wrapped name cells), so a review
// can see that every column is reachable and nothing wraps. CI only (live-shots.yml).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, out, ...paths] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const devices = { phone: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }, tablet: { viewport: { width: 800, height: 1280 }, deviceScaleFactor: 2 } };
const browser = await chromium.launch();
const report = [];
for (const [dev, opts] of Object.entries(devices)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  for (const p of paths) {
    const name = `${dev}-${p.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '_')}`;
    await page.goto(base.replace(/\/+$/, '') + p, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    const wraps = page.getByTestId('finterm-table-wrap');
    const n = await wraps.count();
    for (let i = 0; i < n; i++) {
      const w = wraps.nth(i);
      if (!(await w.isVisible())) continue; // a chart's table folded in its <details>
      const g = await w.evaluate((el) => {
        const t = el.querySelector('table');
        const first = [...el.querySelectorAll('tbody td:first-child')];
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, cols: t?.querySelectorAll('thead th').length ?? 0,
          headers: [...(t?.querySelectorAll('thead th') ?? [])].map((h) => h.textContent?.trim()),
          wrappedNames: first.filter((c) => c.getBoundingClientRect().height > 40).map((c) => c.textContent?.trim()),
          clippedCells: [...el.querySelectorAll('td')].filter((c) => c.scrollWidth > c.clientWidth + 1 && c.cellIndex > 0).length,
          fade: !!el.parentElement?.querySelector('[data-testid="finterm-table-fade"]') };
      });
      report.push({ dev, path: p, table: i, ...g });
      await w.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await page.waitForTimeout(400);
      await w.screenshot({ path: `${out}/${name}-table${i}-right.png`, timeout: 10_000 }).catch((e) => console.error(String(e)));
      await w.evaluate((el) => { el.scrollLeft = 0; });
      await w.screenshot({ path: `${out}/${name}-table${i}-left.png`, timeout: 10_000 }).catch((e) => console.error(String(e)));
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/tables.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));

import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const BASE = '/cloud-webapps';
export const isTablet = (name: string) => name.startsWith('tablet');
/** A real touch swipe (touchstart -> touchend 120 ms later), what gestures.ts listens to. */
export async function swipe(page: Page, selector: string, dx: number) {
  await page.evaluate(async ([sel, dx]) => {
    const el = document.querySelector(sel as string) as HTMLElement;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const t = (cx: number) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x)], changedTouches: [t(x)], bubbles: true }));
    await new Promise((res) => setTimeout(res, 120));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x + (dx as number))], bubbles: true }));
  }, [selector, dx] as const);
}

/** Cloud > Apps tile groups as declared (nav.json, mirrored from aa_cloud-superapp/build.json): specs read names and order here, never hard-code them. */
type Tile = { id: string; label: string; separator?: boolean };
export const cloudGroups: { title: string; tiles: Tile[] }[] = (JSON.parse(readFileSync('packages/cloudy-ui/nav/nav.json', 'utf8')).superapp.sections as { id: string; tile_groups?: { title: string; tiles: Tile[] }[] }[])
  .find((s) => s.id === 'cloud')!.tile_groups!;
/** The declared group holding tile `id` (its title, as the shell's data-group). */
export const groupOf = (id: string) => cloudGroups.find((g) => g.tiles.some((t) => t.id === id))!.title;

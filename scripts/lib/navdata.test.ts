import { describe, expect, it } from 'vitest';
import nav from '../../packages/cloudy-ui/nav/nav.json';
import routesJson from '../../packages/cloudy-ui/nav/routes.json';
import targetsJson from '../../packages/cloudy-ui/nav/targets.json';
import appIds from '../../packages/cloudy-ui/nav/app-ids.json';
import icons from '../../packages/cloudy-ui/icons/icons.json';

type Page = { id: string; pages?: Page[] };
const paths = new Set(routesJson.routes.map((r: { path: string }) => r.path));

describe('nav.json', () => {
  it('has the 16 SuperApp sections and the 5-item bottom island', () => {
    expect(nav.superapp.sections.length).toBe(16);
    expect(nav.superapp.bottom_nav).toEqual(['communication', 'boards', 'home', 'cloud', 'phone']);
  });
  it('has at least 22 fleet apps with declared sections, every page routed', () => {
    const declared = nav.apps.filter((a: { kind: string }) => a.kind === 'app');
    expect(declared.length).toBeGreaterThanOrEqual(22);
    const walk = (prefix: string, pages: Page[] = []) => { for (const p of pages) { expect(paths.has(`${prefix}${p.id}/`), `${prefix}${p.id}/`).toBe(true); walk(`${prefix}${p.id}/`, p.pages); } };
    for (const a of declared as { id: string; sections: Page[] }[]) for (const s of a.sections) { expect(paths.has(`${a.id}/${s.id}/`)).toBe(true); walk(`${a.id}/${s.id}/`, s.pages); }
  });
  it('every SuperApp page is routed', () => {
    for (const s of nav.superapp.sections as Page[]) for (const p of s.pages ?? []) if (s.id !== 'home') expect(paths.has(`${s.id}/${p.id}/`), `${s.id}/${p.id}`).toBe(true);
  });
  it('every target resolves to a route', () => {
    for (const [t, p] of Object.entries(targetsJson.targets)) expect(paths.has(p as string), t).toBe(true);
  });
  it('app ids and SuperApp section ids never collide', () => {
    const sections = new Set(nav.superapp.sections.map((s: { id: string }) => s.id));
    for (const id of appIds) expect(sections.has(id), id).toBe(false);
  });
  it('icon sprites: 172 SuperApp glyphs, the UiIcons catalog, a fallback', () => {
    expect(icons.sa.length).toBe(172);
    expect(Object.keys(icons.ui).length).toBeGreaterThanOrEqual(150);
    expect(icons.fallback).toBe('tab');
  });
});

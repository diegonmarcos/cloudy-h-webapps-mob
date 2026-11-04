import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error plain .mjs generator
import { resolvePhoneApps, OUT } from './gen-phone-apps.mjs';

// #1466: Phone > WebApps. The phone apps' web URLs are GENERATED (gen-phone-apps.mjs, drift-checked in CI) from the Android data file;
// the fleet's own apps live in src/apps/cloudy-apps/, the phone apps' data in src/apps/phone-apps/.
const root = join(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const gen = read(OUT) as { groups: { title: string; tiles: { id: string; label: string; url: string | null }[] }[] };
const tiles = gen.groups.flatMap((g) => g.tiles);
const nav = read('packages/cloudy-ui/nav/nav.json') as { superapp: { sections: { id: string; pages?: { id: string; webapps_base?: string }[] }[] } };

describe('gen-phone-apps resolvePhoneApps', () => {
  const decl = { groups: [{ title: 'A', apps: [{ pkg: 'x.web', label: 'X', url: 'https://x.example.com/app' }, { pkg: 'x.none', label: 'None', url: null }] }] };
  it('keeps the url, nulls the missing one, one tile per package', () => {
    expect(resolvePhoneApps(decl).groups[0].tiles).toEqual([{ id: 'x.web', label: 'X', url: 'https://x.example.com/app' }, { id: 'x.none', label: 'None', url: null }]);
  });
  it('rejects a duplicate package, a non-https url and a missing label', () => {
    expect(() => resolvePhoneApps({ groups: [{ title: 'A', apps: [decl.groups[0].apps[0], decl.groups[0].apps[0]] }] })).toThrow(/duplicate/);
    expect(() => resolvePhoneApps({ groups: [{ title: 'A', apps: [{ pkg: 'p', label: 'P', url: 'http://p.example.com' }] }] })).toThrow(/https/);
    expect(() => resolvePhoneApps({ groups: [{ title: 'A', apps: [{ pkg: 'p', url: null }] }] })).toThrow(/pkg\/label/);
  });
});

describe('phone apps web data', () => {
  it('declares apps, each https or url-less (greyed), with the common ones mapped', () => {
    expect(tiles.length).toBeGreaterThan(20);
    for (const t of tiles) if (t.url) expect(t.url, t.id).toMatch(/^https:\/\//);
    expect(tiles.some((t) => !t.url), 'some app has no web version').toBe(true);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length);
    const url = (label: string) => tiles.find((t) => t.label === label)?.url;
    expect(url('Gmail')).toContain('mail.google.com');
    expect(url('WhatsApp Business')).toContain('web.whatsapp.com');
    expect(url('Termux')).toBeNull();
  });
  it('is Phone > WebApps between Apps and Configs in the generated nav, with its route', () => {
    const phone = nav.superapp.sections.find((s) => s.id === 'phone')!;
    expect(phone.pages!.map((p) => p.id)).toEqual(['apps', 'webapps', 'configs']);
    expect(read('packages/cloudy-ui/nav/routes.json').routes.some((r: { path: string }) => r.path === 'phone/webapps/')).toBe(true);
    expect(read('packages/cloudy-ui/nav/targets.json').targets['page:phone/webapps']).toBe('phone/webapps/');
  });
});

describe('source folders: cloudy-apps/ (fleet apps) | phone-apps/ (phone apps)', () => {
  const apps = join(root, 'sites/cloudy-webapps/src/apps');
  it('every fleet app body sits under cloudy-apps/, the phone data under phone-apps/', () => {
    expect(existsSync(join(apps, 'cloudy-apps/_generic/index.svelte'))).toBe(true);
    expect(existsSync(join(apps, 'phone-apps/phone-apps.json'))).toBe(true);
    const stray = readdirSync(apps).filter((d) => !['cloudy-apps', 'phone-apps', 'superapp'].includes(d));
    expect(stray, 'app folders outside cloudy-apps/').toEqual([]);
  });
  it('the route loaders look in cloudy-apps/', () => {
    for (const f of ['+page.ts', '+page.server.ts']) expect(readFileSync(join(root, 'sites/cloudy-webapps/src/routes/[...path]', f), 'utf8')).toContain('apps/cloudy-apps/');
  });
  it('the Tiles grid draws a url-less tile greyed and disabled', () => {
    const t = readFileSync(join(root, 'packages/cloudy-ui/src/shell/Tiles.svelte'), 'utf8');
    expect(t).toContain('class:grey={t.grey}');
    expect(t).toContain('aria-disabled');
    expect(readFileSync(join(root, 'sites/cloudy-webapps/src/lib/server/nav.ts'), 'utf8')).toContain('grey: !t.url');
  });
});

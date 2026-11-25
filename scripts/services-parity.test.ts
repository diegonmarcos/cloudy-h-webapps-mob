import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// #1815: the Services section of the webapps (Cloud > Apps tile group and Phone > Services folders) matches the Android launcher's
// Services row (snapshot in fixtures/launcher-services.json) and keeps every previous entry (rule 16: nothing removed).
const root = join(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const snap = read('scripts/fixtures/launcher-services.json');
type Tile = { id: string; label: string; icon?: string; separator?: boolean };
const nav = read('packages/cloudy-ui/nav/nav.json');
const cloudGroups = nav.superapp.sections.find((s: { id: string }) => s.id === 'cloud').tile_groups as { title: string; tiles: Tile[] }[];
const tiles: Tile[] = cloudGroups.filter((g) => g.title.startsWith('Services')).flatMap((g) => g.tiles);   // Services · City, Services · Leisure
const allTiles: Tile[] = cloudGroups.flatMap((g) => g.tiles);
const phoneSection = nav.superapp.sections.find((s: { phone_app_groups?: unknown }) => s.phone_app_groups);
const phone = { folders: phoneSection.phone_app_groups.filter((g: { title: string }) => g.title.startsWith('Services')).flatMap((g: { folders?: unknown[] }) => g.folders ?? []) };
const phoneAll = { folders: phoneSection.phone_app_groups.flatMap((g: { folders?: unknown[] }) => g.folders ?? []) };
const sprite = readFileSync(join(root, 'packages/cloudy-ui/icons/sprite-sa.svg'), 'utf8');
const entries = tiles.filter((t) => !t.separator);

describe('Services parity with the launcher', () => {
  it('every launcher Services entry is present, in order, with its label and icon', () => {
    expect(entries.slice(0, snap.tiles.length).map(({ id, label, icon }) => ({ id, label, icon }))).toEqual(snap.tiles);
  });
  it('every launcher icon has its artwork in the icon sprite', () => {
    for (const t of snap.tiles) expect(sprite, t.icon).toContain(`id="sa-${t.icon}"`);
  });
  it('every launcher entry is also a Phone > Services folder with the same icon', () => {
    const f = phone.folders.map((x: { icon_res: string }) => x.icon_res);
    for (const t of snap.tiles) expect(f, t.label).toContain(t.icon);
  });
  it('every previous Services tile is still present (rule 16)', () => {
    const ids = allTiles.map((t) => t.id);
    for (const id of snap.previous.tile_ids) expect(ids, id).toContain(id);
  });
  it('every previous Phone > Services folder is still present, by label or as its launcher rename', () => {
    const labels = phoneAll.folders.map((x: { label: string }) => x.label);
    const renamed: Record<string, string> = { 'Mobility & Travel': 'Transports' };
    for (const l of snap.previous.phone_labels) expect(labels, l).toContain(renamed[l] ?? l);
  });
});

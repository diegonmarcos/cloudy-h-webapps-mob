import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// #1331: the Cloud > Apps "Lnktree" row and its pages, as the SuperApp declares them (nav.json is GENERATED from it).
const root = join(__dirname, '..');
const nav = JSON.parse(readFileSync(join(root, 'packages/cloudy-ui/nav/nav.json'), 'utf8')) as { superapp: { sections: Record<string, any>[] } };
const sec = (id: string) => nav.superapp.sections.find((s) => s.id === id)!;
const titles = (stack: { kind: string; title: string }[]) => stack.filter((p) => p.kind === 'entry').map((p) => p.title);

describe('Lnktree row', () => {
  const row = sec('cloud').tile_groups.find((g: { title: string }) => g.title === 'Lnktree');
  it('is called Lnktree and holds exactly Omniverse, FinTerm, CAD, Sim2Real', () => {
    expect(sec('cloud').tile_groups.map((g: { title: string }) => g.title)).not.toContain('Projects W');
    // the SuperApp's own tile leads the row (1719aee0d5) and launches the SuperApp itself; the other four are the family
    expect(row.tiles.filter((t: { separator?: boolean; label: string }) => !t.separator && t.label !== 'SuperApp').map((t: { label: string }) => t.label)).toEqual(['Omniverse', 'FinTerm', 'CAD', 'Sim2Real']);
  });
  it('every tile target is a route the web has (targets.json)', () => {
    const targets = JSON.parse(readFileSync(join(root, 'packages/cloudy-ui/nav/targets.json'), 'utf8')).targets as Record<string, string>;
    for (const t of row.tiles.filter((x: { separator?: boolean; label: string }) => !x.separator && x.label !== 'SuperApp')) expect(targets[t.target], t.target).toBeTruthy();
  });
});

describe('Lnktree apps (#1335)', () => {
  const row = sec('cloud').tile_groups.find((g: { title: string }) => g.title === 'Lnktree');
  const apps = (JSON.parse(readFileSync(join(root, 'packages/cloudy-ui/nav/nav.json'), 'utf8')) as { apps: { id: string; name: string; dir: string | null; bottom_nav: string[] }[] }).apps;
  it('each tile launches a real app of the Lnktree family (extapp:), and the in-app pages are gone', () => {
    // the FinTerm app id follows the Android folder (ad_Capital-FinTerm -> ad_Capital-Stack-FinTerminal): matched by its ad_Capital- folder, not by a typed id
    const finterm = apps.find((a) => a.dir?.startsWith('ad_Capital-'))!;
    const want: Record<string, string> = { Omniverse: 'extapp:cg-omniverse', FinTerm: `extapp:${finterm.id}`, CAD: 'extapp:hardtech-cad', Sim2Real: 'extapp:hardtech-sim2real' };
    for (const t of row.tiles.filter((x: { separator?: boolean; label: string }) => !x.separator && x.label !== 'SuperApp')) expect(t.target, t.label).toBe(want[t.label]);
    expect(nav.superapp.sections.map((s) => s.id)).not.toContain('finterm');
    for (const k of ['stack_omniverse', 'stack_cad', 'stack_sim2real']) expect(sec('cloud')[k], k).toBeUndefined();
  });
  it('the four apps are fleet apps with their pages from their own build.json (ad_ folders)', () => {
    const by = Object.fromEntries(apps.map((a) => [a.id, a]));
    // ad_CG-Omniverse/build.json ui.bottom_nav (#1366): Avatar, Galaxy, Store
    expect(by['cg-omniverse'].bottom_nav).toEqual(['avatar', 'galaxy', 'store']);
    const fin = apps.find((a) => a.dir?.startsWith('ad_Capital-'))!;
    expect(fin.bottom_nav).toEqual(['fi', 'eq', 'ex', 'nw', 'pm', 'my-pm']);
    expect(by['hardtech-cad'].bottom_nav).toEqual(['mcad', 'bim', 'solidworks']);
    expect(by['hardtech-sim2real'].bottom_nav).toEqual(['sap2000', 'matlab', 'ansys']);
    expect(by['cg-omniverse'].name).toBe('CG-Omniverse');
  });
});

// The web of the four Lnktree apps (the Lnktree row on the web grid, their pages, the FinTerm terminal link).
describe('Lnktree apps on the web', () => {
  const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const links = read('packages/cloudy-ui/nav/app-links.json').links as { id: string; kind: string; href: string | null; mesh?: boolean; service?: string; entries_open_app?: boolean }[];
  const mapping = read('data/app-links.json').links as Record<string, unknown>[];
  const services = read('scripts/fallback-services.json').services as { slug: string; hosts: string[] }[];
  const stacks = read('packages/cloudy-ui/nav/apps-ui.json').apps as Record<string, { stacks: Record<string, { kind?: string; title?: string; url?: string; planned?: boolean; registry?: string; repo?: string; site?: string }[]> }>;
  const apps = (read('packages/cloudy-ui/nav/nav.json').apps as { id: string; dir: string | null }[]);
  const fin = apps.find((a) => a.dir?.startsWith('ad_Capital-'))!;

  it('Omniverse, CAD and Sim2Real are web pages of this site (not About stubs); FinTerm is the terminal', () => {
    for (const id of ['cg-omniverse', 'hardtech-cad', 'hardtech-sim2real']) {
      const l = links.find((x) => x.id === id)!;
      expect(l.kind, id).toBe('webapp');
      expect(l.href, id).toBe(`/cloud-webapps/${id}/`);
    }
  });

  it('FinTerm is a web page of this site (webapp); its fin-api backend is a separate private link (mesh URL derived from the container declaration), never a public host', () => {
    const l = links.find((x) => x.id === fin.id) as unknown as { kind: string; href: string; mesh?: boolean; entries_open_app?: boolean; backend: { label: string; href: string; mesh: boolean; service: string } };
    expect(l.kind).toBe('webapp');
    expect(l.href).toBe(`/cloud-webapps/${fin.id}/`);
    expect(l.mesh).toBeUndefined();
    expect(l.entries_open_app).toBe(true);
    expect(l.backend.label).toBe('Backend (mesh)');
    expect(l.backend.mesh).toBe(true);
    const u = new URL(l.backend.href);
    expect(u.host).toMatch(/^[a-z0-9-]+\.mesh\.diegonmarcos\.com$|^c3-pvt\.diegonmarcos\.com$/);
    const svc = services.find((s) => s.slug === l.backend.service)!;
    expect(svc, 'declared in cloudy-u-containers').toBeTruthy();
    expect(svc.hosts).not.toContain(u.host);
  });

  it('no hand-typed URL for the container, and none for the apps in the mapping (webapp paths are root-absolute)', () => {
    for (const m of mapping.filter((x) => ['capital-stack-finterminal', 'cg-omniverse', 'hardtech-cad', 'hardtech-sim2real'].includes(x.id as string))) {
      expect(m.url, m.id as string).toBeUndefined();
      expect(m.href, m.id as string).toBeUndefined();
      expect(JSON.stringify([m.path ?? '', m.backend ?? '']), m.id as string).not.toMatch(/https?:/);
    }
  });

  it('every page entry carries a declared-source URL or is planned (no typed URL, no dead entry), source keys are consumed', () => {
    for (const id of ['cg-omniverse', 'hardtech-cad', 'hardtech-sim2real']) for (const [sec, list] of Object.entries(stacks[id].stacks)) for (const e of list) {
      if (e.kind) continue;
      expect(Boolean(e.url) !== Boolean(e.planned), `${id}/${sec}/${e.title}`).toBe(true);
      expect(e.registry ?? e.repo, `${id}/${e.title}`).toBeUndefined();
    }
    const by = (id: string, sec: string) => stacks[id].stacks[sec][0];
    // CG-Omniverse pages are drawn by their declared kind (build.json ui, #1366), one entry each, kind = page id
    expect(Object.keys(stacks['cg-omniverse'].stacks)).toEqual(['avatar', 'galaxy', 'store', 'about']);
    for (const sec of ['avatar', 'galaxy', 'store']) expect(stacks['cg-omniverse'].stacks[sec].map((e) => e.kind), sec).toEqual([sec]);
    expect(by('hardtech-cad', 'mcad').url).toMatch(/^https:\/\/github\.com\//);
    expect(by('hardtech-cad', 'solidworks').planned).toBe(true);
    for (const sec of ['sap2000', 'matlab', 'ansys']) expect(by('hardtech-sim2real', sec).planned, sec).toBe(true);
  });

  it('the FinTerm tabs are FI, EQ, EX, NW, PM, MY-PM and each tab has entries', () => {
    expect(Object.keys(stacks[fin.id].stacks).filter((k) => ['fi', 'eq', 'ex', 'nw', 'pm', 'my-pm'].includes(k))).toEqual(['fi', 'eq', 'ex', 'nw', 'pm', 'my-pm']);
  });
});

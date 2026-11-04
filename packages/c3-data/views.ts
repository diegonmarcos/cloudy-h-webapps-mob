// Cloud C3 (ac_cloud-c3) on the web: the six sections over the C3 snapshot (@cloudy/c3-data, imported from the old /cloud/
// portal, redacted). The phone reads the same shapes live from the c3-infra-api (ui.c3_ops.base_url).
import { dataset } from './index';

type Vm = { ip?: string; description?: string; specs?: { cpu?: number; ram_gb?: number; disk_gb?: number; shape?: string; cloud_zone?: string; arch?: string }; wg_role?: string; ssh_alias?: string };
const vms = () => Object.entries(((dataset('c3-topology') as { vms?: Record<string, Vm> }).vms) ?? {});
const services = () => dataset('c3-services') as { name: string; domain?: string; vm?: string; alias?: string; category?: string }[];
const health = () => dataset('c3-health-tier1') as { vm: string; alias: string; reachable: boolean; latencyMs?: number }[];

export type Row = { title: string; subtitle: string; meta: string; state: 'ok' | 'warn' | 'bad' | 'idle' | 'busy'; lead: string; detail?: [string, string][] };
/** The rows of one Cloud C3 page (Android ac_cloud-c3 section page id), read from the snapshot. */
export function rows(pageId: string | null): Row[] {
  // #1454 Containers: `<project>_topology` / `<project>_table` pages (All, Cloudy, CG, Capital, Hardtech, Cloud-me) read the one snapshot
  const page = pageId?.replace(/^(all|cloudy|cg|capital|hardtech|cloud_me)_(?=topology$|table$)/, '') ?? null;
  switch (page) {
    case 'providers': {
      const v = Object.keys((dataset('c3-topology') as { vpss?: Record<string, unknown> }).vpss ?? {});
      return v.map((p) => ({ title: p, subtitle: 'provider', meta: '', state: 'idle', lead: p[0].toUpperCase() }));
    }
    case 'machines': case 'infrastructure':
      return vms().map(([id, m]) => ({ title: m.ssh_alias ?? id, subtitle: m.description ?? '', meta: [m.specs?.cpu && `${m.specs.cpu} vCPU`, m.specs?.ram_gb && `${m.specs.ram_gb} GB`].filter(Boolean).join(' · '),
        state: health().find((h) => h.vm === id)?.reachable ? 'ok' : 'idle', lead: '▣',
        detail: [['Shape', m.specs?.shape ?? '-'], ['Zone', m.specs?.cloud_zone ?? '-'], ['Arch', m.specs?.arch ?? '-'], ['Mesh role', m.wg_role ?? '-']] }));
    case 'storage':
      return vms().map(([id, m]) => ({ title: m.ssh_alias ?? id, subtitle: `${m.specs?.disk_gb ?? 0} GB disk`, meta: m.specs?.cloud_zone ?? '', state: 'idle', lead: '◫' }));
    case 'domains': {
      const recs = ((dataset('c3-cloudflare-dns') as { records?: { name: string; type: string; content?: string }[] }).records) ?? [];
      return recs.slice(0, 80).map((r) => ({ title: r.name, subtitle: r.type, meta: '', state: 'idle', lead: r.type[0] }));
    }
    case 'topology': case 'orchestration': {
      const byVm = new Map<string, number>();
      for (const s of services()) byVm.set(s.alias ?? s.vm ?? '?', (byVm.get(s.alias ?? s.vm ?? '?') ?? 0) + 1);
      return [...byVm].map(([vm, n]) => ({ title: vm, subtitle: `${n} containers`, meta: '', state: 'ok', lead: '▦' }));
    }
    case 'table': case 'service':
      return services().map((s) => ({ title: s.name, subtitle: s.domain ?? '', meta: s.alias ?? s.vm ?? '', state: 'idle', lead: (s.category ?? 's')[0].toUpperCase(),
        detail: [['Domain', s.domain ?? '-'], ['VM', s.alias ?? s.vm ?? '-'], ['Category', s.category ?? '-']] }));
    case 'health': case 'observability':
      return health().map((h) => ({ title: h.alias, subtitle: h.reachable ? 'reachable' : 'unreachable', meta: h.latencyMs ? `${h.latencyMs} ms` : '', state: h.reachable ? 'ok' : 'bad', lead: '●' }));
    case 'mesh': case 'network': case 'electronics':
      return vms().map(([id, m]) => ({ title: m.ssh_alias ?? id, subtitle: `WireGuard ${m.wg_role ?? ''}`.trim(), meta: '', state: 'idle', lead: '⇄' }));
    case 'dagu': case 'release': {
      const w = dataset('c3-workflows') as { workflows?: { name?: string; status?: string }[] } | { name?: string }[];
      const list = Array.isArray(w) ? w : w.workflows ?? [];
      return list.slice(0, 60).map((x) => ({ title: x.name ?? 'workflow', subtitle: (x as { status?: string }).status ?? '', meta: '', state: 'idle', lead: '↻' }));
    }
    default: return [];
  }
}

/** The body data of a Cloud C3 page: the Home stat tiles, or the page's rows. */
export function c3View(section: string | null, page: string | null, listDetail: boolean) {
  const s = dataset('c3-cloud-summary') as Record<string, { instances?: unknown[]; costs?: { monthly_usd?: number } }>;
  const home = section === 'home' ? {
    stats: [
      { value: String(vms().length), caption: 'machines', state: 'ok' },
      { value: String(services().length), caption: 'containers declared', state: 'ok' },
      { value: String(health().filter((h) => h.reachable).length) + '/' + health().length, caption: 'reachable (tier 1)', state: health().every((h) => h.reachable) ? 'ok' : 'warn' },
      { value: '$' + Object.values(s).reduce((n, p) => n + (p.costs?.monthly_usd ?? 0), 0), caption: 'monthly cost', state: 'ok' },
    ],
  } : null;
  return { section, page, home, rows: rows(page), listDetail, snapshot: 'snapshot of the c3-infra-api, imported from the old control centre' };
}

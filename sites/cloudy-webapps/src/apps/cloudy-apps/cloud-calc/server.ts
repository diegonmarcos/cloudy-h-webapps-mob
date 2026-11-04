// Build-time data of the Cloud Calc mimic: the modes of the page shown (build.json ui.modes where tab = page id), with
// their declared keypads. Only the slice the page renders reaches the client.
import appsUi from '@cloudy/ui/nav/apps-ui.json';
import type { AppView } from '$lib/server/nav';

type Key = string | { label: string; insert?: string; action?: string };
export type Mode = { id: string; label: string; short: string; icon: string; kind: string; keys: Key[][] | null; plot: { default: string; xmin: number; xmax: number; steps: number } | null; forms: { id: string; label: string; fields: { id: string; label: string; default: string }[] }[] };
export function load(view: AppView) {
  const modes = ((appsUi.apps as Record<string, { modes?: Record<string, unknown>[] }>)['cloud-calc']?.modes ?? []) as Record<string, unknown>[];
  const tab = view.sub ?? view.page;
  return {
    tab,
    modes: modes.filter((m) => m.tab === tab).map((m) => ({
      id: m.id, label: m.label, short: (m.short as string) ?? '', icon: (m.icon as string) ?? '', kind: m.kind,
      keys: (m.keys as Key[][]) ?? null, plot: (m.plot as Mode['plot']) ?? null,
      forms: ((m.forms as Mode['forms']) ?? []).map((f) => ({ id: f.id, label: f.label, fields: f.fields })),
    })) as Mode[],
  };
}

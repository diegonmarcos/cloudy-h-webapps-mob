// #1462 the PM Homepage organised by risk: the declared tabs (finterm.json risk_tabs: All | A | B | C | D) and the groups a tab shows.
// Mirrors RiskTabs.kt of the APK: in All every tier is a section with its header (cards with no tier first, no header); a tier tab shows its own cards alone.
export type RiskTab = { id: string; label: string; header?: string; equity_max?: number };
export type RiskCard = { risk?: string };
export const RISK_ALL = 'all';
export function riskGroups<T extends RiskCard>(cards: T[], tabs: RiskTab[], selected: string): { header: string; cards: T[] }[] {
  if (selected !== RISK_ALL) return [{ header: '', cards: cards.filter((c) => (c.risk ?? '') === selected) }];
  const none = cards.filter((c) => !c.risk);
  return [...(none.length ? [{ header: '', cards: none }] : []),
    ...tabs.filter((t) => t.id !== RISK_ALL).map((t) => ({ header: t.header ?? t.label, cards: cards.filter((c) => c.risk === t.id) })).filter((g) => g.cards.length)];
}

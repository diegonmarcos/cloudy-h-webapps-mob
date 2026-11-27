export type NavItem = { id: string; label: string; icon: string; href: string };
export type Tab = { id: string; label: string; href: string | null; action?: boolean; separatorBefore?: boolean };
export type TileItem = { id: string; label: string; icon: string | null; href: string | null; external?: boolean; separatorAfter?: boolean; missing?: boolean; mesh?: boolean; grey?: boolean };
export type TileGroup = { title: string; glyph?: string; tiles: TileItem[] };
import type { DrawerRow } from './drawerRows';
export type ShellData = {
  bottom: NavItem[]; drawer: DrawerRow[]; homeHref: string; orbHref: string | null; islandHref: string | null;
  chips: { label: string; on: boolean; dots: number }[]; right: string[]; battery: number;
  app: { name: string; build: string; stamp: string; user: { name: string; email: string; initials: string; mode: string } };
};
export type KitState = 'ok' | 'warn' | 'bad' | 'idle' | 'busy';

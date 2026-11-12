import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripChips, stripRight, stripShowsBattery, type StatusBarDecl } from '../packages/cloudy-ui/src/shell/statusBar';

// #1332: the home status bar and the Tasks popup, as the SuperApp declares them (nav/status-bar.json is GENERATED from it).
const root = join(__dirname, '..');
const gen = JSON.parse(readFileSync(join(root, 'packages/cloudy-ui/nav/status-bar.json'), 'utf8')) as {
  statusBar: StatusBarDecl; tasksPopup: { label: string; default_view: string; months: { count: number; before: number; after: number }; tables: Record<string, unknown> };
  onehandPage: { sections: { label: string }[] };
};
const ids = (d: StatusBarDecl, pos: string) => d.elements.filter((e) => e.position === pos).sort((a, b) => a.order - b.order).map((e) => e.id);

describe('status bar declaration', () => {
  it('declares the left network cluster in NetworkSections order, the clock centre, R/S/C and the battery right', () => {
    expect(ids(gen.statusBar, 'left')).toEqual(['cellular', 'wifi', 'bluetooth', 'mesh', 'kde', 'adb', 'data', 'hotspot', 'gps']);
    expect(ids(gen.statusBar, 'centre')).toEqual(['clock']);
    expect(ids(gen.statusBar, 'right')).toEqual(['ram', 'storage', 'cpu', 'fps', 'battery']);
    expect(gen.statusBar.row_height_dp).toBe(26);
  });
  it('the replica draws the declared order: swapping two declared orders swaps the chips', () => {
    const mock = { cellular: { on: true, dots: 4 }, wifi: { on: true, dots: 3 } };
    const labels = (d: StatusBarDecl) => stripChips(d, mock).map((c) => c.label);
    expect(labels(gen.statusBar).slice(0, 3)).toEqual(['5G', 'WiFi', 'BT']);
    const swapped: StatusBarDecl = { ...gen.statusBar, elements: gen.statusBar.elements.map((e) => e.id === 'cellular' ? { ...e, order: 2 } : e.id === 'wifi' ? { ...e, order: 1 } : e) };
    expect(labels(swapped).slice(0, 3)).toEqual(['WiFi', '5G', 'BT']);
  });
  it('a hidden element leaves the bar', () => {
    const hid: StatusBarDecl = { ...gen.statusBar, elements: gen.statusBar.elements.map((e) => e.id === 'kde' || e.id === 'battery' ? { ...e, visible: false } : e) };
    expect(stripChips(hid, {}).map((c) => c.label)).not.toContain('KDE');
    expect(stripShowsBattery(hid)).toBe(false);
    expect(stripShowsBattery(gen.statusBar)).toBe(true);
    expect(stripRight(gen.statusBar, { ram: '62%', storage: '48%', cpu: '17%' })).toEqual(['R 62%', 'S 48%', 'C 17%']);
  });
});

describe('Tasks popup declaration', () => {
  it('is Tasks, opens on the calendar, shows 3 months and holds the Agenda and Todo tables', () => {
    expect(gen.tasksPopup.label).toBe('Tasks');
    expect(gen.tasksPopup.default_view).toBe('calendar');
    expect(gen.tasksPopup.months).toEqual({ count: 3, before: 1, after: 1 });
    expect(Object.keys(gen.tasksPopup.tables)).toEqual(['agenda', 'todo']);
  });
  it('the One-Hand index lists Stars, Edge menu, Floating menu, Home Gestures, Status Bar', () => {
    expect(gen.onehandPage.sections.map((s) => s.label)).toEqual(['Stars', 'Edge menu', 'Floating menu', 'Home Gestures', 'Status Bar']);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: vi.fn(() => true), closeContextMenuGlobal: vi.fn() }));

import { fogAreaList } from '../../src/app/fog/fogAreas';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { fogMenuAt, fogMenuOffered, type FogMenu } from '../../src/app/pixi/fog/fogMenu';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { Point } from '../../src/app/types/visionTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** A hall painted with a rectangle, a brush stroke that runs into it, and a blob that lies apart. */
const IN_HALL = { x: 150, y: 150 };
const IN_STROKE = { x: 400, y: 150 };
const IN_BLOB = { x: 600, y: 600 };
const OPEN = { x: 900, y: 100 };

interface Scene {
  store: ViewAtlasStore;
  coverage: () => FogCoverage;
  menu: (point: Point) => FogMenu | null;
  /** Chooses the entry named `label` of the menu at `point`. */
  choose: (point: Point, label: string) => void;
  steps: () => number;
  undo: () => void;
}

function scene(): Scene {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-menu-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 100, y: 100, width: 200, height: 100 });
  store.getState().addFogOperation({ type: 'brush', isErasing: false, points: [{ x: 290, y: 150 }, IN_STROKE], brushRadius: 20 });
  store.getState().addFogOperation({ type: 'brush', isErasing: false, points: [IN_BLOB], brushRadius: 40 });
  const coverage = (): FogCoverage => fogCoverage(store.getState().objects.fog);
  const menu = (point: Point): FogMenu | null => fogMenuAt(store, coverage, point);
  const history = getHistoryStore(store)!;
  return {
    store, coverage, menu,
    choose: (point, label) => {
      const entry = menu(point)?.entries.find((candidate) => candidate.type === 'item' && candidate.label === label);
      expect(entry).toBeDefined();
      if (entry?.type === 'item') entry.onClick();
    },
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
  };
}

/** The entries as label, icon and whether they are told apart as destructive. */
const entries = (menu: FogMenu | null): unknown[] => (menu?.entries ?? []).map((entry) => (entry.type === 'item' ? [entry.label, entry.icon, entry.destructive === true] : null));
const ON_FOG = [['Reveal', 'eye', false], ['Delete', 'trash-2', true]];
const ON_REVEALED = [['Hide', 'eye-off', false], ['Delete', 'trash-2', true]];

describe('the entries of the fog\'s menu', () => {
  it('are Reveal, then Delete, on fog, whatever painted it, and act on the whole body that is outlined', () => {
    const { menu } = scene();
    for (const place of [IN_HALL, IN_STROKE, IN_BLOB]) expect(entries(menu(place))).toEqual(ON_FOG);
    // The hall and the stroke that runs into it are one object: the same outline from either.
    expect(menu(IN_HALL)!.outlines).toHaveLength(1);
    expect(menu(IN_HALL)!.outlines).toEqual(menu(IN_STROKE)!.outlines);
    expect(menu(IN_BLOB)!.outlines[0]!.every((corner) => Math.hypot(corner.x - IN_BLOB.x, corner.y - IN_BLOB.y) < 41)).toBe(true);
  });

  it('are Hide, then Delete, on the open ground of fog that was revealed, and none on open ground elsewhere', () => {
    const { store, coverage, menu, choose } = scene();
    expect(menu(OPEN)).toBeNull();
    expect(fogMenuOffered(store, coverage(), OPEN)).toBe(false);
    choose(IN_HALL, 'Reveal');
    for (const place of [IN_HALL, IN_STROKE]) {
      expect(entries(menu(place))).toEqual(ON_REVEALED);
      expect(fogMenuOffered(store, coverage(), place)).toBe(true);
    }
    expect(entries(menu(IN_BLOB))).toEqual(ON_FOG);
    expect(menu(OPEN)).toBeNull();
  });

  it('are none where the fog cannot be worked out', () => {
    const { store } = scene();
    expect(fogMenuAt(store, () => null, IN_HALL)).toBeNull();
    expect(fogMenuOffered(store, null, IN_HALL)).toBe(false);
  });
});

describe('what the fog\'s menu does', () => {
  it('Reveal takes the whole body away, the blob apart from it stays, and Hide on its ground brings it back as it was', () => {
    const { store, coverage, choose, steps, undo } = scene();
    const before = coverage().shape;
    const from = steps();
    choose(IN_STROKE, 'Reveal');
    expect(steps()).toBe(from + 1);
    expect([coverage().covers(IN_HALL), coverage().covers(IN_STROKE), coverage().covers(IN_BLOB)]).toEqual([false, false, true]);
    // One revealing operation is remembered, and no fog carries a mark.
    expect(fogAreaList(store.getState().objects.fog)).toEqual([expect.objectContaining({ type: 'lasso', isErasing: true, area: {} })]);

    choose(IN_HALL, 'Hide');
    expect(steps()).toBe(from + 2);
    expect(coverage().shape).toEqual(before);
    expect(fogAreaList(store.getState().objects.fog)).toEqual([]);
    expect(Object.values(store.getState().objects.fog).some((operation) => 'area' in operation)).toBe(false);
    // Fog again, it is the one object it was.
    expect(entries(fogMenuAt(store, coverage, IN_HALL))).toEqual(ON_FOG);
    undo();
    undo();
    expect(coverage().shape).toEqual(before);
  });

  it('Delete on fog removes the whole body for good: nothing is remembered and its ground has no menu', () => {
    const { store, coverage, menu, choose, steps, undo } = scene();
    const before = coverage().shape;
    const from = steps();
    choose(IN_HALL, 'Delete');
    expect(steps()).toBe(from + 1);
    expect([coverage().covers(IN_HALL), coverage().covers(IN_STROKE), coverage().covers(IN_BLOB)]).toEqual([false, false, true]);
    expect(fogAreaList(store.getState().objects.fog)).toEqual([]);
    expect([menu(IN_HALL), menu(IN_STROKE)]).toEqual([null, null]);
    undo();
    expect(coverage().shape).toEqual(before);
    expect(entries(menu(IN_HALL))).toEqual(ON_FOG);
  });

  it('Delete on revealed ground forgets it: the ground stays open and has no menu, and undo brings the menu back', () => {
    const { store, coverage, menu, choose, steps, undo } = scene();
    choose(IN_HALL, 'Reveal');
    const from = steps();
    choose(IN_HALL, 'Delete');
    expect(steps()).toBe(from + 1);
    expect(fogAreaList(store.getState().objects.fog)).toEqual([]);
    expect([coverage().covers(IN_HALL), coverage().covers(IN_STROKE)]).toEqual([false, false]);
    expect([menu(IN_HALL), menu(IN_STROKE)]).toEqual([null, null]);
    expect(fogMenuOffered(store, coverage(), IN_HALL)).toBe(false);
    undo();
    expect(entries(menu(IN_HALL))).toEqual(ON_REVEALED);
  });

  it('acts on the fog as it is when the entry is chosen, not as it was when the menu opened', () => {
    const { store, coverage, menu } = scene();
    const opened = menu(IN_BLOB)!;
    // Fog painted beside the blob while the menu is open: it is part of the object now.
    store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 600, y: 580, width: 200, height: 40 });
    const [, remove] = opened.entries;
    if (remove?.type === 'item') remove.onClick();
    expect([coverage().covers(IN_BLOB), coverage().covers({ x: 780, y: 600 })]).toEqual([false, false]);
  });
});

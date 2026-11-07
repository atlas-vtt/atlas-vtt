// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapFeatureInteraction } from '../../../src/app/pixi/mapFeatures/MapFeatureInteraction';
import { mapFeatureMenuEntries } from '../../../src/app/pixi/mapFeatures/mapFeatureMenu';
import type { ContextMenuEntry } from '../../../src/app/react/components/context-menu/AtlasContextMenu';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { MapFeature } from '../../../src/app/types/mapFeatureTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const rubble: MapFeature = {
  id: 'rubble', kind: 'map-feature', name: 'Rubble', terrain: { difficult: true, cover: 'half' },
  polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
};
const door = (id: string, extra: Partial<WallSegment> = {}): WallSegment => ({ id, kind: 'wall', type: 'door', p1: { x: 0, y: 0 }, p2: { x: 70, y: 0 }, ...extra });
const still = { clientX: 40, clientY: 50, buttons: 0 };

function sceneStore(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `map-feature-hover-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, isGMView: true,
    objects: {
      ...store.getState().objects,
      mapFeatures: { rubble },
      walls: { plain: door('plain'), locked: door('locked', { locked: true }), secret: door('secret', { type: 'secret-door' }), solid: door('solid', { type: 'solid' }) },
    },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

const label = (): HTMLElement | null => document.querySelector('.atlas-map-feature-label');
const shownText = (): string | null => {
  const el = label();
  return el && !el.hidden ? el.textContent : null;
};

let store: ViewAtlasStore;
let hover: MapFeatureInteraction;

beforeEach(() => {
  vi.useFakeTimers();
  store = sceneStore();
  hover = new MapFeatureInteraction(store, document.body.createEl('canvas'));
});

afterEach(() => {
  hover.destroy();
  document.body.empty();
  vi.useRealTimers();
});

describe('the GM\'s hover label', () => {
  it('names a feature and its traits after a short hover, beside the pointer, and leaves with the pointer', () => {
    hover.hover({ x: 50, y: 50 }, null, still);
    expect(shownText()).toBeNull();
    vi.advanceTimersByTime(300);
    expect(shownText()).toBe('RubbleDifficult terrain · Half cover');
    expect(label()!.classList.contains('tooltip-content')).toBe(true);
    expect(label()!.getAttribute('title')).toBeNull();
    expect(label()!.style.left).toBe('54px');
    hover.hover({ x: 500, y: 500 }, null, still);
    expect(shownText()).toBeNull();
  });

  it('names doors by what the wall is', () => {
    const texts = ['plain', 'locked', 'secret'].map((id) => {
      hover.hover({ x: 10, y: 0 }, id, still);
      vi.advanceTimersByTime(300);
      return shownText();
    });
    expect(texts).toEqual(['Door', 'Locked door', 'Secret door']);
    hover.hover({ x: 10, y: 0 }, 'solid', still);
    expect(shownText()).toBeNull();
  });

  it('never shows in the players\' view, while a button is held, or after a press', () => {
    store.setState({ isGMView: false });
    hover.hover({ x: 50, y: 50 }, null, still);
    vi.advanceTimersByTime(300);
    expect(shownText()).toBeNull();

    store.setState({ isGMView: true });
    hover.hover({ x: 50, y: 50 }, null, { ...still, buttons: 1 });
    vi.advanceTimersByTime(300);
    expect(shownText()).toBeNull();

    hover.hover({ x: 50, y: 50 }, null, still);
    vi.advanceTimersByTime(300);
    expect(shownText()).not.toBeNull();
    window.dispatchEvent(new Event('pointerdown'));
    expect(shownText()).toBeNull();
  });

  it('goes when the view turns to the players\' or the feature changes', () => {
    hover.hover({ x: 50, y: 50 }, null, still);
    vi.advanceTimersByTime(300);
    store.setState({ isGMView: false });
    expect(shownText()).toBeNull();
    store.setState({ isGMView: true });
    hover.hover({ x: 50, y: 50 }, null, still);
    vi.advanceTimersByTime(300);
    store.getState().deleteMapFeature('rubble');
    expect(shownText()).toBeNull();
  });
});

describe('a feature\'s menu', () => {
  const item = (entries: ContextMenuEntry[], label: string): Extract<ContextMenuEntry, { type: 'item' }> =>
    entries.find((entry): entry is Extract<ContextMenuEntry, { type: 'item' }> => entry.type === 'item' && entry.label === label)!;
  const cover = (entries: ContextMenuEntry[], label: string): Extract<ContextMenuEntry, { type: 'item' }> => {
    const submenu = entries.find((entry) => entry.type === 'submenu')!;
    const children = submenu.type === 'submenu' && Array.isArray(submenu.children) ? submenu.children : [];
    return item(children, label);
  };
  const current = (): MapFeature => store.getState().objects.mapFeatures!.rubble!;
  const entries = (): ContextMenuEntry[] => mapFeatureMenuEntries(store, current(), async () => 'Loose rubble');

  it('switches difficult terrain, sets cover, renames and removes, one undo step each', async () => {
    item(entries(), 'Difficult terrain').onClick();
    expect(current().terrain).toEqual({ cover: 'half' });
    cover(entries(), 'Total cover').onClick();
    expect(current().terrain).toEqual({ cover: 'total' });
    cover(entries(), 'None').onClick();
    expect(current().terrain).toBeUndefined();
    item(entries(), 'Rename').onClick();
    await vi.runAllTimersAsync();
    expect(current().name).toBe('Loose rubble');
    item(entries(), 'Remove').onClick();
    expect(store.getState().objects.mapFeatures).toEqual({});
    const history = getHistoryStore(store)!.getState();
    expect(history.pastStates).toHaveLength(5);
    history.undo();
    expect(current().name).toBe('Loose rubble');
  });
});

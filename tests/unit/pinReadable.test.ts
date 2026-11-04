// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Texture, type Container, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { readablePinEntry } from '../../src/app/pixi/pinReadableMenu';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom has no 2D canvas, so pin glyphs cannot be rasterised here.
vi.mock('../../src/app/pixi/utils/pinIconTexture', () => ({
  createPinIconTexture: vi.fn(() => new Texture()),
}));

let cleanup: (() => void) | null = null;

function setup(): { renderer: PinRenderer; store: ReturnType<typeof createViewAtlasStore> } {
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: { 'Keep.md': '# Keep' } });
  const store = createViewAtlasStore(app, 'pin-readable-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/pins.atlasmap');
  const renderer = new PinRenderer(viewport, new EventEmitter(), store);
  cleanup = () => {
    renderer.destroy();
    viewport.destroy();
  };
  return { renderer, store };
}

const marks = (renderer: PinRenderer): number => (renderer.getPinContainer().children[0] as Container).children[0]?.children.filter((child) => child.label === 'pin-readable-mark').length ?? 0;

describe('a pin players may read', () => {
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('is switched in the pin menu, one undo step, and marked on the GM\'s canvas while it is on', () => {
    const { renderer, store } = setup();
    const id = store.getState().addNotePin(10, 20, 'Keep.md#Cellar');
    const pin = (): ReturnType<typeof store.getState>['objects']['pins'][string] | undefined => store.getState().objects.pins[id];
    expect(marks(renderer)).toBe(0);
    const entry = readablePinEntry(store, pin()!);
    expect(entry).toMatchObject({ type: 'item', label: 'Readable by players', checked: false });
    if (entry?.type === 'item') void entry.onClick();
    expect(pin()?.readable).toBe(true);
    expect(marks(renderer)).toBe(1);
    const off = readablePinEntry(store, pin()!);
    expect(off).toMatchObject({ checked: true });
    if (off?.type === 'item') void off.onClick();
    expect(pin()).not.toHaveProperty('readable');
    expect(marks(renderer)).toBe(0);
    getHistoryStore(store)?.getState().undo();
    expect(pin()?.readable).toBe(true);
  });

  it('is not offered for a pin that links a scene', () => {
    const { store } = setup();
    const id = store.getState().addNotePin(10, 20, 'Scenes/Crypt.atlasmap');
    expect(readablePinEntry(store, store.getState().objects.pins[id]!)).toBeNull();
  });
});

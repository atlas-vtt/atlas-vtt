// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Texture, type Container, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom has no 2D canvas, so pin glyphs cannot be rasterised here.
vi.mock('../../src/app/pixi/utils/pinIconTexture', () => ({
  createPinIconTexture: vi.fn(() => new Texture()),
}));

let cleanup: (() => void) | null = null;

function setup(): { renderer: PinRenderer; store: ReturnType<typeof createViewAtlasStore> } {
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: { 'a.md': '# A', 'b.md': '# B' } });
  const store = createViewAtlasStore(app, 'pin-rebuild-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/pins.atlasmap');
  const renderer = new PinRenderer(viewport, new EventEmitter(), store);
  cleanup = () => {
    renderer.destroy();
    viewport.destroy();
  };
  return { renderer, store };
}

/** The graphics inside a pin group; a new object means the pin was rebuilt. */
function pinGraphics(renderer: PinRenderer, index: number): Container | undefined {
  const group = renderer.getPinContainer().children[index] as Container | undefined;
  return group?.children[0] as Container | undefined;
}

describe('PinRenderer rebuilds', () => {
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('moves a dragged pin without rebuilding its graphics', () => {
    const { renderer, store } = setup();
    const pinId = store.getState().addNotePin(10, 20, 'a.md');
    const before = pinGraphics(renderer, 0);

    store.getState().updateNotePin(pinId, { x: 50, y: 60 });

    const group = renderer.getPinContainer().children[0];
    expect(group?.position.x).toBe(50);
    expect(group?.position.y).toBe(60);
    expect(pinGraphics(renderer, 0)).toBe(before);
    expect(before?.destroyed).toBe(false);
  });

  it('rebuilds only the pin whose content changed and destroys its old graphics', () => {
    const { renderer, store } = setup();
    const first = store.getState().addNotePin(10, 20, 'a.md');
    store.getState().addNotePin(100, 200, 'b.md');
    const firstBefore = pinGraphics(renderer, 0);
    const secondBefore = pinGraphics(renderer, 1);

    store.getState().updateNotePin(first, { notePath: 'b.md' });

    expect(pinGraphics(renderer, 0)).not.toBe(firstBefore);
    expect(firstBefore?.destroyed).toBe(true);
    expect(pinGraphics(renderer, 1)).toBe(secondBefore);
  });

  it('destroys the whole group of a deleted pin', () => {
    const { renderer, store } = setup();
    const pinId = store.getState().addNotePin(10, 20, 'a.md');
    const group = renderer.getPinContainer().children[0];

    store.getState().deleteMapObject('pin', pinId);

    expect(renderer.getPinContainer().children).toHaveLength(0);
    expect(group?.destroyed).toBe(true);
  });
});

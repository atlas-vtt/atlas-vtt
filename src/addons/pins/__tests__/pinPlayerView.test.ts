import { afterEach, describe, it, expect, vi } from 'vitest';
import { Texture, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { PinRenderer } from 'src/app/pixi/PinRenderer';
import { createViewAtlasStore } from 'src/app/storeFactory';
import { createInMemoryApp } from '../../../../tests/mocks/inMemoryVault';

// jsdom has no 2D canvas, so pin glyphs cannot be rasterised here.
vi.mock('src/app/pixi/utils/pinIconTexture', () => ({
  createPinIconTexture: vi.fn(() => new Texture()),
}));

let cleanup: (() => void) | null = null;

describe('pin display add-on in the pin renderer', () => {
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('shows only pins shown to players, and none hit-test, while the DM previews the player perspective', () => {
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
    const { app } = createInMemoryApp({ files: { 'note.md': '# Note' } });
    const store = createViewAtlasStore(app, 'pin-display-test-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/pin-test.atlasmap');
    const renderer = new PinRenderer(viewport, new EventEmitter(), store);
    cleanup = (): void => { renderer.destroy(); viewport.destroy(); };

    const secretId = store.getState().addNotePin(10, 20, 'note.md');
    const sharedId = store.getState().addNotePin(300, 300, 'note.md');
    store.getState().updateNotePin(sharedId, { playerVisible: true });

    store.getState().setGMView(false);

    const visibleOf = (id: string): boolean | undefined =>
      renderer.getPinContainer().children.find((child) => child.label === `pin-${id}`)?.visible;
    expect(visibleOf(secretId)).toBe(false);
    expect(visibleOf(sharedId)).toBe(true);
    expect(renderer.hitTestPins(10, 20)).toBeNull();
    expect(renderer.hitTestPins(300, 300)).toBeNull();
  });
});

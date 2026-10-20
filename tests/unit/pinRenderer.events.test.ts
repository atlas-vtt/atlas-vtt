import { afterEach, describe, it, expect, vi } from 'vitest';
import { Texture, type EventSystem, type FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom has no 2D canvas, so pin glyphs cannot be rasterised here.
vi.mock('../../src/app/pixi/utils/pinIconTexture', () => ({
  createPinIconTexture: vi.fn(() => new Texture()),
}));
// Plain Atlas: add-ons that change how pins show bring their own tests
vi.mock('../../src/app/addons/addonRegistry', () => ({ installedAddons: () => [] }));

type ViewStore = ReturnType<typeof createViewAtlasStore>;

interface Harness {
  renderer: PinRenderer;
  viewport: Viewport;
  store: ViewStore;
}

let harness: Harness | null = null;

function setup(): Harness {
  // The viewport only needs the event system's DOM element to bind wheel/pointer listeners.
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: { 'note.md': '# Note' } });
  const store = createViewAtlasStore(app, 'pin-test-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/pin-test.atlasmap');
  const renderer = new PinRenderer(viewport, new EventEmitter(), store);
  harness = { renderer, viewport, store };
  return harness;
}

const pointerEvent = (button: number, x: number, y: number): FederatedPointerEvent =>
  ({ button, global: { x, y } }) as unknown as FederatedPointerEvent;

describe('PinRenderer events', () => {
  afterEach(() => {
    vi.useRealTimers();
    harness?.renderer.destroy();
    harness?.viewport.destroy();
    harness = null;
  });

  it('renders a pin for every note pin in the store and hit-tests it by position', () => {
    const { renderer, store } = setup();

    const pinId = store.getState().addNotePin(10, 20, 'note.md');

    expect(renderer.getPinContainer().children).toHaveLength(1);
    expect(renderer.hitTestPins(10, 20)).toBe(pinId);
    expect(renderer.hitTestPins(500, 500)).toBeNull();
  });

  it('hides pins from hit-testing while the DM previews the player perspective', () => {
    const { renderer, store } = setup();
    const pinId = store.getState().addNotePin(10, 20, 'note.md');

    store.getState().setGMView(false);

    const pinOf = (id: string): boolean | undefined =>
      renderer.getPinContainer().children.find((child) => child.label === `pin-${id}`)?.visible;
    expect(pinOf(pinId)).toBe(false);
    expect(renderer.hitTestPins(10, 20)).toBeNull();
  });

  it('emits an open action when a viewport-routed click is released without dragging', () => {
    const { renderer, viewport, store } = setup();
    const actionSpy = vi.fn();
    window.addEventListener('atlas-pin-action', actionSpy);

    const pinId = store.getState().addNotePin(10, 20, 'note.md');
    renderer.handleViewportPinPointerDown(pinId, pointerEvent(0, 10, 20));
    expect(actionSpy).not.toHaveBeenCalled();

    viewport.emit('pointerup', pointerEvent(0, 10, 20));
    window.removeEventListener('atlas-pin-action', actionSpy);

    expect(actionSpy).toHaveBeenCalledTimes(1);
    const event = actionSpy.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toEqual({ action: 'open', pin: store.getState().objects.pins[pinId] });
  });

  it('drags the pin instead of opening it once the pointer moves past the drag threshold', () => {
    const { renderer, viewport, store } = setup();
    const actionSpy = vi.fn();
    window.addEventListener('atlas-pin-action', actionSpy);

    const pinId = store.getState().addNotePin(10, 20, 'note.md');
    // Fake timers keep the debounced map save from outliving the test.
    vi.useFakeTimers();
    store.getState().setPersistenceEnabled(true);
    renderer.handleViewportPinPointerDown(pinId, pointerEvent(0, 10, 20));
    viewport.emit('pointermove', pointerEvent(0, 40, 60));
    // Live drag updates must not hit the disk; the final position is saved on release.
    expect(store.getState().persistenceEnabled).toBe(false);
    viewport.emit('pointerup', pointerEvent(0, 40, 60));
    window.removeEventListener('atlas-pin-action', actionSpy);

    expect(actionSpy).not.toHaveBeenCalled();
    expect(store.getState().objects.pins[pinId]).toMatchObject({ x: 40, y: 60 });
    expect(store.getState().persistenceEnabled).toBe(true);
  });
});

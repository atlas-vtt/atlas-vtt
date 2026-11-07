// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import type { EventSystem, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { TextRenderer } from '../../src/app/pixi/TextRenderer';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

type ViewStore = ReturnType<typeof createViewAtlasStore>;

interface Harness {
  renderer: TextRenderer;
  viewport: Viewport;
  store: ViewStore;
}

let harness: Harness | null = null;
let restoreGraphics: () => void = () => {};

function setup(): Harness {
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'text-test-view');
  store.getState().setPersistenceEnabled(false);
  const renderer = new TextRenderer(viewport, {} as GridSystem, () => {}, store);
  harness = { renderer, viewport, store };
  return harness;
}

const pointerEvent = (x: number, y: number): FederatedPointerEvent =>
  ({ button: 0, global: { x, y }, stopPropagation: () => {} }) as unknown as FederatedPointerEvent;

function press(h: Harness, id: string, x: number, y: number): void {
  const text = h.renderer.getContainer().children.find((child) => child.label === id);
  text?.emit('pointerdown', pointerEvent(x, y));
}

describe('TextRenderer drag', () => {
  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
  });

  afterEach(() => {
    harness?.renderer.destroy();
    harness?.viewport.destroy();
    harness = null;
    restoreGraphics();
  });

  it('keeps a moved text where it is when it is clicked again', () => {
    const h = setup();
    const id = h.store.getState().addText({
      x: 100, y: 100, text: 'Here', fontSize: 24, fontFamily: 'Arial', color: '#ffffff',
    });

    press(h, id, 100, 100);
    h.viewport.emit('pointerup', pointerEvent(300, 250));
    expect(h.store.getState().objects.texts[id]).toMatchObject({ x: 300, y: 250 });

    press(h, id, 300, 250);
    h.viewport.emit('pointerup', pointerEvent(300, 250));

    expect(h.store.getState().objects.texts[id]).toMatchObject({ x: 300, y: 250 });
  });
});

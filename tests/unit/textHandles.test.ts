// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import type { Container, EventSystem, FederatedPointerEvent } from 'pixi.js';
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
  id: string;
}

const HANDLE_RADIUS = 13;

let harness: Harness | null = null;
let restoreGraphics: () => void = () => {};

function setup(): Harness {
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'text-handles-view');
  store.getState().setPersistenceEnabled(false);
  const renderer = new TextRenderer(viewport, {} as GridSystem, () => {}, store);
  const id = store.getState().addText({
    x: 100, y: 100, text: 'Here', fontSize: 24, fontFamily: 'Arial', color: '#ffffff',
  });
  store.getState().setSelection([id]);
  harness = { renderer, viewport, store, id };
  return harness;
}

const pointerEvent = (x: number, y: number): FederatedPointerEvent =>
  ({ button: 0, global: { x, y }, stopPropagation: () => {} }) as unknown as FederatedPointerEvent;

function child(h: Harness, label: string): Container {
  const found = h.viewport.children.find((c) => c.label === label);
  if (!found) throw new Error(`no ${label}`);
  return found;
}

const textView = (h: Harness): Container =>
  h.renderer.getContainer().children.find((c) => c.label === h.id)!;
const rotateHandle = (h: Harness): Container => child(h, 'textRotationUI').getChildByLabel('textRotationHandle')!;
const rightResizeHandle = (h: Harness): Container => child(h, 'textResizeUI').getChildByLabel('resizeHandle_right')!;

/** Top of the text in the handles' frame (text position, text rotation, no scale). */
function scaledTop(h: Harness, scale: number): number {
  return textView(h).getLocalBounds().minY * scale;
}

describe('text handles', () => {
  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
  });

  afterEach(() => {
    harness?.renderer.destroy();
    harness?.viewport.destroy();
    harness = null;
    restoreGraphics();
  });

  it('keeps the rotate handle above an enlarged text', () => {
    const h = setup();
    h.store.getState().updateText(h.id, { scale: 5 });

    expect(rotateHandle(h).position.y + HANDLE_RADIUS).toBeLessThan(scaledTop(h, 5));
  });

  it('keeps the rotate handle off a rotated, enlarged text', () => {
    const h = setup();
    h.store.getState().updateText(h.id, { scale: 5, rotation: 90 });

    const handle = rotateHandle(h).getGlobalPosition();
    expect(textView(h).getBounds().containsPoint(handle.x, handle.y)).toBe(false);
  });

  it('moves the rotate handle while the text is resized by its handle', () => {
    const h = setup();
    const right = rightResizeHandle(h);
    const start = right.getGlobalPosition();
    right.emit('pointerdown', pointerEvent(start.x, start.y));
    h.viewport.emit('pointermove', pointerEvent(100 + (start.x - 100) * 6, start.y));

    const scale = textView(h).scale.x;
    expect(scale).toBe(5);
    expect(rotateHandle(h).position.y + HANDLE_RADIUS).toBeLessThan(scaledTop(h, scale));
    h.viewport.emit('pointerup', pointerEvent(0, 0));
  });

  it('brings the handles back with an undo', () => {
    const h = setup();
    const restingY = rotateHandle(h).position.y;
    const restingX = rightResizeHandle(h).position.x;
    h.store.getState().updateText(h.id, { scale: 2.5 });
    expect(rightResizeHandle(h).position.x).toBeGreaterThan(restingX);

    h.store.temporal.getState().undo();

    expect(rotateHandle(h).position.y).toBeCloseTo(restingY);
    expect(rightResizeHandle(h).position.x).toBeCloseTo(restingX);
  });
});

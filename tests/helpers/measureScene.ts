import { Container, EventBoundary, FederatedPointerEvent, Text, type EventSystem } from 'pixi.js';
import type { HideableLayer } from '../../src/app/pixi/playerSafeFrame';
import { Viewport } from 'pixi-viewport';
import { MeasureRenderer, type MeasureGrid } from '../../src/app/pixi/measure/MeasureRenderer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { vi, type Mock } from 'vitest';

/** The keys and the button a pointer event comes with. */
export interface PointerKeys {
  button?: number;
  shift?: boolean;
  alt?: boolean;
}

export const GRID = 70;
const snap = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / GRID) * GRID + GRID / 2, y: Math.floor(y / GRID) * GRID + GRID / 2 });

const SQUARE_GRID: MeasureGrid = { getOptions: () => ({ type: 'square', size: GRID, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap };

/** A measure renderer on a jsdom viewport, by default with a 70 px square grid that snaps to cell centres. */
export interface MeasureScene {
  measure: MeasureRenderer;
  viewport: Viewport;
  store: ReturnType<typeof createViewAtlasStore>;
  /** Told when a measurement could not be kept. */
  full: Mock<() => void>;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number, keys?: PointerKeys): void;
  /** A click in place: a press and its release. */
  click(x: number, y: number, keys?: PointerKeys): void;
  /** A key pressed while the map has the keyboard. */
  key(key: string, keys?: PointerKeys): KeyboardEvent;
  /** Every measurement's shape and label, the live ones first. */
  parts(): HideableLayer[];
  visible(): boolean[];
  /** The labels of the live measurement: its distance first, then one for each leg of a ruler with corners. */
  liveLabels(): { view: Container; text: string }[];
  destroy(): void;
}

export function measureScene(grid: MeasureGrid = SQUARE_GRID): MeasureScene {
  const restoreGraphics = stubJsdomGraphics();
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: createEl('canvas') } as unknown as EventSystem });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'measure-player-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/measure.atlasmap');
  const full = vi.fn<() => void>();
  const measure = new MeasureRenderer(viewport, store, grid, full);
  const boundary = new EventBoundary(viewport);
  const parts = (): HideableLayer[] => measure.getGmViewLayers().map(({ layer }) => layer);
  return {
    measure, viewport, store, full, parts,
    visible: () => parts().map((part) => part.visible),
    liveLabels: () => {
      const labels = parts()[1];
      if (!(labels instanceof Container)) throw new Error('Expected the live labels');
      return labels.children.flatMap((view) => {
        const text = view.children.find((child): child is Text => child instanceof Text);
        return text ? [{ view, text: text.text }] : [];
      });
    },
    pointer(type, x, y, keys = {}): void {
      const event = new FederatedPointerEvent(boundary);
      event.button = keys.button ?? 0;
      event.shiftKey = keys.shift ?? false;
      event.altKey = keys.alt ?? false;
      event.global.set(x, y);
      viewport.emit(type, event);
    },
    click(x, y, keys): void {
      this.pointer('pointerdown', x, y, keys);
      this.pointer('pointerup', x, y, keys);
    },
    key(key, keys = {}): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, shiftKey: keys.shift ?? false, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event;
    },
    destroy(): void {
      measure.destroy();
      viewport.destroy();
      restoreGraphics();
    },
  };
}

/** A drag with the measure tool from (x0, y0) to (x1, y1). */
export function measureFrom(s: MeasureScene, x0: number, y0: number, x1 = x0 + 200, y1 = y0): void {
  s.pointer('pointerdown', x0, y0);
  s.pointer('pointermove', x1, y1);
  s.pointer('pointerup', x1, y1);
}

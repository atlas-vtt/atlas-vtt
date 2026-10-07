import { EventEmitter } from 'events';
import { EventBoundary, FederatedPointerEvent, type Container, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { MeasureRenderer, type MeasureGrid } from '../../src/app/pixi/MeasureRenderer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

export const GRID = 70;
const snap = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / GRID) * GRID + GRID / 2, y: Math.floor(y / GRID) * GRID + GRID / 2 });

/** A measure renderer on a jsdom viewport with a 70 px square grid that snaps to cell centres. */
export interface MeasureScene {
  measure: MeasureRenderer;
  viewport: Viewport;
  bus: EventEmitter;
  store: ReturnType<typeof createViewAtlasStore>;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void;
  /** Every measurement part on the viewport, the live ones first. */
  parts(): Container[];
  visible(): boolean[];
  destroy(): void;
}

export function measureScene(): MeasureScene {
  const restoreGraphics = stubJsdomGraphics();
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: createEl('canvas') } as unknown as EventSystem });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'measure-player-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/measure.atlasmap');
  const bus = new EventEmitter();
  const grid: MeasureGrid = { getOptions: () => ({ type: 'square', size: GRID, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap };
  const measure = new MeasureRenderer(viewport, bus, store, grid);
  const boundary = new EventBoundary(viewport);
  const parts = (): Container[] => viewport.children.slice();
  return {
    measure, viewport, bus, store, parts,
    visible: () => parts().map((part) => part.visible),
    pointer(type, x, y): void {
      const event = new FederatedPointerEvent(boundary);
      event.button = 0;
      event.global.set(x, y);
      viewport.emit(type, event);
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

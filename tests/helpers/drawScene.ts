import { EventBoundary, FederatedPointerEvent, type Container, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { vi, type Mock } from 'vitest';
import type { DrawToolChoices } from '../../src/app/annotations/annotationTypes';
import type { GridGeometry } from '../../src/app/grid/gridDistance';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import type { FullOf } from '../../src/app/pixi/annotations/DrawToolHost';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { DrawingStroke, TextElement } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

/** The keys and the button a pointer event comes with. */
export interface PointerKeys {
  button?: number;
  shift?: boolean;
  alt?: boolean;
  pointerId?: number;
}

export const CELL = 70;
const SQUARE_GRID: GridGeometry = { type: 'square', size: CELL, offsetX: 0, offsetY: 0 };

/** The drawings and texts of a view with the Draw tool, on a jsdom viewport whose screen is its world. */
export interface DrawScene {
  renderer: AnnotationsRenderer;
  viewport: Viewport;
  store: ReturnType<typeof createViewAtlasStore>;
  /** Told when the level could take no more. */
  full: Mock<(of: FullOf) => void>;
  /** What the text dialog answers. */
  askText: Mock<() => Promise<string | null>>;
  /** Whether the canvas shows the players' picture, as a peek would make it: null leaves it to the store. */
  players: { shown: boolean | null };
  /** Takes the Draw tool into hand in `mode`, with other choices where given. */
  tool(choices: Partial<DrawToolChoices>): void;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointertap', x: number, y: number, keys?: PointerKeys): void;
  /** A press, the moves through `path`, and the release at its end. */
  drag(path: readonly (readonly [number, number])[], keys?: PointerKeys): void;
  /** A click in place: a press and its release. */
  click(x: number, y: number, keys?: PointerKeys): void;
  /** A key pressed while the map has the keyboard. */
  key(key: string): KeyboardEvent;
  drawings(): DrawingStroke[];
  texts(): TextElement[];
  /** What the drawing or text `id` is drawn in. */
  node(kind: 'drawing' | 'text', id: string): Container | null;
  destroy(): void;
}

export function drawScene(options: { grid?: GridGeometry | null; playerView?: boolean; keysBelongToMap?: (event: KeyboardEvent) => boolean } = {}): DrawScene {
  const restoreGraphics = stubJsdomGraphics();
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: createEl('canvas') } as unknown as EventSystem });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'draw-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/draw.atlasmap');
  if (options.playerView) store.setState({ isPlayerView: true });
  const full = vi.fn<(of: FullOf) => void>();
  const askText = vi.fn<() => Promise<string | null>>(() => Promise.resolve('Gate'));
  const players: DrawScene['players'] = { shown: null };
  const grid = options.grid === undefined ? SQUARE_GRID : options.grid;
  const renderer = new AnnotationsRenderer({
    viewport, store, grid: () => grid, full, askText, showsPlayers: () => players.shown,
    ...(options.keysBelongToMap && { keysBelongToMap: options.keysBelongToMap }),
  });
  const boundary = new EventBoundary(viewport);
  const scene: DrawScene = {
    renderer, viewport, store, full, askText, players,
    tool(choices): void {
      store.getState().setDrawTool(choices);
      store.getState().setActiveTool('draw');
    },
    pointer(type, x, y, keys = {}): void {
      const event = new FederatedPointerEvent(boundary);
      event.button = keys.button ?? 0;
      event.shiftKey = keys.shift ?? false;
      event.altKey = keys.alt ?? false;
      event.pointerId = keys.pointerId ?? 1;
      event.global.set(x, y);
      viewport.emit(type, event);
    },
    drag(path, keys): void {
      const [first, ...rest] = path;
      const last = path[path.length - 1];
      if (!first || !last) return;
      scene.pointer('pointerdown', first[0], first[1], keys);
      for (const [x, y] of rest) scene.pointer('pointermove', x, y, keys);
      scene.pointer('pointerup', last[0], last[1], keys);
    },
    click(x, y, keys): void {
      scene.pointer('pointerdown', x, y, keys);
      scene.pointer('pointerup', x, y, keys);
      scene.pointer('pointertap', x, y, keys);
    },
    key(key): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event;
    },
    drawings: () => Object.values(store.getState().objects.drawings),
    texts: () => Object.values(store.getState().objects.texts),
    node: (kind, id) => renderer.layer.node(kind, id),
    destroy(): void {
      renderer.destroy();
      viewport.destroy();
      restoreGraphics();
    },
  };
  return scene;
}

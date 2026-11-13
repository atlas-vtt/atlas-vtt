import { EventBoundary, FederatedPointerEvent, type Container, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { vi, type Mock } from 'vitest';
import type { DrawToolChoices } from '../../src/app/annotations/annotationTypes';
import type { GridGeometry } from '../../src/app/grid/gridDistance';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import { markHandled, resetHandled } from '../../src/app/pixi/utils/handledEvents';
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
  /** The press follows the one before it at once, as a double click's second does; else a second passes between two presses. */
  soon?: boolean;
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
  /** What holds the canvas: the field a text is typed in is its child. */
  host: HTMLElement;
  /** The field a text is being typed in; null while none is. */
  field(): HTMLTextAreaElement | null;
  /** Types `words` into the field, as the keyboard would: its value, then the event that tells of it. */
  type(words: string): void;
  /** A key pressed in the field. */
  fieldKey(key: string, init?: KeyboardEventInit): KeyboardEvent;
  /** Told when a press on an annotation starts the drag of the tokens selected with it. */
  dragTokens: Mock<() => void>;
  /** Whether the canvas shows the players' picture, as a peek would make it: null leaves it to the store. */
  players: { shown: boolean | null };
  /** Takes the Draw tool into hand in `mode`, with other choices where given. */
  tool(choices: Partial<DrawToolChoices>): void;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointertap', x: number, y: number, keys?: PointerKeys): void;
  /**
   * A press as the viewport's dispatch (`TokenRenderer`) hands it to the drawings and texts before
   * the viewport's other listeners hear it: the handles first, then what the tool in hand takes.
   * Whether they took it. A secondary press is a right click, released where it was pressed:
   * whether it opened their menu.
   */
  press(x: number, y: number, keys?: PointerKeys): boolean;
  /**
   * The pointer over the map at (x, y), as the viewport's dispatch tells the drawings and texts of
   * every move there: the cursor they answer, null for the system's own.
   */
  hover(x: number, y: number, keys?: PointerKeys): string | null;
  /** The pointer left the canvas. */
  leave(): void;
  /** `press`, the moves through the rest of `path`, and the release at its end. */
  pull(path: readonly (readonly [number, number])[], keys?: PointerKeys): boolean;
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
  const host = document.body.createDiv();
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: host.createEl('canvas') } as unknown as EventSystem });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'draw-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/draw.atlasmap');
  if (options.playerView) store.setState({ isPlayerView: true });
  const full = vi.fn<(of: FullOf) => void>();
  const dragTokens = vi.fn<() => void>();
  const players: DrawScene['players'] = { shown: null };
  const grid = options.grid === undefined ? SQUARE_GRID : options.grid;
  const renderer = new AnnotationsRenderer({
    viewport, store, grid: () => grid, full, showsPlayers: () => players.shown, accent: () => 0x8a5cf5, now: () => clock, dragTokens,
    ...(options.keysBelongToMap && { keysBelongToMap: options.keysBelongToMap }),
  });
  let clock = 0;
  const boundary = new EventBoundary(viewport);
  const eventOf = (x: number, y: number, keys: PointerKeys): FederatedPointerEvent => {
    const event = new FederatedPointerEvent(boundary);
    event.button = keys.button ?? 0;
    event.shiftKey = keys.shift ?? false;
    event.altKey = keys.alt ?? false;
    event.pointerId = keys.pointerId ?? 1;
    event.global.set(x, y);
    return event;
  };
  const scene: DrawScene = {
    renderer, viewport, store, full, dragTokens, players, host,
    field: () => host.querySelector('textarea'),
    type(words): void {
      const field = host.querySelector('textarea');
      if (!field) throw new Error('no text is being typed');
      field.value = words;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    },
    fieldKey(key, init = {}): KeyboardEvent {
      const field = host.querySelector('textarea');
      if (!field) throw new Error('no text is being typed');
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      field.dispatchEvent(event);
      return event;
    },
    tool(choices): void {
      store.getState().setDrawTool(choices);
      store.getState().setActiveTool('draw');
    },
    pointer(type, x, y, keys = {}): void {
      viewport.emit(type, eventOf(x, y, keys));
    },
    press(x, y, keys = {}): boolean {
      if (!keys.soon) clock += 1000;
      const event = eventOf(x, y, keys);
      resetHandled(event);
      const world = viewport.toWorld(event.global);
      if (event.button === 2) {
        // The press stays the viewport's; released in place, as here, it opens the menu.
        viewport.emit('pointerdown', event);
        return renderer.selecting.pointer.menuAt(world.x, world.y) && renderer.selecting.pointer.openMenu(world.x, world.y, event);
      }
      const taken = renderer.selecting.pointer.gripDown(world.x, world.y, event) || renderer.selecting.pointer.pointerDown(world.x, world.y, event);
      if (taken) markHandled(event);
      viewport.emit('pointerdown', event);
      return taken;
    },
    hover(x, y, keys = {}): string | null {
      const world = viewport.toWorld(x, y);
      return renderer.pointer.cursorAt(world.x, world.y, () => false, keys.alt ?? false);
    },
    leave: () => renderer.pointer.leave(),
    pull(path, keys): boolean {
      const [first, ...rest] = path;
      const last = path[path.length - 1];
      if (!first || !last) return false;
      const taken = scene.press(first[0], first[1], keys);
      for (const [x, y] of rest) scene.pointer('pointermove', x, y, keys);
      scene.pointer('pointerup', last[0], last[1], keys);
      return taken;
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
      host.remove();
      restoreGraphics();
    },
  };
  return scene;
}

import type { Viewport } from 'pixi-viewport';
import type { FingerUse } from '../../services/deviceSettings';
import { getHistoryStore } from '../../stores/history';
import type { ViewAtlasStore } from '../../storeFactory';
import type { FingerMode } from './gestureTypes';
import type { MapGestureHost } from './installTouchGestures';

/**
 * What a finger's tap places with the tool in hand, where a press would place it at once:
 * - `'taps'`: a shape placed tap by tap is under way, or the tool's shape is one (a fog polygon, a
 *   wall chain): nothing is dragged there, so a finger that moves pans and only a tap places;
 * - `'press'`: a press places something (a light, a chain's first corner), and what is there is
 *   dragged (a wall's end): the press is held back until the finger lifts or leaves its place.
 */
export type TapPlacing = 'taps' | 'press';

/**
 * What one finger does on the empty map, tool by tool:
 * - Move and select (`move`, `select`): it pans; a long press draws the marquee;
 * - every other tool (laser pointer, fog and its eraser, draw, measure, walls and lights, note
 *   pins, stairs, sounds): it is the tool, as the left button is. On a device with a pen it pans
 *   there too while fingers are set to pan, and its tap is still the tool's click;
 * - a tool that places by taps (`TapPlacing`): a second finger must never find a point placed;
 * - while tokens are being placed, the placement has every press, whatever the tool.
 */
export function fingerModeOf(activeTool: string, placing: boolean, fingers: FingerUse, taps: TapPlacing | null = null): FingerMode {
  if (placing) return 'direct';
  if (activeTool === 'move' || activeTool === 'select') return 'objects';
  if (fingers === 'pan' || taps === 'taps') return 'navigate';
  return taps === 'press' ? 'place' : 'tool';
}

/** The parts of a view the gestures ask; its renderers come and go with the map. */
export interface MapGestureParts {
  store: ViewAtlasStore;
  viewport: Viewport;
  /** Tokens are being placed by hand. */
  placing: () => boolean;
  /** A press on the empty map waits to be dragged into a marquee. */
  marqueePending: () => boolean;
  /** Whether a secondary click at a world point opens a menu. */
  menuAt: (worldX: number, worldY: number) => boolean;
  /** Whether a tap at a world point acts on something whose press the map's tools leave to the empty map (a linked hex). */
  tapActsAt: (worldX: number, worldY: number) => boolean;
  fingers: { readonly use: FingerUse; notePen: () => void };
  /** What a tap places with the tool in hand; unset or null, a press is the tool's as a mouse's is. */
  tapPlacing?: () => TapPlacing | null;
  /** Opens the menu of the empty map at a world point, for a finger held there; `at` is the point of the window. */
  emptyMapMenu?: (world: { x: number; y: number }, at: { x: number; y: number }) => void;
}

export function mapGestureHost({ store, viewport, placing, marqueePending, menuAt, tapActsAt, fingers, tapPlacing, emptyMapMenu }: MapGestureParts): MapGestureHost {
  // Undo and redo are the GM's, as their keys are
  const travel = (direction: 'undo' | 'redo'): void => {
    if (!store.getState().isPlayerView) getHistoryStore(store)?.getState()[direction]();
  };
  return {
    fingerMode: () => fingerModeOf(store.getState().activeTool, placing(), fingers.use, tapPlacing?.() ?? null),
    pressedEmptyMap: marqueePending,
    menuAt: (x, y) => {
      const world = viewport.toWorld(x, y);
      return menuAt(world.x, world.y);
    },
    tapActsAt: (x, y) => {
      const world = viewport.toWorld(x, y);
      return tapActsAt(world.x, world.y);
    },
    undo: () => travel('undo'),
    redo: () => travel('redo'),
    penTouched: () => fingers.notePen(),
    emptyMapMenu: (x, y, at) => {
      const world = viewport.toWorld(x, y);
      emptyMapMenu?.({ x: world.x, y: world.y }, at);
    },
  };
}

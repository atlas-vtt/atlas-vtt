import type { Viewport } from 'pixi-viewport';
import type { FingerUse } from '../../services/deviceSettings';
import { getHistoryStore } from '../../stores/history';
import type { ViewAtlasStore } from '../../storeFactory';
import type { FingerMode } from './gestureTypes';
import type { MapGestureHost } from './installTouchGestures';

/**
 * What one finger does on the empty map, tool by tool:
 * - Move and select (`move`, `select`): it pans; a long press draws the marquee;
 * - every other tool (laser pointer, fog and its eraser, draw, measure, walls and lights, note
 *   pins, stairs, sounds): it is the tool, as the left button is. On a device with a pen it pans
 *   there too while fingers are set to pan, and its tap is still the tool's click;
 * - while tokens are being placed, the placement has every press, whatever the tool.
 */
export function fingerModeOf(activeTool: string, placing: boolean, fingers: FingerUse): FingerMode {
  if (placing) return 'direct';
  if (activeTool === 'move' || activeTool === 'select') return 'objects';
  return fingers === 'pan' ? 'navigate' : 'tool';
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
  fingers: { readonly use: FingerUse; notePen: () => void };
}

export function mapGestureHost({ store, viewport, placing, marqueePending, menuAt, fingers }: MapGestureParts): MapGestureHost {
  // Undo and redo are the GM's, as their keys are
  const travel = (direction: 'undo' | 'redo'): void => {
    if (!store.getState().isPlayerView) getHistoryStore(store)?.getState()[direction]();
  };
  return {
    fingerMode: () => fingerModeOf(store.getState().activeTool, placing(), fingers.use),
    pressedEmptyMap: marqueePending,
    menuAt: (x, y) => {
      const world = viewport.toWorld(x, y);
      return menuAt(world.x, world.y);
    },
    undo: () => travel('undo'),
    redo: () => travel('redo'),
    penTouched: () => fingers.notePen(),
  };
}

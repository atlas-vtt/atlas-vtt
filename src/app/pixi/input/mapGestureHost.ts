import type { Viewport } from 'pixi-viewport';
import { isFogTool } from '../../fog/fogToolChoices';
import type { TapPlacing } from '../../types/tapPlacing';
import type { FingerUse } from '../../services/deviceSettings';
import { getHistoryStore, isHistoryTransactionOpen } from '../../stores/history';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { FingerMode } from './gestureTypes';
import type { MapGestureHost } from './installTouchGestures';

/**
 * What one finger does on the empty map, tool by tool:
 * - Move and select (`move`, `select`): it pans; a long press draws the marquee;
 * - every other tool (laser pointer, fog and its eraser, draw, measure, walls and lights, note
 *   pins, stairs, sounds): it is the tool, as the left button is. On a device with a pen it pans
 *   there too while fingers are set to pan, and its tap is still the tool's click;
 * - a tool that places by taps (`TapPlacing`): a second finger must never find a point placed;
 * - while tokens are being placed, the placement has every press, whatever the tool;
 * - in Table mode (`looking`) the map is only looked at, whatever else holds.
 */
export function fingerModeOf(activeTool: string, placing: boolean, fingers: FingerUse, taps: TapPlacing | null = null, looking = false): FingerMode {
  if (looking) return 'look';
  if (placing) return 'direct';
  if (activeTool === 'move' || activeTool === 'select') return 'objects';
  if (fingers === 'pan' || taps === 'taps') return 'navigate';
  return taps === 'press' ? 'place' : 'tool';
}

/** What of a view's state says what a tap places. */
export type TapPlacingState = Pick<ViewAtlasState, 'activeTool' | 'fogTool'> & { drawTool: Pick<ViewAtlasState['drawTool'], 'mode'> };

/**
 * What a tap places with the tool in hand: the fog tool's polygon is placed tap by tap, and the
 * lighting tool says for itself. A press of the note pin tool or of the Draw tool's stamps places
 * at once, where pins and stamps that are there are dragged; the sound tool's does too, and drags nothing.
 */
export function tapPlacingOf(state: TapPlacingState, lighting?: () => TapPlacing | null): TapPlacing | null {
  const { activeTool } = state;
  if (isFogTool(activeTool)) return state.fogTool.shape === 'polygon' ? 'taps' : null;
  if (activeTool === 'wall') return lighting?.() ?? null;
  if (activeTool === 'audio') return 'taps';
  return activeTool === 'note-pin' || (activeTool === 'draw' && state.drawTool.mode === 'stamp') ? 'press' : null;
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
  /**
   * Whether a press acts at once and for good: `onCanvas` on what the canvas draws at a point of
   * its own pixels (a bar's button), `onMap` on what the map's tools find at a world point (a door's badge).
   */
  pressActs?: { onCanvas: (x: number, y: number) => boolean; onMap: (worldX: number, worldY: number) => boolean };
  fingers: { readonly use: FingerUse; notePen: () => void };
  /** What a tap places with the lighting tool; unset or null, a press is the tool's as a mouse's is. */
  lightingTapPlacing?: () => TapPlacing | null;
  /** Opens the menu of the empty map at a world point, for a finger held there; `at` is the point of the window. */
  emptyMapMenu?: (world: { x: number; y: number }, at: { x: number; y: number }) => void;
}

export function mapGestureHost({ store, viewport, placing, marqueePending, menuAt, tapActsAt, pressActs, fingers, lightingTapPlacing, emptyMapMenu }: MapGestureParts): MapGestureHost {
  // Undo and redo are the GM's, as their keys are: not the table's. A tap never reaches into a
  // step that is still being written (a mouse's drag, a pen's stroke): it would take half of it back
  const travel = (direction: 'undo' | 'redo'): void => {
    const { isPlayerView, tableMode } = store.getState();
    if (!isPlayerView && !tableMode && !isHistoryTransactionOpen(store)) getHistoryStore(store)?.getState()[direction]();
  };
  return {
    fingerMode: () => {
      const state = store.getState();
      return fingerModeOf(state.activeTool, placing(), fingers.use, tapPlacingOf(state, lightingTapPlacing), state.tableMode !== null);
    },
    endLooking: () => store.getState().leaveTableMode(),
    pressedEmptyMap: marqueePending,
    menuAt: (x, y) => {
      const world = viewport.toWorld(x, y);
      return menuAt(world.x, world.y);
    },
    tapActsAt: (x, y) => {
      const world = viewport.toWorld(x, y);
      return tapActsAt(world.x, world.y);
    },
    pressActsAt: (x, y) => {
      if (!pressActs) return false;
      if (pressActs.onCanvas(x, y)) return true;
      const world = viewport.toWorld(x, y);
      return pressActs.onMap(world.x, world.y);
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

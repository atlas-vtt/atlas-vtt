import type { FederatedPointerEvent } from 'pixi.js';
import type { ViewAtlasState } from '../../storeFactory';
import { markHandled, resetHandled } from '../utils/handledEvents';
import { isCtrlClick, isPrimaryPress, isSecondaryPress } from '../utils/pointerButtons';
import { isFinger, withFineReach } from '../utils/pointerReach';
import type { AttachedLayers, LayerId, MapLayers, MenuClaim, PointerAt, PointerContext } from './mapLayers';
import { MAP_POINTER_ROWS, type PointerRow, type RowLayer } from './mapPointerRows';

export interface MapPointerHost {
  /** The view's store: the tool in hand and the selection. */
  readonly store: { getState(): Pick<ViewAtlasState, 'activeTool' | 'selectedIds' | 'clearSelection'> };
  /** Whether the canvas shows the GM's view: not session view, a peek or the palette's player mode. */
  gmView(): boolean;
  /** Whether the GM holds tokens to place (`TokenPlacer`): the pointer is theirs then. */
  placing(): boolean;
}

/** Opens a menu when the press `down` is released in place. */
export type OpenOnRelease = (down: FederatedPointerEvent, open: (up: FederatedPointerEvent) => void) => void;

/** The cursor a move over the map shows of its own: a pin's, a token's, a handle's, a tool's crosshair; null for none. */
export interface MoveCursor {
  readonly own: string | null;
}

type Question = 'tap' | 'pressActs';

/**
 * Which layer of the map takes a press, a secondary click, a tap and a move: one walk down the
 * map's order of layers (`MAP_POINTER_ROWS`) per gesture, which hands the event to the layer that
 * takes it. Each layer is attached by its owner when it is built. Takes world points; `viewportPointer`
 * feeds it the viewport's events.
 */
export class MapPointer {
  private readonly layers: AttachedLayers = {};

  constructor(private readonly host: MapPointerHost) {}

  attach<K extends LayerId>(id: K, layer: MapLayers[K]): void {
    this.layers[id] = layer;
  }

  /** A press of the map. A claimed press is marked (`markHandled`), so the viewport's other listeners leave it alone. */
  press(at: PointerAt, openOnRelease: OpenOnRelease): void {
    const { event } = at;
    // PIXI reuses its event objects: what the press before was claimed for goes first
    resetHandled(event);
    // A Ctrl+click on macOS is a secondary click whichever of Ctrl and the button is let go first: no tool takes its press or its tap
    if (isCtrlClick(event)) markHandled(event);
    // Held tokens take the pointer: a right-drag still pans, but nothing on the map opens its menu
    if (this.host.placing()) return;
    const context = this.context();
    const walk = (): void => (isSecondaryPress(event) ? this.openMenu(at, context, openOnRelease) : this.takePress(at, context));
    if (this.fingerOnToken(at, context)) withFineReach(walk);
    else walk();
  }

  /**
   * A move over the canvas. Returns the cursor of the map's own it shows (`own` null where nothing on
   * the map has one, and the canvas keeps the cursor a tool or panel set), or null where the move
   * says nothing of the cursor (tokens held or dragged).
   */
  move(at: PointerAt): MoveCursor | null {
    if (this.layers.tokens?.dragging()) return null;
    if (this.host.placing()) {
      this.leaveAll();
      return null;
    }
    const context = this.context();
    let above: RowLayer | null = null;
    let cursor: string | null = null;
    for (const row of MAP_POINTER_ROWS) {
      const claim = row.hover?.(this.layers, at, context, above);
      if (!claim) continue;
      cursor ??= claim.cursor;
      if (claim.covers) above ??= row.layer;
    }
    return { own: cursor };
  }

  /** The press was released, inside the canvas or outside it. */
  release(): void {
    const { activeTool } = this.host.store.getState();
    if (activeTool === 'wall') this.layers.walls?.pointerUp();
    else if (activeTool === 'stairs') this.layers.stairs?.pointerUp();
  }

  /** The gesture layer took the pointer away (`PointerGate.cancel`). */
  cancel(): void {
    if (this.host.store.getState().activeTool === 'wall') this.layers.walls?.pointerCancel();
  }

  doubleClick(): void {
    const { activeTool } = this.host.store.getState();
    if (activeTool === 'wall') this.layers.walls?.doubleClick();
    else if (activeTool === 'stairs') this.layers.stairs?.doubleClick();
  }

  /** The pointer left the canvas: nothing on the map is hovered, or its note or statblock preview would open on every later Cmd/Ctrl press. */
  leave(): void {
    if (!this.layers.tokens?.dragging()) this.leaveAll();
  }

  /** Whether a secondary click at a world point opens a menu: what a finger's long press there is for. */
  menuAt(x: number, y: number): boolean {
    if (this.host.placing()) return false;
    return this.menuClaim({ x, y }, this.context())?.opens ?? false;
  }

  /** Whether a tap at a world point acts on something whose press stays the empty map's: a linked hex, which opens its note. */
  tapActsAt(x: number, y: number): boolean {
    if (this.host.placing()) return false;
    return this.answer('tap', x, y, this.context());
  }

  /**
   * Whether a primary press at a world point does something at once that a lost pointer does not
   * take back. A finger's press there waits for its tap. A finger on a token reaches the marks
   * beside it only as a mouse does, as on the press itself.
   */
  pressActsAt(x: number, y: number): boolean {
    if (this.host.placing()) return false;
    const context = this.context();
    const ask = (): boolean => this.answer('pressActs', x, y, context);
    return context.tokenTool && this.layers.tokens?.hitTest(x, y) ? withFineReach(ask) : ask();
  }

  private takePress(at: PointerAt, context: PointerContext): void {
    for (const row of MAP_POINTER_ROWS) {
      if (row.press?.(this.layers, at, context) === 'claimed') {
        markHandled(at.event);
        return;
      }
    }
  }

  private openMenu(at: PointerAt, context: PointerContext, openOnRelease: OpenOnRelease): void {
    const claim = this.menuClaim(at, context);
    if (claim?.on === 'press') {
      markHandled(at.event);
      claim.press(at.event);
    } else if (claim) {
      openOnRelease(at.event, claim.open);
    }
  }

  private menuClaim(at: { x: number; y: number }, context: PointerContext): MenuClaim | null {
    for (const row of MAP_POINTER_ROWS) {
      const claim = row.menu?.(this.layers, at, context);
      if (claim) return claim;
    }
    return null;
  }

  private answer(question: Question, x: number, y: number, context: PointerContext): boolean {
    for (const row of MAP_POINTER_ROWS) {
      const answer = (row[question] as PointerRow['tap'])?.(this.layers, { x, y }, context);
      if (answer !== undefined && answer !== null) return answer;
    }
    return false;
  }

  /**
   * A finger reaches the marks on the map from further than a mouse does (`pointerReach`). One that
   * lies on a token the tool takes is that token's all the same: the pins, doors, lights and handles
   * beside it then take only the press a mouse would give them.
   */
  private fingerOnToken(at: PointerAt, context: PointerContext): boolean {
    if (!isFinger(at.event) || !isPrimaryPress(at.event) || !context.tokenTool) return false;
    return (this.layers.tokens?.hitTest(at.x, at.y) ?? null) !== null;
  }

  private leaveAll(): void {
    const { pins, hexLinks, tokens, mapFeatures, lights, measureHandles, annotations } = this.layers;
    pins?.hover(null);
    hexLinks?.hover(null);
    tokens?.hoverBar(null);
    tokens?.hover(null);
    mapFeatures?.leave();
    lights?.leave();
    measureHandles?.leave();
    annotations?.leave();
  }

  private context(): PointerContext {
    const { store } = this.host;
    const tool = store.getState().activeTool;
    return {
      tool,
      tokenTool: tool === 'select' || tool === 'move',
      gmView: () => this.host.gmView(),
      selectedIds: () => store.getState().selectedIds,
      clearSelection: () => store.getState().clearSelection(),
    };
  }
}

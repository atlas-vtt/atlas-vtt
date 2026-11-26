import type { Point } from '../../../grid/hexGeometry';
import { canRunMapHotkeys } from '../../../keyboard/mapHotkeys';
import { floorAlignment, movedFloorAlignment } from '../../../levels/floorPosition';
import { alignmentPlacement } from '../../../levels/levelAlignment';
import { viewedLevelId } from '../../../levels/sceneLevels';
import type { ViewAtlasStore } from '../../../storeFactory';
import type { MapStretch } from '../../../grid/mapStretch';
import type { GridState } from '../../../types/gridTypes';
import type { LevelAlignment } from '../../../types/sceneLevelTypes';

/** Arrow keys move a floor one cell; with Shift this many. */
const SHIFT_CELLS = 5;

/** The class the map's container carries while a floor is placed: the canvas shows a hand. */
const POSITIONING_CLASS = 'atlas-floor-positioning';
const DRAGGING_CLASS = 'atlas-floor-positioning--dragging';

/** Controls that use Enter or the arrow keys themselves: a key pressed on one is theirs. */
const OWN_KEYS = 'button, a, [role="slider"], [role="menuitem"], [role="option"], [role="tab"], [role="switch"]';

/** Whether `target` is a control that uses Enter or the arrow keys itself. */
function usesKeysItself(target: EventTarget | null): boolean {
  const node = target as Node | null;
  if (!node || typeof node.instanceOf !== 'function' || !node.instanceOf(Element)) return false;
  return node.closest(OWN_KEYS) !== null;
}

/**
 * Draws level `levelId` with `alignment`, and moves what stands on that level alone by as much
 * (`alignLevel`): one write. Nothing where the floor already lies there.
 */
export function placeFloor(store: ViewAtlasStore, levelId: string, alignment: LevelAlignment): void {
  const state = store.getState();
  const current = floorAlignment(state, levelId);
  const shift = { x: alignment.offset.x - current.offset.x, y: alignment.offset.y - current.offset.y };
  if (shift.x === 0 && shift.y === 0) return;
  state.alignLevel(levelId, alignment, (point) => ({ x: point.x + shift.x, y: point.y + shift.y }));
}

/** How far an arrow key moves a floor: one cell, on a hex grid one hex along its rows and one row across them. */
function cellStep({ size, type }: Pick<GridState, 'size' | 'type'>): Point {
  const row = (size * Math.sqrt(3)) / 2;
  if (type === 'hex-vertical') return { x: size, y: row };
  if (type === 'hex-horizontal') return { x: row, y: size };
  return { x: size, y: size };
}

const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export interface FloorPositioningDeps {
  store: ViewAtlasStore;
  viewId: string;
  canvas: HTMLCanvasElement;
  /** Screen pixels per world pixel now. */
  zoom: () => number;
  /**
   * Draws the floor the view shows with `placement` while it is moved, and nothing else (the map image alone, as the
   * grid alignment's preview does; what stands on the map fades out); null draws it as the scene has it again.
   */
  preview: (placement: MapStretch | null) => void;
  /** A move reached the world's edge and stopped short of where it went (true), or did not. */
  onStopped: (stopped: boolean) => void;
  /** Enter or Escape outside a drag: the GM is done. */
  onDone: () => void;
}

/** A move under way, shown and not yet written: the floor and where it is drawn now. */
interface Move {
  levelId: string;
  alignment: LevelAlignment;
}

/** A drag under way: where the floor lay when pressed and where the pointer was. */
interface Drag extends Move {
  from: LevelAlignment;
  start: Point;
  pointerId: number;
}

/**
 * Position floor's input on the map: a left drag anywhere moves the floor the view shows (by whole
 * cells; Alt frees it), the arrow keys move it a cell (Shift: five), and Enter or Escape end it.
 * The right button and the wheel stay the map's, so the GM pans and zooms as ever; the left press
 * is taken before the map's tools see it.
 *
 * A move is only drawn while it lasts (the map image, `preview`) and written once it ends: a drag
 * on release, a held arrow key once let go. Each is one store write, so one undo step. Writing at
 * every step moved every wall, light and token of the floor each time, and the walls' sealing, the
 * sight, the lights and the fog followed every one of them: the drag lagged.
 */
export class FloorPositioning {
  private drag: Drag | null = null;
  /** The arrow keys' move, written when the key is let go. */
  private nudging: Move | null = null;
  private readonly host: HTMLElement;
  private readonly win: Window;

  constructor(private readonly deps: FloorPositioningDeps) {
    this.host = deps.canvas.parentElement ?? deps.canvas;
    this.win = deps.canvas.ownerDocument.defaultView ?? window;
    this.host.classList.add(POSITIONING_CLASS);
    this.host.addEventListener('pointerdown', this.onPointerDown, true);
    this.win.addEventListener('keydown', this.onKeyDown, true);
    this.win.addEventListener('keyup', this.onKeyUp, true);
    this.win.addEventListener('blur', this.onBlur);
  }

  destroy(): void {
    this.endDrag(false);
    this.endNudge();
    this.host.classList.remove(POSITIONING_CLASS);
    this.host.removeEventListener('pointerdown', this.onPointerDown, true);
    this.win.removeEventListener('keydown', this.onKeyDown, true);
    this.win.removeEventListener('keyup', this.onKeyUp, true);
    this.win.removeEventListener('blur', this.onBlur);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.target !== this.deps.canvas || this.drag) return;
    this.endNudge();
    const state = this.deps.store.getState();
    const levelId = viewedLevelId(state);
    if (levelId === null) return;
    // The map's tools never see the press: the floor takes it.
    event.stopPropagation();
    event.preventDefault();
    const from = floorAlignment(state, levelId);
    this.drag = { levelId, from, alignment: from, start: { x: event.clientX, y: event.clientY }, pointerId: event.pointerId };
    this.host.classList.add(DRAGGING_CLASS);
    this.win.addEventListener('pointermove', this.onPointerMove, true);
    this.win.addEventListener('pointerup', this.onPointerUp, true);
    this.win.addEventListener('pointercancel', this.onPointerCancel, true);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    this.follow(drag, event);
  };

  /** Draws the drag where `event` has the pointer. */
  private follow(drag: Drag, event: PointerEvent): void {
    const zoom = this.deps.zoom() || 1;
    const delta = { x: (event.clientX - drag.start.x) / zoom, y: (event.clientY - drag.start.y) / zoom };
    const moved = movedFloorAlignment(this.deps.store.getState(), drag.from, delta, event.altKey);
    this.show(drag, moved.alignment);
    this.deps.onStopped(moved.stopped);
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    this.follow(drag, event);
    this.endDrag(true);
  };

  private readonly onPointerCancel = (): void => this.endDrag(false);

  private readonly onBlur = (): void => {
    this.endDrag(false);
    this.endNudge();
  };

  /** Draws `move`'s floor at `alignment`, unless it is drawn there already (the drag stays in its cell). */
  private show(move: Move, alignment: LevelAlignment): void {
    if (sameOffset(alignment, move.alignment) && alignment.scale === move.alignment.scale) return;
    move.alignment = alignment;
    this.deps.preview(alignmentPlacement(alignment));
  }

  /** Writes `move` (one store write, one undo step), and draws the floor as the scene has it from then on. */
  private commit(move: Move): void {
    placeFloor(this.deps.store, move.levelId, move.alignment);
    this.deps.preview(null);
  }

  /** Ends the drag: written where it was let go, or not at all. */
  private endDrag(keep: boolean): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.host.classList.remove(DRAGGING_CLASS);
    this.win.removeEventListener('pointermove', this.onPointerMove, true);
    this.win.removeEventListener('pointerup', this.onPointerUp, true);
    this.win.removeEventListener('pointercancel', this.onPointerCancel, true);
    if (keep) this.commit(drag);
    else this.deps.preview(null);
    this.deps.onStopped(false);
  }

  /** Writes what the arrow keys moved. */
  private endNudge(): void {
    const move = this.nudging;
    if (!move) return;
    this.nudging = null;
    this.commit(move);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || !canRunMapHotkeys(event, this.deps.viewId)) return;
    if (event.key === 'Escape' && this.drag) {
      this.take(event);
      this.endDrag(false);
      return;
    }
    if (this.drag || (event.key !== 'Escape' && usesKeysItself(event.target))) return;
    if (event.key === 'Escape' || event.key === 'Enter') {
      this.take(event);
      this.endNudge();
      this.deps.onDone();
      return;
    }
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    this.take(event);
    this.nudge(arrow, event.shiftKey ? SHIFT_CELLS : 1);
  };

  /** An arrow let go writes what the keys moved: a press, or a key held through its repeats, is one undo step. */
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (ARROWS[event.key]) this.endNudge();
  };

  private take(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /** Moves the floor shown `cells` cells the way of `arrow`; written once the key is let go. */
  private nudge(arrow: Point, cells: number): void {
    const state = this.deps.store.getState();
    const levelId = viewedLevelId(state);
    if (levelId === null || !state.grid) return;
    if (this.nudging?.levelId !== levelId) {
      this.endNudge();
      this.nudging = { levelId, alignment: floorAlignment(state, levelId) };
    }
    const move = this.nudging;
    const step = cellStep(state.grid);
    const delta = { x: arrow.x * step.x * cells, y: arrow.y * step.y * cells };
    const moved = movedFloorAlignment(state, move.alignment, delta, false);
    this.show(move, moved.alignment);
    this.deps.onStopped(moved.stopped);
  }
}

function sameOffset(a: LevelAlignment, b: LevelAlignment): boolean {
  return a.offset.x === b.offset.x && a.offset.y === b.offset.y;
}

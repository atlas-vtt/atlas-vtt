import { readLight } from '../../lighting/lightingObjects';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { directionTo, snapDirection } from '../../lighting/lightBeam';
import { lightMovedTo } from '../../lighting/lightArea';
import { worldToGameUnits } from '../../lighting/lightingUnits';
import { dragRange, maxLightRange, type RangeField } from '../../lighting/lightRanges';
import type { ViewAtlasStore } from '../../storeFactory';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { Point } from '../../types/visionTypes';
import type { LightMarkers } from './LightMarkers';
import type { LightRangeRings } from './LightRangeRings';
import { ringHandleCursor, ringRadiusAt } from './lightRingGeometry';
import { levelObjects } from '../../levels/levelObjects';

/** Screen pixels the pointer may move before a press on a marker is a drag, not a click. */
export const LIGHT_DRAG_THRESHOLD = 5;

/** What a press needs of the pointer event; PIXI reuses its event objects, so it is read at once. */
type Press = Pick<FederatedPointerEvent, 'global' | 'ctrlKey' | 'metaKey'>;

/** What the token renderer's viewport dispatch asks about placed lights, with any tool. */
export interface LightPointerHandlers {
  /** A left press at a world point; true when a marker or a ring handle took it. */
  pointerDown(worldX: number, worldY: number, event: FederatedPointerEvent): boolean;
  /** The cursor over a marker or ring handle, null over neither. */
  cursorAt(worldX: number, worldY: number): string | null;
  /** The pointer left the canvas. */
  leave(): void;
}

export interface LightInteractionDeps {
  viewport: Viewport;
  canvas: HTMLCanvasElement;
  store: ViewAtlasStore;
  markers: LightMarkers;
  rings: LightRangeRings;
  /** The lighting tool is in use: a press selects the light (and with the select or move tool too, a drag moves it). */
  canMove: () => boolean;
  /** A tool that moves things is in use (select or move): a drag moves a light, without selecting it for the lighting tool. */
  movesThings: () => boolean;
  /** Selects the light for the lighting tool; `add` toggles it in the selection. */
  select: (lightId: string, add: boolean) => void;
}

/** A press or drag under way. */
interface Gesture {
  /** The light whose ring handle is dragged; the drag is cancelled when the popover leaves that light. */
  ring: string | null;
  /** Something is being changed: a light moves, turns or has a range resized. */
  dragging: () => boolean;
  /** Ends it: a release commits what it changed as one undo step, a cancel puts it back and leaves none. */
  end: (commit: boolean) => void;
}

/**
 * The pointer on placed lights: a click on a marker opens the light's popover with any tool,
 * a drag moves the light with the lighting, select or move tool (a light glowing from an area, which
 * the generator lays over its lava or acid, stays where its surface is), and the handles of the open light's range
 * rings resize its ranges and turn its beam. A drag is one undo step, opened only once it starts. Only the
 * pointer's release commits a drag: Escape, a pointer cancel, the window losing focus, the
 * popover leaving the light or the canvas showing the players' view cancel it, which puts back
 * what it changed. A press anywhere else closes the popover.
 */
export class LightInteraction {
  private gesture: Gesture | null = null;
  /** A store write is being announced: a cancel in it closes its undo step only once that write is done. */
  private inStoreWrite = false;
  private readonly doc: Document;
  private readonly unsubscribe: () => void;
  private readonly abort = (): void => this.cancel();

  constructor(private readonly deps: LightInteractionDeps) {
    this.doc = deps.canvas.ownerDocument;
    this.doc.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.unsubscribe = deps.store.subscribe((state, previous) => {
      if (state.lightPopover === previous.lightPopover || !this.gesture?.ring || this.gesture.ring === state.lightPopover) return;
      this.inStoreWrite = true;
      try {
        this.cancel();
      } finally {
        this.inStoreWrite = false;
      }
    });
  }

  /** A light is being moved or turned, or a range resized. */
  get dragging(): boolean {
    return !!this.gesture?.dragging();
  }

  /**
   * A left press at a world point. True when a ring handle or a marker took it. With
   * `markersBlocked` (the lighting tool grabs a wall handle there, or draws past lights with
   * Shift), only the ring handles are asked.
   */
  pointerDown(point: Point, event: Press, markersBlocked = false): boolean {
    this.cancel();
    const handle = this.deps.rings.handleAt(point.x, point.y);
    if (handle) {
      if (handle === 'rotation') this.turn(point);
      else this.dragRing(handle, point);
      return true;
    }
    const lightId = markersBlocked ? null : this.deps.markers.hitTest(point.x, point.y);
    if (!lightId) return false;
    this.pressMarker(lightId, event);
    return true;
  }

  /** The cursor over a ring handle or a marker, which it marks as hovered; null over neither. */
  cursorAt(point: Point, markersBlocked = false): string | null {
    const { markers, rings } = this.deps;
    const handle = rings.handleAt(point.x, point.y);
    const lightId = handle || markersBlocked ? null : markers.hitTest(point.x, point.y);
    rings.setHovered(handle);
    markers.setHovered(lightId);
    const geometry = handle && rings.geometry();
    if (handle && geometry) return ringHandleCursor(geometry, handle);
    return lightId ? 'pointer' : null;
  }

  /** The pointer left the canvas. */
  clearHover(): void {
    this.deps.rings.setHovered(null);
    this.deps.markers.setHovered(null);
  }

  /** Cancels a press or drag under way: what a drag changed is put back, and it leaves no undo step. */
  cancel(): void {
    this.gesture?.end(false);
  }

  private pressMarker(lightId: string, event: Press): void {
    const { viewport, store, markers } = this.deps;
    const light = readLight(levelObjects(store.getState()).lights[lightId]);
    if (!light) return;
    const start = { x: event.global.x, y: event.global.y };
    const grabbed = viewport.toWorld(start.x, start.y);
    const origin = { x: light.x, y: light.y };
    const add = event.ctrlKey || event.metaKey;
    const editing = this.deps.canMove();
    if (editing) this.deps.select(lightId, add);
    const canMove = (editing || this.deps.movesThings()) && !light.area;
    let dragging = false;
    let moved = false;

    const onMove = (move: FederatedPointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(move.global.x - start.x, move.global.y - start.y) <= LIGHT_DRAG_THRESHOLD) return;
        moved = true;
        if (!canMove) return;
        dragging = true;
        beginHistoryTransaction(store);
        markers.setDragging(lightId);
      }
      const at = viewport.toWorld(move.global.x, move.global.y);
      // An area light's area moves along, from where it lay when the drag began.
      store.getState().updateLight(lightId, lightMovedTo(light, origin.x + at.x - grabbed.x, origin.y + at.y - grabbed.y));
    };
    this.track({
      ring: null,
      dragging: () => dragging,
      onMove,
      end: (commit) => {
        if (dragging) {
          markers.setDragging(null);
          this.settle(commit, () => store.getState().updateLight(lightId, lightMovedTo(light, origin.x, origin.y)), lightId);
        }
        if (commit && !moved && !add) store.getState().openLightPopover(lightId);
      },
    });
  }

  private dragRing(field: RangeField, grabbedAt: Point): void {
    const { viewport, store, rings } = this.deps;
    const lightId = store.getState().lightPopover;
    const geometry = rings.geometry();
    const emission = lightId ? readLight(levelObjects(store.getState()).lights[lightId])?.emission : undefined;
    if (!lightId || !geometry || !emission) return;
    // The handle keeps its distance to the pointer, so it does not jump when grabbed off-centre.
    const offset = ringRadiusAt(geometry, field, grabbedAt) - geometry.radius[field];
    beginHistoryTransaction(store);
    rings.setDragging(field);

    const onMove = (move: FederatedPointerEvent): void => {
      const light = readLight(levelObjects(store.getState()).lights[lightId]);
      if (!light) return;
      const at = viewport.toWorld(move.global.x, move.global.y);
      const radius = Math.max(0, ringRadiusAt(rings.geometry() ?? geometry, field, at) - offset);
      const scale = rings.unitScale();
      const next = dragRange(light.emission, field, worldToGameUnits(radius, scale), move.altKey, maxLightRange(scale));
      if (next !== light.emission) store.getState().updateLight(lightId, { emission: next });
    };
    this.track({
      ring: lightId,
      dragging: () => true,
      onMove,
      end: (commit) => {
        rings.setDragging(null);
        this.settle(commit, () => store.getState().updateLight(lightId, { emission }), lightId);
      },
    });
  }

  /** Turns the open light's beam with the handle beyond its dim arc: it faces the pointer, in steps of five degrees. */
  private turn(grabbedAt: Point): void {
    const { viewport, store, rings } = this.deps;
    const lightId = store.getState().lightPopover;
    const grabbed = lightId ? readLight(levelObjects(store.getState()).lights[lightId]) : undefined;
    if (!lightId || !grabbed) return;
    // A light that was never turned has no rotation, and faces up as with 0; a cancelled turn leaves it without one.
    const rotation = grabbed.rotation;
    // The handle keeps its angle to the pointer, so the light does not turn when it is grabbed off-centre.
    const offset = (rotation ?? 0) - directionTo(grabbed, grabbedAt);
    beginHistoryTransaction(store);
    rings.setDragging('rotation');

    const onMove = (move: FederatedPointerEvent): void => {
      const light = readLight(levelObjects(store.getState()).lights[lightId]);
      if (!light) return;
      const next = snapDirection(directionTo(light, viewport.toWorld(move.global.x, move.global.y)) + offset, move.altKey);
      if (next !== (light.rotation ?? 0)) store.getState().updateLight(lightId, { rotation: next });
    };
    this.track({
      ring: lightId,
      dragging: () => true,
      onMove,
      end: (commit) => {
        rings.setDragging(null);
        this.settle(commit, () => store.getState().updateLight(lightId, { rotation }), lightId);
      },
    });
  }

  /** Closes a drag's undo step: recorded on a commit; on a cancel `restore` puts the light back and no step is left. */
  private settle(commit: boolean, restore: () => void, lightId: string): void {
    const { store } = this.deps;
    if (commit) {
      endHistoryTransaction(store);
      return;
    }
    if (readLight(levelObjects(store.getState()).lights[lightId])) restore();
    // The history looks at a write once its listeners are done: closed inside one, the step
    // would be left for the write that cancelled the drag, with the drag's state as its past.
    if (this.inStoreWrite) queueMicrotask(() => abandonHistoryTransaction(store));
    else abandonHistoryTransaction(store);
  }

  /** Follows the pointer on the viewport until it is released, or the gesture is cancelled. */
  private track({ onMove, ...gesture }: Gesture & { onMove: (event: FederatedPointerEvent) => void }): void {
    const { viewport, canvas } = this.deps;
    const win = this.doc.defaultView;
    const onUp = (): void => this.gesture?.end(true);
    viewport.on('pointermove', onMove);
    viewport.on('pointerup', onUp);
    viewport.on('pointerupoutside', onUp);
    canvas.addEventListener('pointercancel', this.abort);
    win?.addEventListener('blur', this.abort);
    this.gesture = {
      ...gesture,
      end: (commit) => {
        this.gesture = null;
        viewport.off('pointermove', onMove);
        viewport.off('pointerup', onUp);
        viewport.off('pointerupoutside', onUp);
        canvas.removeEventListener('pointercancel', this.abort);
        win?.removeEventListener('blur', this.abort);
        gesture.end(commit);
      },
    };
  }

  /**
   * A press outside the popover closes it, wherever it lands, except on a light's marker or a
   * ring handle on the map: those are the popover's own (the dispatch then moves the popover to
   * that light, or starts the drag).
   */
  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    const { store, canvas, viewport, markers, rings } = this.deps;
    if (!store.getState().lightPopover) return;
    const target = elementOf(event.target);
    if (target?.closest('.atlas-light-popover')) return;
    if (target === canvas) {
      const rect = canvas.getBoundingClientRect();
      const point = viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top);
      if (rings.handleAt(point.x, point.y) || markers.hitTest(point.x, point.y)) return;
    }
    store.getState().closeLightPopover();
  };

  destroy(): void {
    this.cancel();
    this.unsubscribe();
    this.doc.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
  }
}

/**
 * The element an event came from. `instanceof Element` fails in a popout window, whose elements
 * belong to that window's classes; Obsidian's `instanceOf` asks the node's own window.
 */
function elementOf(target: EventTarget | null): Element | null {
  const node = target as Node | null;
  return node && typeof node.instanceOf === 'function' && node.instanceOf(Element) ? node : null;
}

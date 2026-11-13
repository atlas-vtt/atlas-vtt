/**
 * What the fog tool has under way: a drag with the brush, the lasso, the rectangle or over cells
 * (`FogDrag`), a polygon placed click by click (`FogPolygon`), or a click in a room the walls
 * enclose (`FogRoomClick`), with the marks that show it (the brush's ring, the outline, the
 * snapping guide) and the keys that change it (`FogStrokeKeys`). What it leaves is its
 * outcome's (`FogStrokeOutcome`): fog hidden or revealed, or in Areas mode an area. It is shown
 * while it is under way and committed when it ends, as one undo step. Which of them a press
 * begins is the gesture's to say (`FogGesture`).
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { MapRect } from '../../grid/cellNumbering';
import type { Point } from '../../types/visionTypes';
import type { FogShape } from '../../fog/fogToolChoices';
import { DEFAULT_MAP_HOTKEYS, matchesHotkey } from '../../keyboard/mapHotkeys';
import { STROKE_COLORS, type StrokeShape } from '../../tools/shapeStroke';
import type { LayerVisibility } from '../playerSafeFrame';
import type { FogAreasMode } from './FogAreasMode';
import { FogCursorPreview } from './FogCursorPreview';
import { FogDrag } from './FogDrag';
import { FogPolygon } from './FogPolygon';
import { FogRoomClick } from './FogRoomClick';
import { FogSnapGuide } from './FogSnapGuide';
import { FogSnapping, type PlaceKeys } from './FogSnapping';
import { FogStrokeKeys } from './FogStrokeKeys';
import { PlainFogStroke, type FogStrokeHost, type FogStrokeOutcome } from './fogStrokeOutcome';

export interface FogStrokeDeps {
  /** The fog's layer, which the shape's outline, the brush's ring and the snapping guide join. */
  readonly layer: PIXI.Container;
  readonly viewport: Viewport;
  /** The map's canvas: its window hears the stroke's keys. */
  readonly canvas: () => HTMLCanvasElement;
  readonly store: StoreApi<ViewAtlasState>;
  readonly host: FogStrokeHost;
  /** The map as the view draws it, which rooms are found on; unset or null, the Room shape finds none. */
  readonly mapRect?: () => MapRect | null;
  /** Whether a key pressed while a polygon waits for its next corner is this map's to take; unset, every key outside a text field is. */
  readonly keysBelongToMap?: (event: KeyboardEvent) => boolean;
  /** Whether a key is the map's undo as the GM has bound it; unset or undefined, the key it has by default. */
  readonly isUndoKey?: (event: KeyboardEvent) => boolean | undefined;
}

/** What a stroke asks of the fog tool's Areas mode: whether a shape becomes an area, and what is its own to drop. */
export type FogStrokeAreas = Pick<FogAreasMode, 'on' | 'stroke' | 'editor' | 'cancel'>;

/** The shapes that are drawn on the map; a room is clicked in. */
export type FogDrawnShape = Exclude<FogShape, 'room'>;

export class FogStroke {
  readonly drag: FogDrag;
  readonly polygon: FogPolygon;
  readonly snapping: FogSnapping;
  /** Where the pointer was last on the map: a key pressed while it rests places the point under it anew. */
  pointer: Point | null = null;
  private readonly rooms: FogRoomClick;
  /** What a shape leaves while the tool hides or reveals. */
  private readonly plain: PlainFogStroke;
  /** Alt is held: a gesture does the other of hiding and revealing. */
  private flipped = false;
  private readonly keys: FogStrokeKeys;
  private readonly ring: FogCursorPreview;
  private readonly guide: FogSnapGuide;
  /** The outline of a lasso, rectangle, polygon or cells under way, of the cell or the room under the pointer. */
  private readonly outline = new PIXI.Graphics();

  /** `areas` is asked whenever a stroke needs it: the mode is built with this stroke's snapping. */
  constructor(private readonly deps: FogStrokeDeps, private readonly areas: () => FogStrokeAreas) {
    const { layer, viewport, store } = deps;
    this.outline.eventMode = 'none';
    this.outline.zIndex = 1001;
    this.ring = new FogCursorPreview(viewport);
    this.ring.getDisplayObject().zIndex = 1002;
    this.guide = new FogSnapGuide(viewport);
    this.guide.view.zIndex = 1003;
    layer.addChild(this.outline, this.ring.getDisplayObject(), this.guide.view);

    const zoom = (): number => viewport.scale.x;
    this.snapping = new FogSnapping({ store, zoom, guide: this.guide });
    this.plain = new PlainFogStroke(store, deps.host);
    this.drag = new FogDrag(this.outline, this.snapping, zoom);
    this.rooms = new FogRoomClick({
      store, outline: this.outline, zoom,
      mapRect: () => deps.mapRect?.() ?? null,
      selects: () => this.areas().on && !this.flipped,
      select: (areaId) => this.areas().editor.select(areaId),
      fill: (world, room) => {
        this.outcome().begin(world);
        this.commit([{ type: 'lasso', points: room }]);
      },
    });
    this.polygon = new FogPolygon(this.outline, this.snapping, {
      zoom,
      reveals: () => this.reveals(),
      showOutline: (points) => this.outcome().preview(points ? [{ type: 'lasso', points }] : [], this.flipped),
      commit: (points) => this.commit([{ type: 'lasso', points }]),
      underWay: (active) => (active ? this.keys.hold() : this.keys.release()),
    });
    this.keys = new FogStrokeKeys(deps.canvas, {
      flipped: (held) => this.setFlipped(held),
      dropped: () => this.drop(),
      edited: (key, repeat) => this.edit(key, repeat),
      // A key held down repeats, and is still the map's undo.
      undoes: (event) => deps.isUndoKey?.(event) ?? matchesHotkey(event, DEFAULT_MAP_HOTKEYS.undo, true),
      rekeyed: (keys) => this.rekey(keys),
      // A drag holds the pointer; a polygon waits between its clicks, and must not take a dialog's keys.
      areMaps: (event) => !this.polygon.active || (deps.keysBelongToMap?.(event) ?? true),
    });
  }

  /** A drag or a polygon is under way: its preview is on the fog's canvas. */
  get active(): boolean {
    return this.drag.active || this.polygon.active;
  }

  /** Alt is held. */
  get altHeld(): boolean {
    return this.flipped;
  }

  /** Alt went down or up: the ring and what is under way show what it now does. */
  setFlipped(held: boolean): void {
    if (held === this.flipped) return;
    this.flipped = held;
    if (this.ring.shown) this.ring.show(this.reveals());
    this.refresh();
  }

  setBrushSize(size: number): void {
    this.drag.stroke.brushRadius = size;
    this.ring.setBrushRadius(size);
  }

  /** Shows the brush's ring at `world`, in the colour of what a stroke made now does. */
  showRingAt(world: Point): void {
    this.ring.updatePosition(world.x, world.y);
    this.ring.show(this.reveals());
  }

  hideRing(): void {
    this.ring.hide();
  }

  /** The brush is at `world`: its ring is there, and back on the map after the pointer had left it. */
  moveRing(world: Point): void {
    this.ring.updatePosition(world.x, world.y);
    if (!this.ring.shown) this.ring.show(this.reveals());
  }

  /** Begins `shape` at `world`, or places the next corner of the polygon under way. */
  begin(shape: FogDrawnShape, world: Point, screen: Point, keys: PlaceKeys): void {
    if (!this.active) this.outcome().begin(world);
    if (shape === 'polygon') {
      this.polygon.press(world, screen, keys);
    } else if (this.drag.begin(shape, world, keys, this.deps.store.getState().grid)) {
      this.keys.hold();
      this.preview();
    }
  }

  /** The drag under way goes on to `world`. */
  extend(world: Point, keys: PlaceKeys): void {
    this.pointer = world;
    if (this.drag.extend(world, keys)) this.preview();
  }

  /** The pointer rests at `world` with `shape` chosen: the guide shows where a first corner would land, Cells the cell and Room the room under it. */
  hover(shape: FogShape, world: Point, screen: Point, keys: PlaceKeys): void {
    this.pointer = world;
    if (shape === 'polygon') this.polygon.move(world, keys);
    else if (shape === 'room') this.rooms.hover(world, screen);
    else this.drag.hover(shape, world, keys, this.deps.store.getState().grid, this.color());
  }

  /** A press with the Room shape at `screen` on the canvas: a room is no shape until the press is released in place. */
  pressRoom(screen: Point): void {
    this.rooms.press(screen);
  }

  /** A click in place with the Room shape. */
  clickRoom(world: Point): void {
    this.rooms.click(world);
  }

  /** The pointer was released: a drag is committed, a press with the Room shape that never left its place is a click there. */
  release(): void {
    if (this.drag.active) this.commit(this.drag.finish());
    else if (this.pointer) this.rooms.release(this.pointer);
  }

  /** Nothing would begin where the pointer is, or what would has changed (the walls): the guide and the outline of the cell or room under it go. */
  rest(): void {
    this.snapping.clear();
    this.drag.cancel();
    this.rooms.forget();
  }

  /** Ends what is under way without committing it; the picture is the caller's to draw. */
  cancel(): void {
    this.drag.cancel();
    this.rooms.forget();
    this.polygon.drop();
    this.areas().cancel();
    this.keys.release();
    this.snapping.clear();
  }

  /** Drops what is under way, leaving the fog as the store holds it. */
  drop(): void {
    const wasActive = this.active;
    this.cancel();
    if (wasActive) this.deps.host.showCommitted();
  }

  /** The fog under a gesture changed, or what the gesture does: its preview is drawn again. */
  refresh(): void {
    if (this.active) this.preview();
  }

  /** The map was zoomed: what is outlined is drawn as wide on screen as before. */
  rescale(): void {
    this.polygon.rescale();
    this.rooms.rescale();
  }

  /**
   * Whether the canvas shows the stroke's marks: not while it shows the players' picture (a
   * peek), which has none of them. They keep what they show, and are back with the GM's view.
   */
  showMarks(shown: boolean): void {
    for (const mark of [this.ring.getDisplayObject(), this.outline, this.guide.view]) mark.renderable = shown;
  }

  /** What is the GM's alone: the ring, the outline of what is under way and the snapping guide. */
  layers(): LayerVisibility[] {
    return [this.ring.getDisplayObject(), this.outline, this.guide.view].map((layer) => ({ layer, visible: false }));
  }

  destroy(): void {
    this.keys.release();
    this.ring.destroy();
    this.guide.destroy();
    if (!this.outline.destroyed) this.outline.destroy();
  }

  /** What a shape made now leaves: an area in Areas mode, else fog hidden or revealed. */
  private outcome(): FogStrokeOutcome {
    const areas = this.areas();
    return areas.on ? areas.stroke : this.plain;
  }

  /** Whether a gesture made now takes away: the revealing tool's does, and Alt turns either tool's around; in Areas mode, Alt on a shape begun inside an area. */
  private reveals(): boolean {
    return this.outcome().takesAway(this.flipped);
  }

  /** The colour what is under way is outlined in: light where it hides, red where it reveals. */
  private color(): number {
    return this.reveals() ? STROKE_COLORS.erase : STROKE_COLORS.paint;
  }

  /** Enter closes the polygon under way, and Backspace (or the map's undo) takes its last corner back; a drag has no use for them. */
  private edit(key: 'Enter' | 'Backspace', repeat: boolean): boolean {
    if (!this.polygon.active) return false;
    if (repeat) return true;
    if (key === 'Enter') this.polygon.close();
    else if (!this.polygon.takeBack()) {
      this.outcome().end();
      this.deps.host.showCommitted();
    }
    return true;
  }

  /** Shift, Ctrl or Cmd went down or up while the pointer rests: the point under it lands as the keys now say. */
  private rekey(keys: PlaceKeys): void {
    if (this.polygon.active) this.polygon.rekey(keys);
    else if (this.pointer && this.drag.rekey(this.pointer, keys)) this.preview();
  }

  /** A gesture ended: its outcome writes its shapes in one undo step, or the picture goes back to the scene's where they leave nothing. */
  private commit(shapes: readonly StrokeShape[]): void {
    this.keys.release();
    this.snapping.clear();
    this.outcome().commit(shapes, this.flipped);
  }

  /** Shows what is under way as what it will leave: fog hidden or revealed on the fog itself, or an area's outline. */
  private preview(): void {
    if (this.polygon.active) {
      this.polygon.draw();
      return;
    }
    this.outcome().preview(this.drag.shapes(), this.flipped);
    this.drag.drawOutline(this.color());
  }
}

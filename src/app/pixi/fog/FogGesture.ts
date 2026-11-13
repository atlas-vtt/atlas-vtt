/**
 * The fog tool's gesture: a drag with the brush, the lasso, the rectangle or over cells
 * (`FogDrag`), a polygon placed click by click (`FogPolygon`), or a click in a room the walls
 * enclose (`FogRoomClick`). What it leaves is its outcome's
 * (`FogStrokeOutcome`): fog hidden or revealed, or in Areas mode an area (`FogAreasMode`, which
 * also selects and edits areas). It is shown while it is under way and committed when it ends,
 * as one undo step.
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { MapRect } from '../../grid/cellNumbering';
import type { Point } from '../../types/visionTypes';
import { isFogTool, type FogShape, type FogToolChoices } from '../../fog/fogToolChoices';
import { DEFAULT_MAP_HOTKEYS, matchesHotkey } from '../../keyboard/mapHotkeys';
import { STROKE_COLORS, type StrokeShape } from '../../tools/shapeStroke';
import type { LayerVisibility } from '../playerSafeFrame';
import { hearPressesLast, isHandled } from '../utils/handledEvents';
import { isPrimaryPress } from '../utils/pointerButtons';
import { FogAreasMode } from './FogAreasMode';
import { FogCursorPreview } from './FogCursorPreview';
import { FogDrag } from './FogDrag';
import { FogPolygon } from './FogPolygon';
import { FogRoomClick } from './FogRoomClick';
import { FogSnapGuide } from './FogSnapGuide';
import { FogSnapping, placeKeysOf, type PlaceKeys } from './FogSnapping';
import { FogStrokeKeys } from './FogStrokeKeys';
import { PlainFogStroke, type FogStrokeHost, type FogStrokeOutcome } from './fogStrokeOutcome';

export interface FogGestureDeps {
  /** The fog's layer, which the shape's outline, the brush's ring and the snapping guide join. */
  readonly layer: PIXI.Container;
  readonly viewport: Viewport;
  /** The map's canvas: its window hears the gesture's keys, and the ring goes when the pointer leaves it. */
  readonly canvas: () => HTMLCanvasElement;
  readonly store: StoreApi<ViewAtlasState>;
  readonly host: FogStrokeHost;
  /** The map as the view draws it, which rooms are found on; unset or null, the Room shape finds none. */
  readonly mapRect?: () => MapRect | null;
  /** Whether a key pressed while a polygon waits for its next corner is this map's to take; unset, every key outside a text field is. */
  readonly keysBelongToMap?: (event: KeyboardEvent) => boolean;
  /** Whether a key is the map's undo as the GM has bound it; unset or undefined, the key it has by default. */
  readonly isUndoKey?: (event: KeyboardEvent) => boolean | undefined;
  /** Whether the canvas shows the players' view though the store's view switches say the GM's (a peek). */
  readonly showsPlayers?: () => boolean | null;
}

export class FogGesture {
  /** The shape the bar has chosen. */
  private shape: FogShape;
  /** Whether the bar has the tool make areas. */
  private makesAreas: boolean;
  private readonly drag: FogDrag;
  private readonly polygon: FogPolygon;
  private readonly rooms: FogRoomClick;
  private readonly snapping: FogSnapping;
  /** What a shape leaves while the tool hides or reveals. */
  private readonly plain: PlainFogStroke;
  private readonly areas: FogAreasMode;
  /** Alt is held: a gesture does the other of hiding and revealing. */
  private flipped = false;
  /** Where the pointer was last on the map: a key pressed while it rests places the point under it anew. */
  private pointer: Point | null = null;
  private readonly keys: FogStrokeKeys;
  private readonly ring: FogCursorPreview;
  private readonly guide: FogSnapGuide;
  /** The outline of a lasso, rectangle, polygon or cells under way. */
  private readonly outline = new PIXI.Graphics();

  private readonly onPointerDown = (event: PIXI.FederatedPointerEvent): void => this.pointerDown(event);
  private readonly onPointerMove = (event: PIXI.FederatedPointerEvent): void => this.pointerMove(event);
  private readonly onPointerUp = (): void => this.pointerUp();
  private readonly onPointerLeave = (): void => this.pointerLeave();
  private readonly onZoomed = (): void => {
    this.polygon.rescale();
    this.areas.rescale();
    this.rooms.rescale();
  };

  constructor(private readonly deps: FogGestureDeps) {
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
    this.areas = new FogAreasMode({
      layer, viewport, canvas: deps.canvas, store, snapping: this.snapping, picture: deps.host,
      busy: () => this.active,
      ...(deps.keysBelongToMap && { keysBelongToMap: deps.keysBelongToMap }),
      ...(deps.showsPlayers && { showsPlayers: deps.showsPlayers }),
      host: {
        begin: (world, screen, keys) => this.begin(world, screen, keys),
        click: (world, screen, keys) => this.click(world, screen, keys),
        rest: () => this.rest(),
      },
    });
    this.drag = new FogDrag(this.outline, this.snapping, zoom);
    this.rooms = new FogRoomClick({
      store, outline: this.outline, zoom,
      mapRect: () => deps.mapRect?.() ?? null,
      selects: () => this.areas.on && !this.flipped,
      select: (areaId) => this.areas.editor.select(areaId),
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

    const { fogTool } = store.getState();
    this.shape = fogTool.shape;
    this.makesAreas = fogTool.areas;
    this.setBrushSize(fogTool.brushSize);

    viewport.on('pointerdown', this.onPointerDown);
    viewport.on('pointermove', this.onPointerMove);
    viewport.on('pointerup', this.onPointerUp);
    viewport.on('pointerupoutside', this.onPointerUp);
    viewport.on('zoomed', this.onZoomed);
    deps.canvas().addEventListener('pointerleave', this.onPointerLeave);
  }

  /** A gesture is under way: its preview is on the fog's canvas. */
  get active(): boolean {
    return this.drag.active || this.polygon.active;
  }

  /** The fog tool was taken up, or changed between hiding and revealing: the brush shows its ring, and what is under way what it now does. */
  start(): void {
    if (this.shape === 'brush') this.ring.show(this.reveals());
    this.refresh();
  }

  /** Another tool was taken up: what is under way goes without a trace, and the ring with it. */
  stop(): void {
    this.cancel();
    this.ring.hide();
  }

  /** Ends what is under way without committing it; the picture is the caller's to draw. */
  cancel(): void {
    this.drag.cancel();
    this.rooms.forget();
    this.polygon.drop();
    this.areas.cancel();
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

  /** The tool's choices changed in its bar or by a key: the brush takes its size, and another shape, or areas in place of fog, drops what is under way. */
  follow(choices: FogToolChoices): void {
    this.setBrushSize(choices.brushSize);
    if (choices.shape === this.shape && choices.areas === this.makesAreas) return;
    this.drop();
    this.shape = choices.shape;
    this.makesAreas = choices.areas;
    if (isFogTool(this.deps.store.getState().activeTool) && this.shape === 'brush') this.ring.show(this.reveals());
    else this.ring.hide();
  }

  /** The gesture hears presses after the dispatch that claims them; called once that dispatch listens. */
  hearPressesLast(): void {
    hearPressesLast(this.deps.viewport, this.onPointerDown);
  }

  /** The canvas shows another view (the GM's, or the players'): a selected area is the GM's alone. */
  refreshVisibility(): void {
    this.areas.refresh();
  }

  /** What is the GM's alone: the ring, the outline of what is under way, the snapping guide and what Areas mode shows. */
  playerLayers(): LayerVisibility[] {
    return [...[this.ring.getDisplayObject(), this.outline, this.guide.view].map((layer) => ({ layer, visible: false })), ...this.areaLayers()];
  }

  /** What Areas mode shows on the map: the selected area's handles, the outlines a stroke will leave. No picture of the scene has them. */
  areaLayers(): LayerVisibility[] {
    return this.areas.layers();
  }

  destroy(): void {
    const { viewport, canvas } = this.deps;
    viewport.off('pointerdown', this.onPointerDown);
    viewport.off('pointermove', this.onPointerMove);
    viewport.off('pointerup', this.onPointerUp);
    viewport.off('pointerupoutside', this.onPointerUp);
    viewport.off('zoomed', this.onZoomed);
    canvas().removeEventListener('pointerleave', this.onPointerLeave);
    this.keys.release();
    this.areas.destroy();
    this.ring.destroy();
    this.guide.destroy();
    if (!this.outline.destroyed) this.outline.destroy();
  }

  private setBrushSize(size: number): void {
    this.drag.stroke.brushRadius = size;
    this.ring.setBrushRadius(size);
  }

  /** What a shape made now leaves: an area in Areas mode, else fog hidden or revealed. */
  private outcome(): FogStrokeOutcome {
    return this.areas.on ? this.areas.stroke : this.plain;
  }

  /** Whether a gesture made now takes away: the revealing tool's does, and Alt turns either tool's around; in Areas mode, Alt on a shape begun inside an area. */
  private reveals(): boolean {
    return this.outcome().takesAway(this.flipped);
  }

  /** The colour what is under way is outlined in: light where it hides, red where it reveals. */
  private color(): number {
    return this.reveals() ? STROKE_COLORS.erase : STROKE_COLORS.paint;
  }

  /** Alt went down or up: the ring and what is under way show what it now does. */
  private setFlipped(held: boolean): void {
    if (held === this.flipped) return;
    this.flipped = held;
    if (this.ring.shown) this.ring.show(this.reveals());
    this.refresh();
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

  private pointerDown(event: PIXI.FederatedPointerEvent): void {
    const state = this.deps.store.getState();
    if (!isFogTool(state.activeTool)) return;
    // Only the primary button draws; the right button pans the map.
    if (!isPrimaryPress(event)) return;
    // A press a pin, door badge or light marker took draws no fog.
    if (isHandled(event)) return;

    this.setFlipped(event.altKey === true);
    const world = this.worldOf(event);
    const screen = { x: event.global.x, y: event.global.y };
    const keys = placeKeysOf(event);
    this.pointer = world;
    // In Areas mode a press is a shape only once the pointer moves: in place it selects.
    if (this.areas.on && !this.polygon.active) this.areas.press(world, screen, keys, this.flipped);
    else this.begin(world, screen, keys);
  }

  /** Begins the shape chosen at `world`, or places the next corner of the polygon under way. A room is no shape until the press is released in place. */
  private begin(world: Point, screen: Point, keys: PlaceKeys): void {
    if (this.shape === 'room') {
      if (!this.areas.on) this.rooms.press(screen);
      return;
    }
    if (!this.active) this.outcome().begin(world);
    if (this.shape === 'polygon') {
      this.polygon.press(world, screen, keys);
    } else if (this.drag.begin(this.shape, world, keys, this.deps.store.getState().grid)) {
      this.keys.hold();
      this.preview();
    }
  }

  private pointerMove(event: PIXI.FederatedPointerEvent): void {
    const state = this.deps.store.getState();
    const fogTool = isFogTool(state.activeTool);
    // Alt pressed or let go while the map had no key focus is told by the pointer.
    if (fogTool) this.setFlipped(event.altKey === true);
    const world = this.worldOf(event);
    const keys = placeKeysOf(event);

    // Areas mode: a drag of the selected area, a press that is no shape yet, a handle under the pointer.
    if (fogTool && !this.active && this.areas.on && this.areas.move(world, { x: event.global.x, y: event.global.y }, keys)) {
      this.pointer = world;
      return;
    }

    if (this.shape === 'brush' && fogTool) {
      this.ring.updatePosition(world.x, world.y);
      // Back on the map after the pointer had left it.
      if (!this.ring.shown) this.ring.show(this.reveals());
    }

    if (this.drag.active) {
      this.pointer = world;
      if (this.drag.extend(world, keys)) this.preview();
    } else if (fogTool) {
      this.pointer = world;
      // Before a press, the guide shows where a first corner would land, and Cells the cell under the pointer.
      if (this.shape === 'polygon') this.polygon.move(world, keys);
      else if (this.shape === 'room') this.rooms.hover(world, { x: event.global.x, y: event.global.y });
      else this.drag.hover(this.shape, world, keys, state.grid, this.color());
    }
  }

  /** The pointer left the map's canvas: the brush's ring, the guide and the cell under the pointer would stay where they last were. */
  private pointerLeave(): void {
    this.ring.hide();
    if (!this.active) this.rest();
  }

  /** Nothing would begin where the pointer is, or what would has changed (the walls): the guide and the outline of the cell or room under it go. */
  rest(): void {
    this.snapping.clear();
    this.drag.cancel();
    this.rooms.forget();
  }

  private pointerUp(): void {
    if (!this.active && this.areas.release()) return;
    if (this.drag.active) this.commit(this.drag.finish());
    else if (this.pointer) this.rooms.release(this.pointer);
  }

  /** A click in Areas mode that selected no area: a polygon's first corner, or the room clicked in. */
  private click(world: Point, screen: Point, keys: PlaceKeys): void {
    if (this.shape === 'polygon') this.begin(world, screen, keys);
    else if (this.shape === 'room') this.rooms.click(world);
  }

  /** A gesture ended: its outcome writes its shapes in one undo step, or the picture goes back to the scene's where they leave nothing. */
  private commit(shapes: readonly StrokeShape[]): void {
    this.keys.release();
    this.snapping.clear();
    this.outcome().commit(shapes, this.flipped);
  }

  private worldOf(event: PIXI.FederatedPointerEvent): Point {
    const { x, y } = this.deps.viewport.toWorld(event.global);
    return { x, y };
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

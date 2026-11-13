/**
 * The fog tool's gesture: a drag with the brush, the lasso, the rectangle or over cells
 * (`FogDrag`), or a polygon placed click by click (`FogPolygon`), that hides or reveals. It is
 * shown on the fog while it is under way and committed when it ends, as one undo step.
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { FogOperation } from '../../types/fogTypes';
import type { Point } from '../../types/visionTypes';
import { fogStrokeReveals, isFogTool, type FogShape, type FogToolChoices } from '../../fog/fogToolChoices';
import { DEFAULT_MAP_HOTKEYS, matchesHotkey } from '../../keyboard/mapHotkeys';
import { STROKE_COLORS, type StrokeShape } from '../../tools/shapeStroke';
import type { LayerVisibility } from '../playerSafeFrame';
import { hearPressesLast, isHandled } from '../utils/handledEvents';
import { isPrimaryPress } from '../utils/pointerButtons';
import { FogCursorPreview } from './FogCursorPreview';
import { FogDrag } from './FogDrag';
import { FogPolygon } from './FogPolygon';
import { FogSnapGuide } from './FogSnapGuide';
import { FogSnapping, placeKeysOf, type PlaceKeys } from './FogSnapping';
import { FogStrokeKeys } from './FogStrokeKeys';

/** A shape as the fog shows it before it is the scene's. */
function previewOf(shape: StrokeShape, isErasing: boolean): FogOperation {
  return { id: '__preview__', kind: 'fog', timestamp: Date.now(), isErasing, ...shape };
}

/** What a gesture asks of the fog's picture. */
export interface FogGestureHost {
  /** Shows the fog with what is under way on it; without a shape that is an area yet, the fog as the scene holds it. */
  showStroke(stroke: FogOperation | readonly FogOperation[] | undefined): void;
  /** A gesture ended without leaving fog: the picture goes back to what the scene holds. */
  showCommitted(): void;
}

export interface FogGestureDeps {
  /** The fog's layer, which the shape's outline, the brush's ring and the snapping guide join. */
  readonly layer: PIXI.Container;
  readonly viewport: Viewport;
  /** The map's canvas: its window hears the gesture's keys, and the ring goes when the pointer leaves it. */
  readonly canvas: () => HTMLCanvasElement;
  readonly store: StoreApi<ViewAtlasState>;
  readonly host: FogGestureHost;
  /** Whether a key pressed while a polygon waits for its next corner is this map's to take; unset, every key outside a text field is. */
  readonly keysBelongToMap?: (event: KeyboardEvent) => boolean;
  /** Whether a key is the map's undo as the GM has bound it; unset or undefined, the key it has by default. */
  readonly isUndoKey?: (event: KeyboardEvent) => boolean | undefined;
}

export class FogGesture {
  /** The shape the bar has chosen. */
  private shape: FogShape;
  private readonly drag: FogDrag;
  private readonly polygon: FogPolygon;
  private readonly snapping: FogSnapping;
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
  private readonly onZoomed = (): void => this.polygon.rescale();

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
    this.drag = new FogDrag(this.outline, this.snapping, zoom);
    this.polygon = new FogPolygon(this.outline, this.snapping, {
      zoom,
      reveals: () => this.reveals(),
      showStroke: (stroke) => deps.host.showStroke(stroke),
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
    this.polygon.drop();
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

  /** The tool's choices changed in its bar or by a key: the brush takes its size, and another shape drops what is under way. */
  follow(choices: FogToolChoices): void {
    this.setBrushSize(choices.brushSize);
    if (choices.shape === this.shape) return;
    this.drop();
    this.shape = choices.shape;
    if (isFogTool(this.deps.store.getState().activeTool) && this.shape === 'brush') this.ring.show(this.reveals());
    else this.ring.hide();
  }

  /** The gesture hears presses after the dispatch that claims them; called once that dispatch listens. */
  hearPressesLast(): void {
    hearPressesLast(this.deps.viewport, this.onPointerDown);
  }

  /** What is the GM's alone: the ring, the outline of what is under way and the snapping guide. */
  playerLayers(): LayerVisibility[] {
    return [this.ring.getDisplayObject(), this.outline, this.guide.view].map((layer) => ({ layer, visible: false }));
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
    this.ring.destroy();
    this.guide.destroy();
    if (!this.outline.destroyed) this.outline.destroy();
  }

  private setBrushSize(size: number): void {
    this.drag.stroke.brushRadius = size;
    this.ring.setBrushRadius(size);
  }

  /** Whether a gesture made now reveals: the revealing tool's does, and Alt turns either tool's around. */
  private reveals(): boolean {
    return fogStrokeReveals(this.deps.store.getState().activeTool, this.flipped);
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
    else if (!this.polygon.takeBack()) this.deps.host.showCommitted();
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
    const keys = placeKeysOf(event);
    this.pointer = world;
    if (this.shape === 'polygon') {
      this.polygon.press(world, { x: event.global.x, y: event.global.y }, keys);
    } else if (this.drag.begin(this.shape, world, keys, state.grid)) {
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
      else this.drag.hover(this.shape, world, keys, state.grid, this.color());
    }
  }

  /** The pointer left the map's canvas: the brush's ring, the guide and the cell under the pointer would stay where they last were. */
  private pointerLeave(): void {
    this.ring.hide();
    if (this.active) return;
    this.snapping.clear();
    this.drag.cancel();
  }

  private pointerUp(): void {
    if (this.drag.active) this.commit(this.drag.finish());
  }

  /** A gesture ended: its shapes become fog in one undo step, or the picture goes back to the scene's where it left none. */
  private commit(shapes: readonly StrokeShape[]): void {
    this.keys.release();
    this.snapping.clear();
    const isErasing = this.reveals();
    const { addFogOperation, addFogOperations } = this.deps.store.getState();
    const [only] = shapes;
    if (!only) this.deps.host.showCommitted();
    else if (shapes.length === 1) addFogOperation({ ...only, isErasing });
    else addFogOperations(shapes.map((shape) => ({ ...shape, isErasing })));
  }

  private worldOf(event: PIXI.FederatedPointerEvent): Point {
    const { x, y } = this.deps.viewport.toWorld(event.global);
    return { x, y };
  }

  /** Shows what is under way as the fog it will leave: hidden or revealed on the fog itself, whatever the shape. */
  private preview(): void {
    if (this.polygon.active) {
      this.polygon.draw();
      return;
    }
    const reveals = this.reveals();
    const shapes = this.drag.shapes().map((shape) => previewOf(shape, reveals));
    this.deps.host.showStroke(shapes.length > 1 ? shapes : shapes[0]);
    this.drag.drawOutline(this.color());
  }
}

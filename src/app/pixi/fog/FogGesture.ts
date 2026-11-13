/**
 * The fog tool's gesture: one press, drag and release with the brush, the lasso or the rectangle
 * that hides or reveals, shown on the fog while the pointer is down and committed on release.
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { FogOperation } from '../../types/fogTypes';
import { fogStrokeReveals, isFogTool, type FogShape, type FogToolChoices } from '../../fog/fogToolChoices';
import { STROKE_COLORS, ShapeStroke, type StrokeMode } from '../../tools/shapeStroke';
import type { LayerVisibility } from '../playerSafeFrame';
import { hearPressesLast, isHandled } from '../utils/handledEvents';
import { isPrimaryPress } from '../utils/pointerButtons';
import { drawStrokeArea } from '../utils/strokePreview';
import { FogCursorPreview } from './FogCursorPreview';
import { FogStrokeKeys } from './FogStrokeKeys';

/** How wide a lasso's or rectangle's outline is while it is drawn, in screen pixels. */
const OUTLINE_PX = 2;

/** The stroke a shape is drawn with; the shapes that are no drag of the pointer have gestures of their own. */
function strokeModeOf(shape: FogShape): StrokeMode {
  return shape === 'rectangle' || shape === 'lasso' ? shape : 'brush';
}

/** What a gesture asks of the fog's picture. */
export interface FogGestureHost {
  /** Shows the fog with the stroke under way on it; without a stroke that is an area yet, the fog as the scene holds it. */
  showStroke(stroke: FogOperation | undefined): void;
  /** A stroke ended without leaving fog: the picture goes back to what the scene holds. */
  showCommitted(): void;
}

export interface FogGestureDeps {
  /** The fog's layer, which the stroke's outline and the brush's ring join. */
  readonly layer: PIXI.Container;
  readonly viewport: Viewport;
  /** The map's canvas: its window hears the stroke's keys, and the ring goes when the pointer leaves it. */
  readonly canvas: () => HTMLCanvasElement;
  readonly store: StoreApi<ViewAtlasState>;
  readonly host: FogGestureHost;
}

export class FogGesture {
  /** The stroke under way, with the brush, lasso or rectangle. */
  private readonly stroke = new ShapeStroke();
  /** Alt is held: a stroke does the other of hiding and revealing. */
  private flipped = false;
  private readonly keys: FogStrokeKeys;
  private readonly ring: FogCursorPreview;
  /** The outline of a lasso or rectangle under way. */
  private readonly outline = new PIXI.Graphics();

  private readonly onPointerDown = (event: PIXI.FederatedPointerEvent): void => this.pointerDown(event);
  private readonly onPointerMove = (event: PIXI.FederatedPointerEvent): void => this.pointerMove(event);
  private readonly onPointerUp = (): void => this.pointerUp();
  private readonly onPointerLeave = (): void => this.pointerLeave();

  constructor(private readonly deps: FogGestureDeps) {
    this.outline.eventMode = 'none';
    this.outline.zIndex = 1001;
    deps.layer.addChild(this.outline);

    this.ring = new FogCursorPreview(deps.viewport);
    const ring = this.ring.getDisplayObject();
    ring.zIndex = 1002;
    deps.layer.addChild(ring);

    this.keys = new FogStrokeKeys(deps.canvas, {
      flipped: (held) => this.setFlipped(held),
      dropped: () => this.drop(),
    });

    const { fogTool } = deps.store.getState();
    this.stroke.mode = strokeModeOf(fogTool.shape);
    this.setBrushSize(fogTool.brushSize);

    deps.viewport.on('pointerdown', this.onPointerDown);
    deps.viewport.on('pointermove', this.onPointerMove);
    deps.viewport.on('pointerup', this.onPointerUp);
    deps.viewport.on('pointerupoutside', this.onPointerUp);
    deps.canvas().addEventListener('pointerleave', this.onPointerLeave);
  }

  /** A stroke is under way: its preview is on the fog's canvas. */
  get active(): boolean {
    return this.stroke.active;
  }

  /** The fog tool was taken up, or changed between hiding and revealing: the brush shows its ring. */
  start(): void {
    if (this.stroke.mode === 'brush') this.ring.show(this.reveals());
  }

  /** Another tool was taken up: the stroke under way goes without a trace, and the ring with it. */
  stop(): void {
    this.cancel();
    this.ring.hide();
  }

  /** Ends the stroke under way without committing it; the picture is the caller's to draw. */
  cancel(): void {
    this.stroke.cancel();
    this.keys.release();
    this.outline.clear();
  }

  /** The tool's choices changed in its bar or by a key: the brush takes its size, and another shape drops the stroke under way. */
  follow(choices: FogToolChoices): void {
    this.setBrushSize(choices.brushSize);
    const mode = strokeModeOf(choices.shape);
    if (mode !== this.stroke.mode) this.setMode(mode);
  }

  /** The gesture hears presses after the dispatch that claims them; called once that dispatch listens. */
  hearPressesLast(): void {
    hearPressesLast(this.deps.viewport, this.onPointerDown);
  }

  /** What is the GM's alone: the ring and the outline of a stroke under way. */
  playerLayers(): LayerVisibility[] {
    return [this.ring.getDisplayObject(), this.outline].map((layer) => ({ layer, visible: false }));
  }

  destroy(): void {
    const { viewport, canvas } = this.deps;
    viewport.off('pointerdown', this.onPointerDown);
    viewport.off('pointermove', this.onPointerMove);
    viewport.off('pointerup', this.onPointerUp);
    viewport.off('pointerupoutside', this.onPointerUp);
    canvas().removeEventListener('pointerleave', this.onPointerLeave);
    this.keys.release();
    this.ring.destroy();
    if (!this.outline.destroyed) this.outline.destroy();
  }

  private setBrushSize(size: number): void {
    this.stroke.brushRadius = size;
    this.ring.setBrushRadius(size);
  }

  private setMode(mode: StrokeMode): void {
    this.drop();
    this.stroke.mode = mode;
    if (isFogTool(this.deps.store.getState().activeTool) && mode === 'brush') this.ring.show(this.reveals());
    else this.ring.hide();
  }

  /** Whether a stroke made now reveals: the revealing tool's does, and Alt turns either tool's around. */
  private reveals(): boolean {
    return fogStrokeReveals(this.deps.store.getState().activeTool, this.flipped);
  }

  /** Alt went down or up: the ring and the stroke under way show what the stroke now does. */
  private setFlipped(held: boolean): void {
    if (held === this.flipped) return;
    this.flipped = held;
    if (this.ring.shown) this.ring.show(this.reveals());
    if (this.stroke.active) this.preview();
  }

  /** Drops the stroke under way, leaving the fog as the store holds it. */
  private drop(): void {
    const wasActive = this.stroke.active;
    this.cancel();
    if (wasActive) this.deps.host.showCommitted();
  }

  private pointerDown(event: PIXI.FederatedPointerEvent): void {
    if (!isFogTool(this.deps.store.getState().activeTool)) return;
    // Only the primary button paints; the right button pans the map.
    if (!isPrimaryPress(event)) return;
    // A press a pin, door badge or light marker took paints no fog.
    if (isHandled(event)) return;

    this.setFlipped(event.altKey === true);
    this.stroke.begin(this.strokePoint(event));
    this.keys.hold();
    this.preview();
  }

  private pointerMove(event: PIXI.FederatedPointerEvent): void {
    const fogTool = isFogTool(this.deps.store.getState().activeTool);
    // Alt pressed or let go while the map had no key focus is told by the pointer.
    if (fogTool) this.setFlipped(event.altKey === true);

    if (this.stroke.mode === 'brush' && fogTool) {
      const worldPos = this.deps.viewport.toWorld(event.global);
      this.ring.updatePosition(worldPos.x, worldPos.y);
      // Back on the map after the pointer had left it.
      if (!this.ring.shown) this.ring.show(this.reveals());
    }

    if (!this.stroke.active) return;
    this.stroke.extend(this.strokePoint(event));
    this.preview();
  }

  /** The pointer left the map's canvas: the brush's ring would stay where it last was. */
  private pointerLeave(): void {
    this.ring.hide();
  }

  private pointerUp(): void {
    if (!this.stroke.active) return;
    const shape = this.stroke.finish();
    this.keys.release();
    this.outline.clear();
    if (shape) this.deps.store.getState().addFogOperation({ ...shape, isErasing: this.reveals() });
    else this.deps.host.showCommitted();
  }

  /** Where the pointer is on the map; a rectangle's corners snap to the grid's. */
  private strokePoint(event: PIXI.FederatedPointerEvent): { x: number; y: number } {
    const { x, y } = this.deps.viewport.toWorld(event.global);
    return this.stroke.mode === 'rectangle' ? this.snapToGridCorner(x, y) : { x, y };
  }

  private snapToGridCorner(x: number, y: number): { x: number; y: number } {
    const grid = this.deps.store.getState().grid;
    if (!grid?.size) return { x, y };
    const { size, offsetX = 0, offsetY = 0 } = grid;
    return {
      x: Math.round((x - offsetX) / size) * size + offsetX,
      y: Math.round((y - offsetY) / size) * size + offsetY,
    };
  }

  /**
   * Shows the stroke under way as the fog it will leave: hidden or revealed on the fog itself,
   * whatever the shape. A lasso and a rectangle also show their outline, which tells the shape
   * where it hides what is hidden already.
   */
  private preview(): void {
    const reveals = this.reveals();
    const shape = this.stroke.shape();
    // No shape yet (a lasso of two points, a rectangle without a size) shows the fog as it is
    const stroke: FogOperation | undefined = shape ? { id: '__preview__', kind: 'fog', timestamp: Date.now(), isErasing: reveals, ...shape } : undefined;
    this.deps.host.showStroke(stroke);
    if (this.stroke.mode === 'brush') return;
    drawStrokeArea(this.outline, this.stroke, reveals ? STROKE_COLORS.erase : STROKE_COLORS.paint, OUTLINE_PX / this.deps.viewport.scale.x, false);
  }
}

import { AlphaFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { countsInBrushStroke, strokePolygons, type ExploredEditMode } from '../../lighting/exploredEdits';
import { STROKE_COLORS, type ShapeStroke } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import type { MapBounds } from '../../vision/visibility';
import { FogCursorPreview } from '../fog/FogCursorPreview';
import { destroyTree } from '../utils/destroyTree';
import { drawStrokeArea } from '../utils/strokePreview';

/** Above the lighting (90), so it is not darkened with the map; below the wall lines and every marker. */
export const EXPLORED_OVERLAY_Z_INDEX = 91;
/** Faint: the map and its light stay readable through it. */
const OVERLAY_ALPHA = 0.22;
const OUTLINE_WIDTH = 2;

/**
 * What the scene remembers, as the GM sees it while editing: the explored memory's own texture
 * in the theme's accent, faint over the map, with the stroke under way as it will land (a
 * reveal adds to the tint, a forget cuts it away), its outline and the brush's ring. The tint
 * and the stroke are drawn into one layer that is faded as a whole, so a stroke that crosses
 * itself, or memory, is no darker there. A GM overlay (`GmOverlays`).
 */
export class ExploredOverlay {
  readonly view = new Container({ label: 'explored-memory', zIndex: EXPLORED_OVERLAY_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly layer = new Container();
  private readonly memory = new Sprite(Texture.EMPTY);
  private readonly pending = new Graphics();
  /** The last stretch of a brush stroke, up to the pointer: drawn anew with every move. */
  private readonly tail = new Graphics();
  private readonly outline = new Graphics();
  private readonly cursor: FogCursorPreview;
  private readonly fade = new AlphaFilter({ alpha: OVERLAY_ALPHA, resolution: 'inherit' });
  /** How many points of the brush stroke under way were looked at, and the last of them the stroke keeps. */
  private brushed = 0;
  private kept: Point | null = null;
  private tint = 0xffffff;
  /** The pointer the ring was last placed at: a redraw with the same point keeps the place the ring followed the camera to. */
  private placedAt: Point | null = null;

  constructor(private readonly viewport: Viewport) {
    this.cursor = new FogCursorPreview(viewport);
    this.layer.filters = [this.fade];
    this.layer.addChild(this.memory, this.pending, this.tail);
    this.view.addChild(this.layer, this.outline, this.cursor.getDisplayObject());
    this.view.visible = false;
    viewport.addChild(this.view);
  }

  /** The memory's texture over a map of `bounds`, or none: taken before the last one is destroyed. */
  setTexture(texture: Texture | null, bounds: MapBounds | null): void {
    // The memory may let go of its texture after the overlay is gone.
    if (this.view.destroyed) return;
    this.memory.texture = texture ?? Texture.EMPTY;
    this.memory.visible = !!texture && !!bounds;
    if (bounds) this.memory.setSize(bounds.width, bounds.height);
  }

  /** The colour the memory shows in: the theme's accent. */
  setTint(color: number): void {
    this.tint = color;
    this.memory.tint = color;
  }

  /** The brush's ring at the pointer, in the stroke's colour; hidden for the other shapes and without a pointer. */
  drawCursor(at: Point | null, stroke: ShapeStroke, mode: ExploredEditMode): void {
    if (!at || stroke.mode !== 'brush') {
      this.cursor.hide();
      this.placedAt = null;
      return;
    }
    this.cursor.setBrushRadius(stroke.brushRadius);
    if (at !== this.placedAt) this.cursor.updatePosition(at.x, at.y);
    this.placedAt = at;
    this.cursor.show(mode === 'forget');
  }

  /**
   * The stroke under way: what it will do to the memory, and the outline of a lasso or rectangle.
   * A brush stroke is drawn as it will be stamped (`strokePolygons`): a stretch between each two
   * points the stroke keeps, added once, and one from the last of them to the pointer.
   */
  drawStroke(stroke: ShapeStroke, mode: ExploredEditMode): void {
    const shape = stroke.shape();
    this.pending.blendMode = this.tail.blendMode = mode === 'forget' ? 'erase' : 'normal';
    this.tail.clear();
    if (shape?.type === 'brush') {
      const { points, brushRadius } = shape;
      const stretch = (from: Point, to: Point): Point[][] => strokePolygons({ type: 'brush', brushRadius, points: [from, to] });
      this.kept ??= points[0] ?? null;
      for (const point of points.slice(this.brushed)) {
        if (!this.kept || !countsInBrushStroke(this.kept, point, brushRadius)) continue;
        fill(this.pending, stretch(this.kept, point), this.tint);
        this.kept = point;
      }
      this.brushed = points.length;
      const last = points[points.length - 1];
      if (this.kept && last) fill(this.tail, stretch(this.kept, last), this.tint);
    } else {
      this.clearBrush();
      if (shape) fill(this.pending, strokePolygons(shape), this.tint);
    }
    // The layer shows the area itself, as the memory will hold it.
    drawStrokeArea(this.outline, stroke, mode === 'forget' ? STROKE_COLORS.erase : STROKE_COLORS.paint, OUTLINE_WIDTH / this.viewport.scale.x, false);
  }

  clearStroke(): void {
    this.clearBrush();
    this.outline.clear();
  }

  private clearBrush(): void {
    this.pending.clear();
    this.tail.clear();
    this.brushed = 0;
    this.kept = null;
  }

  destroy(): void {
    this.layer.filters = null;
    this.fade.destroy();
    this.cursor.destroy();
    // The texture is the memory's own.
    this.memory.texture = Texture.EMPTY;
    destroyTree(this.view);
  }
}

function fill(g: Graphics, polygons: readonly Point[][], color: number): void {
  for (const polygon of polygons) g.poly(polygon.flatMap((point) => [point.x, point.y])).fill({ color });
}

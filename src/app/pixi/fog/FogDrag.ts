/**
 * One press, drag and release of the fog tool: with the brush, the lasso, the rectangle or over
 * the grid's cells. It keeps the drag and says what it covers; the tool decides what that does.
 */
import type * as PIXI from 'pixi.js';
import { CellStroke, cellShapes, cellsOnSegment, hasCells } from '../../fog/fogCells';
import { squaredCorner } from '../../fog/fogConstrain';
import type { FogShape } from '../../fog/fogToolChoices';
import type { GridGeometry } from '../../grid/gridDistance';
import { ShapeStroke, type StrokeShape } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import { drawStrokeArea } from '../utils/strokePreview';
import type { FogSnapping, PlaceKeys } from './FogSnapping';

/** How wide a shape's outline is while it is drawn, in screen pixels. */
const OUTLINE_PX = 2;

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

export class FogDrag {
  /** The stroke under way, with the brush, lasso or rectangle. */
  readonly stroke = new ShapeStroke();
  /** The drag over cells under way. */
  private readonly cells = new CellStroke();
  /** The shape the drag under way is made with. */
  private shape: FogShape = 'brush';
  /** A rectangle's first corner, as it was placed. */
  private placed: Point | null = null;
  /** The cell outlined under a pointer that rests on none yet, as it was drawn; empty while none is. */
  private hovered = '';

  constructor(
    /** Where the outline of what is dragged is drawn. */
    private readonly outline: PIXI.Graphics,
    private readonly snapping: FogSnapping,
    /** Screen pixels per world pixel. */
    private readonly zoom: () => number,
  ) {}

  /** A drag is under way. */
  get active(): boolean {
    return this.stroke.active || this.cells.active;
  }

  /**
   * Begins a drag with `shape` at `world`: a rectangle's corner snaps, the brush and the lasso go
   * where the pointer is, and cells are those of `grid`. False where none begins: the shape is
   * not dragged, or the map has no cells to drag over.
   */
  begin(shape: FogShape, world: Point, keys: PlaceKeys, grid: GridGeometry | null): boolean {
    this.cancel();
    this.shape = shape;
    if (shape === 'cells') {
      if (hasCells(grid)) this.cells.begin(grid, world);
      return this.cells.active;
    }
    if (shape !== 'brush' && shape !== 'rectangle' && shape !== 'lasso') return false;
    if (shape === 'rectangle') this.placed = this.snapping.corner(world, keys);
    this.stroke.mode = shape;
    this.stroke.begin(this.placed ?? world);
    return true;
  }

  /** Takes the drag on to `world`. False where that changed nothing: it passed no further cell. */
  extend(world: Point, keys: PlaceKeys): boolean {
    if (this.cells.active) return this.cells.extend(world);
    if (!this.stroke.active) return false;
    if (this.shape === 'rectangle') {
      const corner = this.snapping.corner(world, keys);
      const squared = keys.shift && this.placed ? squaredCorner(this.placed, corner) : corner;
      // A square's corner lies where the square puts it, on nothing of the map's.
      if (!same(squared, corner)) this.snapping.clear();
      this.stroke.extend(squared);
    } else {
      this.stroke.extend(world);
    }
    return true;
  }

  /** Shift, Ctrl or Cmd went down or up while the pointer rests at `world`: true where a rectangle's corner was placed anew. */
  rekey(world: Point, keys: PlaceKeys): boolean {
    return this.stroke.active && this.shape === 'rectangle' && this.extend(world, keys);
  }

  /**
   * Before a press, shows where a drag with `shape` would begin at `world`: the guide on the place
   * a rectangle's corner would land, or the outline of the cell of `grid` under the pointer, in `color`.
   */
  hover(shape: FogShape, world: Point, keys: PlaceKeys, grid: GridGeometry | null, color: number): void {
    if (shape === 'rectangle') this.snapping.corner(world, keys);
    else if (shape === 'cells') this.hoverCell(world, grid, color);
  }

  /** What the drag covers so far; nothing while that is no area yet (a lasso of two points, a rectangle without a size). */
  shapes(): readonly StrokeShape[] {
    if (this.cells.active) return this.cells.shapes();
    const shape = this.stroke.shape();
    return shape ? [shape] : [];
  }

  /** Ends the drag and hands over what it covers (`shapes`). */
  finish(): readonly StrokeShape[] {
    const shapes = this.shapes();
    this.cancel();
    return shapes;
  }

  /** Drops the drag, and the outline of a cell the pointer rested on. */
  cancel(): void {
    this.stroke.cancel();
    this.cells.cancel();
    this.placed = null;
    this.hovered = '';
    this.outline.clear();
  }

  /**
   * Draws the outline of what is dragged in `color`, which tells a shape where it hides what is
   * hidden already. A brush stroke has none: the fog shows it.
   */
  drawOutline(color: number): void {
    const width = OUTLINE_PX / this.zoom();
    if (this.cells.active) {
      this.outline.clear();
      for (const shape of this.cells.shapes()) this.outline.poly(shape.points.flatMap((point) => [point.x, point.y]), true);
      this.outline.stroke({ width, color, alpha: 0.6 });
    } else if (this.stroke.active && this.shape !== 'brush') {
      drawStrokeArea(this.outline, this.stroke, color, width, false);
    }
  }

  /** Outlines the cell under a resting pointer, as the brush shows its ring; drawn anew only for another cell. */
  private hoverCell(world: Point, grid: GridGeometry | null, color: number): void {
    const width = OUTLINE_PX / this.zoom();
    const [cell] = hasCells(grid) ? cellShapes(grid, cellsOnSegment(grid, world, world)) : [];
    const first = cell?.points[0];
    const hovered = cell && first ? `${first.x},${first.y}|${color}|${width}` : '';
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.outline.clear();
    if (!cell) return;
    this.outline.poly(cell.points.flatMap((point) => [point.x, point.y]), true);
    this.outline.stroke({ width, color, alpha: 0.6 });
  }
}

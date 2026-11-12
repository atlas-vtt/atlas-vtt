import { Graphics, type Container } from 'pixi.js';
import type { GridGeometry } from '../../grid/gridDistance';
import type { AreaOnMap } from '../../measure/areaOnMap';
import { cellOutline, hexLayoutOf } from '../../measure/measureGrid';
import type { Point } from '../../types/visionTypes';
import { destroyTree } from '../utils/destroyTree';

/** How a body is drawn. It lies on the map like paint, so its lines are world pixels and grow with the zoom. */
const BODY = {
  /** The wash over the whole area: present, never hiding the map. */
  wash: 0.12,
  /** What a covered cell adds to the wash. */
  cell: 0.16,
  outline: 0.9,
  /** The outline's width as a share of a cell, and its least. */
  outlineWidth: 1 / 28,
  minOutlineWidth: 2,
  /** How far a covered cell's tint stays from the cell's edge, as a share of the cell and at least: the gaps are the cell edges. */
  cellInset: 0.025,
  minCellInset: 1,
} as const;

/** How far past an area's reach a cell it covers may lie, in cells: no farther than a cell is wide from corner to corner. */
const CELL_REACH = 1.5;

const flat = (ring: readonly Point[]): number[] => ring.flatMap(({ x, y }) => [x, y]);

/**
 * The body of one measured area, in world space under the tokens and the lighting: a light wash of
 * its colour over its shape as walls leave it, a stronger tint on each cell it covers (set in from
 * the cell's edge, so the cells read as cells, and cut by the walls the area stops at), and its
 * outline, drawn inside its edge: nothing of it lies past a wall it stops at. The lighting lights
 * it like the floor. Drawn again only for another area, colour or cell size.
 */
export class AreaBody {
  readonly view = new Graphics({ label: 'measure-body' });
  private drawn: { readonly onMap: AreaOnMap; readonly color: number; readonly size: number } | null = null;

  constructor(parent: Container) {
    parent.addChild(this.view);
  }

  /** Draws `onMap` in `color` on `grid`; nothing for a measurement that is no area. */
  draw(onMap: AreaOnMap | null, color: number, grid: GridGeometry): void {
    if (!onMap) {
      this.clear();
      return;
    }
    const drawn = this.drawn;
    if (drawn && drawn.onMap === onMap && drawn.color === color && drawn.size === grid.size) return;
    this.drawn = { onMap, color, size: grid.size };
    const g = this.view;
    g.clear();
    const rings = onMap.area.rings.filter((ring) => ring.length > 2).map(flat);
    if (rings.length === 0) return;
    for (const ring of rings) g.poly(ring, true);
    g.fill({ color, alpha: BODY.wash });
    if (traceCells(g, onMap, grid)) g.fill({ color, alpha: BODY.cell });
    for (const ring of rings) g.poly(ring, true);
    g.stroke({ width: Math.max(BODY.minOutlineWidth, grid.size * BODY.outlineWidth), color, alpha: BODY.outline, alignment: 1, join: 'round' });
  }

  clear(): void {
    if (!this.drawn) return;
    this.drawn = null;
    this.view.clear();
  }

  destroy(): void {
    destroyTree(this.view);
  }
}

/**
 * Every covered cell as a tile a little smaller than the cell. A covered cell reaches past the
 * area's outline, so where the area stops at walls its tiles are cut by the same walls: nothing of
 * a body lies past a wall. False where nothing was traced.
 */
function traceCells(g: Graphics, { cells, withinWalls }: AreaOnMap, grid: GridGeometry): boolean {
  if (!cells || cells.length === 0) return false;
  const inset = Math.max(BODY.minCellInset, grid.size * BODY.cellInset);
  // A cell's edges lie half its size from its centre.
  const shrink = 1 - inset / (grid.size / 2);
  if (!(shrink > 0)) return false;
  if (!withinWalls && !hexLayoutOf(grid)) {
    const half = (grid.size / 2) * shrink;
    for (const { centre } of cells) g.rect(centre.x - half, centre.y - half, 2 * half, 2 * half);
    return true;
  }
  const tiles = cells.map(({ centre }) => cellOutline(grid, centre).map(({ x, y }) => ({ x: centre.x + (x - centre.x) * shrink, y: centre.y + (y - centre.y) * shrink })));
  const left = (withinWalls ? withinWalls(tiles, grid.size * CELL_REACH) : tiles).filter((tile) => tile.length > 2);
  for (const tile of left) g.poly(flat(tile), true);
  return left.length > 0;
}

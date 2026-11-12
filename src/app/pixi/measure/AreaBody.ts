import { Container, Graphics } from 'pixi.js';
import type { GridGeometry } from '../../grid/gridDistance';
import type { AreaOnMap } from '../../measure/areaOnMap';
import type { MeasureEffect } from '../../measure/measureEffects';
import { cellOutline, hexLayoutOf } from '../../measure/measureGrid';
import type { Point } from '../../types/visionTypes';
import { hexColorOf } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import type { AreaEffects } from './effects/AreaEffects';
import { MeasureEffectMesh } from './effects/MeasureEffectMesh';

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

/** The look a body is drawn with in place of its wash. */
export interface BodyEffect {
  readonly effect: MeasureEffect;
  /** What tells its pattern from another area's of the same look: the measurement's id. */
  readonly seed: string;
  /** Where its pattern holds on: the area's origin, an aura's token. */
  readonly origin: Point;
}

/** A kept area's effect with the id its pattern is seeded by. */
export type BodyLook = Omit<BodyEffect, 'origin'>;

interface DrawnBody {
  readonly onMap: AreaOnMap;
  readonly color: number;
  readonly size: number;
  readonly look: BodyEffect | null;
}

const sameLook = (a: BodyEffect | null, b: BodyEffect | null): boolean =>
  a === b || (a !== null && b !== null && a.effect === b.effect && a.seed === b.seed && a.origin.x === b.origin.x && a.origin.y === b.origin.y);

/**
 * The body of one measured area, in world space under the tokens and the lighting: a light wash of
 * its colour over its shape as walls leave it, a stronger tint on each cell it covers (set in from
 * the cell's edge, so the cells read as cells, and cut by the walls the area stops at), and its
 * outline, drawn inside its edge: nothing of it lies past a wall it stops at. The lighting lights
 * it like the floor. An area with an effect has that in the wash's place (`MeasureEffectMesh`, of
 * exactly the same shape, under the cells and the outline), played with the view's other effects
 * (`AreaEffects`). Drawn again only for another area, colour, cell size or look; an area that only
 * moved moves its effect and builds none.
 */
export class AreaBody {
  readonly view = new Container({ label: 'measure-body', eventMode: 'none', interactiveChildren: false });
  private readonly paint = new Graphics({ label: 'measure-body-paint' });
  private effect: MeasureEffectMesh | null = null;
  private drawn: DrawnBody | null = null;

  /** Without `effects` (or where they cannot be drawn) every area keeps its wash. */
  constructor(parent: Container, private readonly effects: AreaEffects | null = null) {
    this.view.addChild(this.paint);
    parent.addChild(this.view);
  }

  /** Draws `onMap` in `color` on `grid`, with `effect` in its wash's place; nothing for a measurement that is no area. */
  draw(onMap: AreaOnMap | null, color: number, grid: GridGeometry, effect: BodyEffect | null = null): void {
    if (!onMap) {
      this.clear();
      return;
    }
    const look = effect && this.effects?.drawable ? effect : null;
    const drawn = this.drawn;
    if (drawn && drawn.onMap === onMap && drawn.color === color && drawn.size === grid.size && sameLook(drawn.look, look)) return;
    this.drawn = { onMap, color, size: grid.size, look };
    const g = this.paint;
    g.clear();
    const rings = onMap.area.rings.filter((ring) => ring.length > 2).map(flat);
    this.showEffect(rings.length > 0 ? look : null, onMap, color, grid.size);
    if (rings.length === 0) return;
    if (!look) {
      for (const ring of rings) g.poly(ring, true);
      g.fill({ color, alpha: BODY.wash });
    }
    if (traceCells(g, onMap, grid)) g.fill({ color, alpha: BODY.cell });
    for (const ring of rings) g.poly(ring, true);
    g.stroke({ width: Math.max(BODY.minOutlineWidth, grid.size * BODY.outlineWidth), color, alpha: BODY.outline, alignment: 1, join: 'round' });
  }

  clear(): void {
    if (!this.drawn) return;
    this.drawn = null;
    this.paint.clear();
    this.showEffect(null);
  }

  destroy(): void {
    this.showEffect(null);
    destroyTree(this.view);
  }

  /** The effect of the area drawn, changed in place: built for the first look and for another shape, moved with an area that moved. */
  private showEffect(look: BodyEffect | null, onMap?: AreaOnMap, color = 0, cell = 0): void {
    const { effects } = this;
    if (!look || !onMap || !effects) {
      if (!this.effect) return;
      effects?.remove(this.effect);
      this.effect.destroy();
      this.effect = null;
      return;
    }
    const options = { rings: onMap.area.rings, effect: look.effect, color: hexColorOf(color), cell, origin: look.origin, seed: look.seed };
    if (this.effect) {
      this.effect.update(options);
      return;
    }
    this.effect = new MeasureEffectMesh({ ...options, detail: effects.detail });
    this.view.addChildAt(this.effect.view, 0);
    effects.add(this.effect);
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

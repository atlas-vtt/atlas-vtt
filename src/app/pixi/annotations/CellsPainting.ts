import { Graphics, type Container } from 'pixi.js';
import type { StoreApi } from 'zustand';
import { annotationList, annotationRoom } from '../../annotations/annotationList';
import { orderOnTop } from '../../annotations/annotationStack';
import { addedParts, CELL_FILL_OPACITY, cellsFilled, cellsShape, cellsUnfilled, coveredByFills, shapeWithin, type CellFillLook } from '../../annotations/cellFill';
import { cellGrid, cellsCrossed, type CellGrid, type GridCell } from '../../annotations/cellGrid';
import type { DrawLayer } from '../../annotations/annotationTypes';
import type { LiveDrawing } from '../../annotations/madeDrawing';
import type { UnderWay } from '../../annotations/underWay';
import type { FilledPart } from '../../annotations/quantized';
import type { MapRect } from '../../grid/cellNumbering';
import type { GridGeometry } from '../../grid/gridDistance';
import { levelObjects } from '../../levels/levelObjects';
import { unionShapes } from '../../lighting/polygonClip';
import type { ViewAtlasState } from '../../storeFactory';
import type { QShape } from '../../types/shapeTypes';
import type { Point } from '../../types/visionTypes';
import type { Box } from '../../vision/polygonBounds';
import { paintInk } from '../drawingLayer';
import { destroyTree } from '../utils/destroyTree';

export interface CellsPaintingDeps {
  readonly store: StoreApi<ViewAtlasState>;
  /** The layer the cells under way are shown in: the one their fill will lie in. */
  layerOf(place: DrawLayer, hidden: boolean): Container;
  /** Where the tool's own marks go, which only the GM's view of the canvas shows: the cells an unfill will clear. */
  readonly chrome: Container;
  /** The grid whose cells are filled; null where the map has none, or it is switched off. */
  grid(): GridGeometry | null;
  /** The map, at whose edge a cell's fill ends; null without one. */
  bounds(): MapRect | null;
  /** Screen pixels to a world pixel. */
  zoom(): number;
  /** Tells the GM that the level shown holds as many drawings as it may. */
  full(): void;
  /** Is told the cells being filled, for whoever shows them elsewhere. */
  readonly underWay: UnderWay;
}

/** What one drag of the Cells mode has passed so far. */
interface CellsDrag {
  readonly grid: CellGrid;
  /** The cells are cleared, where they would be filled. */
  readonly unfill: boolean;
  readonly look: CellFillLook;
  readonly bounds: Box | null;
  /** The scene and level it began on: its cells are written to no other. */
  readonly mapPath: string | null;
  readonly level: string | null | undefined;
  /** The cells passed, by their key. */
  readonly cells: Map<string, GridCell>;
  /** Their area. */
  shape: QShape;
  /** What cell fills of the look cover already: worked out when the first cell is shown. */
  covered: QShape | null;
}

/** The marks over cells an unfill will clear: a light veil in a dark and a light line, which read on any map. */
const CLEARING = { veil: 0.28, dark: 0x000000, light: 0xffffff, line: 1.5 } as const;

const flat = (ring: readonly Point[]): number[] => ring.flatMap(({ x, y }) => [x, y]);

/** An area of the cells being filled as the drawing it will be part of: a fill without a line, in the cells' look. */
function partDrawing({ outline, holes }: FilledPart, look: CellFillLook): LiveDrawing {
  return {
    type: 'line', points: [...outline, outline[0]!], color: look.color, width: 0, opacity: CELL_FILL_OPACITY, fill: 'solid',
    ...(holes.length > 0 && { holes }), ...(look.hidden && { hidden: true as const }), ...(look.layer === 'map' && { layer: 'map' as const }),
  };
}

/**
 * A drag of the Draw tool's Cells mode. The cells the pointer passes are shown while the drag
 * lasts: those it fills as their fill will look, less what fills of their look cover already (so
 * nothing is darker under the pointer than it will be), in the layer the fill will lie in; those
 * it clears under the GM's own marks. A cell of another colour shows the new colour over the old
 * one until the release, which takes the old one out of it. The release writes all of it at once
 * (`cellsFilled`, `cellsUnfilled`: one `replaceDrawings`, one undo step), and a dropped drag
 * writes nothing.
 *
 * The cells are worked out anew only where the pointer came into a cell it had not passed.
 */
export class CellsPainting {
  private readonly filling = new Graphics({ label: 'annotation-cells-live', eventMode: 'none', zIndex: Number.MAX_SAFE_INTEGER });
  private readonly clearing = new Graphics({ label: 'annotation-cells-clearing', eventMode: 'none' });
  private drag: CellsDrag | null = null;

  constructor(private readonly deps: CellsPaintingDeps) {
    deps.chrome.addChild(this.clearing);
  }

  /** Whether cells can be filled now: the map has a grid that is shown. */
  get ready(): boolean {
    return this.deps.grid() !== null;
  }

  /** A drag begins, with the tool's choices as they are now. */
  begin(): void {
    this.clear();
    const geometry = this.deps.grid();
    const grid = geometry ? cellGrid(geometry) : null;
    if (!grid) return;
    const { drawTool, mapPath, viewedLevel } = this.deps.store.getState();
    const map = this.deps.bounds();
    this.drag = {
      grid,
      mapPath,
      level: viewedLevel,
      unfill: drawTool.cellsUnfill,
      look: { color: drawTool.color, layer: drawTool.cellsLayer, hidden: !drawTool.players },
      bounds: map ? { minX: map.x, minY: map.y, maxX: map.x + map.width, maxY: map.y + map.height } : null,
      cells: new Map(),
      shape: [],
      covered: null,
    };
  }

  /** The pointer went along `path` (one point for a dab). */
  sweep(path: readonly Point[]): void {
    const drag = this.drag;
    const first = path[0];
    if (!drag || !first) return;
    const entered: GridCell[] = [];
    for (let i = 0; i < Math.max(1, path.length - 1); i++) {
      for (const cell of cellsCrossed(drag.grid, path[i]!, path[i + 1] ?? first)) {
        if (drag.cells.has(cell.key)) continue;
        drag.cells.set(cell.key, cell);
        entered.push(cell);
      }
    }
    // The pointer stayed in cells it had passed: nothing is worked out, nothing drawn.
    if (entered.length === 0) return;
    const fresh = cellsShape(entered);
    drag.shape = drag.shape.length > 0 ? unionShapes(drag.shape, fresh) : fresh;
    this.show(drag);
  }

  /** The drag is over: its cells are written, in one step. */
  finish(): void {
    const drag = this.drag;
    this.clear();
    if (drag && this.write(drag)) this.deps.underWay.made();
    else this.deps.underWay.drop();
  }

  /** The drag is dropped: nothing of it stays. */
  drop(): void {
    this.clear();
    this.deps.underWay.drop();
  }

  /** Writes the cells of `drag`; false where nothing was written. */
  private write(drag: CellsDrag): boolean {
    if (drag.cells.size === 0) return false;
    const state = this.deps.store.getState();
    // Another scene or level is shown by now: the cells were none of its.
    if (state.mapPath !== drag.mapPath || state.viewedLevel !== drag.level) return false;
    const objects = levelObjects(state);
    const list = annotationList(objects);
    const cells = [...drag.cells.values()];
    const change = drag.unfill ? cellsUnfilled(cells, list) : cellsFilled(cells, drag.look, list, orderOnTop(state), drag.bounds);
    if (!change) return false;
    // A fill that falls apart, or cells that touch no fill of their look, leave more drawings than they take: where the level cannot hold them, nothing is written.
    if (change.added.length - change.removed.length > annotationRoom(objects).drawings) {
      this.deps.full();
      return false;
    }
    state.replaceDrawings(change.removed, change.added);
    return true;
  }

  private clear(): void {
    this.drag = null;
    this.filling.clear();
    this.filling.removeFromParent();
    this.clearing.clear();
  }

  destroy(): void {
    this.drag = null;
    destroyTree(this.filling);
    destroyTree(this.clearing);
  }

  private show(drag: CellsDrag): void {
    if (drag.unfill) {
      this.mark(addedParts(drag.shape, []));
      return;
    }
    drag.covered ??= coveredByFills(drag.look, annotationList(levelObjects(this.deps.store.getState())));
    const layer = this.deps.layerOf(drag.look.layer, drag.look.hidden);
    if (this.filling.parent !== layer) layer.addChild(this.filling);
    this.filling.clear();
    const parts = addedParts(shapeWithin(drag.shape, drag.bounds), drag.covered);
    this.deps.underWay.show(parts.filter(({ outline }) => outline.length >= 3).map((part) => partDrawing(part, drag.look)), false);
    paintInk(this.filling, { fill: { parts, alpha: CELL_FILL_OPACITY }, lines: [], heads: [], even: null, width: 0, alpha: 1 }, drag.look.color);
  }

  /** Marks the cells an unfill will clear. */
  private mark(parts: readonly FilledPart[]): void {
    const graphics = this.clearing;
    const line = CLEARING.line / this.deps.zoom();
    graphics.clear();
    for (const { outline, holes } of parts) {
      if (outline.length < 3) continue;
      graphics.poly(flat(outline), true).fill({ color: CLEARING.light, alpha: CLEARING.veil });
      for (const hole of holes) graphics.poly(flat(hole), true).cut();
    }
    for (const [color, width] of [[CLEARING.dark, 3 * line], [CLEARING.light, line]] as const) {
      for (const { outline, holes } of parts) {
        for (const ring of [outline, ...holes]) {
          if (ring.length >= 3) graphics.poly(flat(ring), true);
        }
      }
      graphics.stroke({ color, width, alpha: 0.9, join: 'round' });
    }
  }
}

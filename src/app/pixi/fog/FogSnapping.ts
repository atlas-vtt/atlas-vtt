/**
 * Where the points of the fog tool's shapes land on this map (`fogSnap.ts`), and the guide that
 * shows what one snapped to. The grid counts only while its Snap switch is on; Ctrl or Cmd places
 * a point freely.
 */
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { NO_SNAP, snapHeldPoint, snapPoint, type FogSnap, type FogSnapCandidates } from '../../fog/fogSnap';
import type { GridGeometry } from '../../grid/gridDistance';
import { levelObjects } from '../../levels/levelObjects';
import type { Point } from '../../types/visionTypes';
import { wallList } from '../../vision/wallList';

/** Screen pixels: how near the pointer must be to a corner, a wall's end or an edge to land on it. */
const SNAP_REACH = 10;

/** The keys that change where a point lands. */
export interface PlaceKeys {
  /** Ctrl or Cmd: the point lies where the pointer is. */
  readonly free: boolean;
  /** Shift: a square, or a polygon's edge in eighths of a turn. */
  readonly shift: boolean;
}

/** The keys of a pointer or key event; a synthetic event may carry no modifier state at all. */
export function placeKeysOf(event: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): PlaceKeys {
  return { free: event.ctrlKey === true || event.metaKey === true, shift: event.shiftKey === true };
}

/** What the guide shows: a place, and the line it lies on where it snapped to one (a `FogSnapTarget` is one). */
export interface FogGuideMark {
  readonly point: Point;
  readonly from?: Point;
  readonly to?: Point;
}

export interface FogSnappingDeps {
  readonly store: Pick<StoreApi<ViewAtlasState>, 'getState'>;
  /** Screen pixels per world pixel. */
  readonly zoom: () => number;
  readonly guide: { show(mark: FogGuideMark | null): void };
}

export class FogSnapping {
  constructor(private readonly deps: FogSnappingDeps) {}

  /**
   * Where a corner of a rectangle or a polygon lands for the pointer at `world`. `from` is the
   * polygon's corner before it, which Shift holds its edge to eighths of a turn from.
   */
  corner(world: Point, keys: PlaceKeys, from: Point | null = null): Point {
    const held = keys.shift && from ? from : null;
    const candidates = keys.free ? NO_SNAP : this.candidates();
    return this.shown(held ? snapHeldPoint(held, world, candidates, this.reach()) : snapPoint(world, candidates, this.reach()));
  }

  /** Shows a place a point will land on that is no snap of the map's: the corner a polygon closes on. Null shows none. */
  mark(point: Point | null): void {
    this.deps.guide.show(point ? { point } : null);
  }

  /** Nothing is pointed at any more: the guide goes. */
  clear(): void {
    this.deps.guide.show(null);
  }

  private shown(snap: FogSnap): Point {
    this.deps.guide.show(snap.to);
    return snap.point;
  }

  private reach(): number {
    const zoom = this.deps.zoom();
    return SNAP_REACH / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  }

  /** The grid points snap to: none while its Snap switch is off. */
  private grid(): GridGeometry | null {
    const { grid } = this.deps.store.getState();
    return grid && grid.size > 0 && (grid.snapToGrid ?? true) ? grid : null;
  }

  private candidates(): FogSnapCandidates {
    const objects = levelObjects(this.deps.store.getState());
    return { grid: this.grid(), walls: wallList(objects.walls) };
  }
}

import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasStore } from '../../storeFactory';
import { roomSizesOf } from '../../stores/roomsSlice';
import { AxisLock } from '../../tools/axisLock';
import { pulled } from '../../tools/stabilizer';
import { switchApplies } from '../../types/toolSwitches';
import type { Point } from '../../types/visionTypes';

/** Screen px a Shift-held stroke moves before it knows whether its line is level or upright. */
const AXIS_SLACK = 6;

/**
 * Where the rooms mode's pointer lands. A corner or a door's end lands on the grid with Shift
 * (`snapped`). The brush at rest is the pointer; during a brush or bucket stroke it is the pointer
 * steadied: on Stabilization's rope (`pulled`, twice the brush's size) and, with Shift, on a level
 * or upright line (`AxisLock`). It also keeps where the pointer is on screen, so a zoom or pan that moves the
 * map under a pointer at rest puts the brush back under it.
 */
export class RoomPointer {
  private screen: Point | null = null;
  private brush: Point | null = null;
  private readonly axisLock = new AxisLock();
  /** The pointer itself while a stroke trails behind it on the rope: where the rope starts; null otherwise. */
  lead: Point | null = null;

  constructor(private readonly viewport: Viewport, private readonly store: ViewAtlasStore) {}

  /** The pointer moved to `point` on the map. */
  seen(point: Point): void {
    this.screen = this.viewport.toScreen(point);
  }

  left(): void {
    this.screen = null;
    this.end();
  }

  /** Where the pointer is on the map now, the camera having moved under it; null while it is off the map. */
  atRest(): Point | null {
    return this.screen && this.viewport.toWorld(this.screen);
  }

  /** A stroke starts at `point`. */
  begin(point: Point): void {
    this.brush = point;
    this.lead = null;
    this.axisLock.reset();
  }

  end(): void {
    this.brush = null;
    this.lead = null;
  }

  /** Where the stroke's brush goes for a pointer at `point`, `straight` while Shift is held. */
  follow(point: Point, straight: boolean): Point {
    const state = this.store.getState();
    const rope = state.roomTool.stabilize ? 2 * roomSizesOf(state).brushSize : 0;
    const zoom = this.viewport.scale.x;
    const from = this.brush ?? point;
    const steadied = rope > 0 ? pulled(from, point, rope) : point;
    this.brush = this.axisLock.follow(steadied, straight, from, AXIS_SLACK / zoom);
    this.lead = rope > 0 ? point : null;
    return this.brush;
  }

  /** With Shift, a corner or a door's end lands on the nearest crossing of a square grid. */
  snapped(point: Point, shiftKey: boolean | undefined): Point {
    const state = this.store.getState();
    const { grid, roomTool } = state;
    // The brush and the bucket take Shift for a straight stroke (`AxisLock`), never the grid.
    const freehand = roomTool.action !== 'door' && (roomTool.shape === 'brush' || roomTool.shape === 'bucket');
    if (!switchApplies(state, 'roomSnap', shiftKey) || freehand || !grid || grid.type !== 'square' || !(grid.size > 0)) return point;
    const snap = (v: number, offset: number): number => Math.round((v - offset) / grid.size) * grid.size + offset;
    return { x: snap(point.x, grid.offsetX), y: snap(point.y, grid.offsetY) };
  }
}

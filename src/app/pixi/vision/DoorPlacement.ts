import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { runHistoryTransaction } from '../../stores/history';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { placeDoor } from '../lighting/wallEdits';
import type { WallInteraction } from './WallInteraction';
import type { WallRenderer } from './WallRenderer';
import { levelObjects } from '../../levels/levelObjects';

type DoorType = 'door' | 'secret-door';

/** World pixels: how wide a door is on a map without a grid. */
const DOOR_WIDTH_WITHOUT_GRID = 40;

/**
 * Placing a door in a wall: the door, one grid cell wide, follows the pointer along the wall
 * until a click puts it there (`placeDoor`), which splits the wall around it in one undo step.
 * The preview shows exactly the door the click places.
 */
export class DoorPlacement {
  private placing: { wallId: string; doorType: DoorType; at: Point } | null = null;

  constructor(
    private readonly store: StoreApi<ViewAtlasState>,
    private readonly renderer: WallRenderer,
    private readonly walls: WallInteraction,
  ) {}

  get active(): boolean {
    return this.placing !== null;
  }

  /** Starts placing a door in `wallId`, at the point of the wall nearest `at` (its middle without one). */
  start(wallId: string, doorType: DoorType, at?: Point): void {
    const wall = this.wall(wallId);
    if (!wall) return;
    this.placing = { wallId, doorType, at: at ?? { x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 } };
    this.walls.selectSegment(wallId);
    this.preview();
  }

  move(point: Point): void {
    if (!this.placing) return;
    this.placing.at = point;
    this.preview();
  }

  confirm(): void {
    const placing = this.placing;
    const wall = placing && this.wall(placing.wallId);
    if (!placing || !wall) {
      this.cancel();
      return;
    }
    const state = this.store.getState();
    runHistoryTransaction(this.store, () => {
      state.deleteWall(wall.id);
      for (const piece of placeDoor(wall, placing.at, this.width(), placing.doorType)) state.addWall(piece);
    });
    this.cancel();
    this.walls.clearSelection();
  }

  cancel(): void {
    this.placing = null;
    this.renderer.preview.clearDoor();
  }

  private preview(): void {
    const placing = this.placing;
    const wall = placing && this.wall(placing.wallId);
    if (!placing || !wall) {
      this.cancel();
      return;
    }
    const door = placeDoor(wall, placing.at, this.width(), placing.doorType).find((piece) => piece.type === placing.doorType);
    if (door) this.renderer.preview.showDoor(door.p1, door.p2, placing.doorType);
  }

  private wall(wallId: string): WallSegment | undefined {
    return levelObjects(this.store.getState()).walls[wallId];
  }

  /** A door is one grid cell wide. */
  private width(): number {
    const size = this.store.getState().grid?.size ?? 0;
    return size > 0 ? size : DOOR_WIDTH_WITHOUT_GRID;
  }
}

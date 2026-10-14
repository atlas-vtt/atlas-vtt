import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { beginHistoryTransaction, discardHistoryTransaction, endHistoryTransaction, runHistoryTransaction } from '../../stores/history';
import type { WallInput } from '../../types/wallTypes';
import type { Point } from '../../types/visionTypes';
import { connectWallPoint } from './wallConnections';

/**
 * One wall chain or freehand stroke being drawn. Segments go into the store as they are
 * placed, so walls and shadows appear live, inside one history transaction that opens with
 * the first segment: the finished chain is a single undo step, and a cancelled one removes
 * its segments and leaves no step. Edits made meanwhile stay; they share the chain's step,
 * or get none when the chain is cancelled.
 */
export class WallDrawingSession {
  private wallIds: string[] = [];
  private drawing = false;
  private readonly splitEnds = new Map<string, Point>();

  constructor(private readonly store: StoreApi<ViewAtlasState>) {}

  get active(): boolean {
    return this.drawing;
  }

  start(): void {
    this.finish();
    this.drawing = true;
  }

  add(wall: WallInput): string {
    if (!this.drawing) return runHistoryTransaction(this.store, () => {
      connectWallPoint(this.store, wall.p1);
      connectWallPoint(this.store, wall.p2);
      return this.store.getState().addWall(wall);
    });
    if (this.drawing && this.wallIds.length === 0) beginHistoryTransaction(this.store);
    this.connect(wall.p1);
    this.connect(wall.p2);
    return this.addPiece(wall);
  }

  private addPiece(wall: WallInput): string {
    const id = this.store.getState().addWall(wall);
    if (this.drawing) this.wallIds.push(id);
    return id;
  }

  private connect(point: Point): void {
    for (const { id, p2, added } of connectWallPoint(this.store, point)) {
      if (!this.wallIds.includes(id) && !this.splitEnds.has(id)) this.splitEnds.set(id, p2);
      this.wallIds.push(added);
    }
  }

  finish(): void {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.wallIds.length > 0) endHistoryTransaction(this.store);
    this.wallIds = [];
    this.splitEnds.clear();
  }

  /** Removes what this chain placed. */
  cancel(): void {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.wallIds.length === 0) return;
    this.store.getState().deleteWalls(this.wallIds);
    for (const [id, p2] of this.splitEnds) this.store.getState().updateWall(id, { p2 });
    this.wallIds = [];
    this.splitEnds.clear();
    discardHistoryTransaction(this.store);
  }
}

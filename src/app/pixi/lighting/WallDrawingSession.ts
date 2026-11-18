import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { abandonHistoryTransaction, beginHistoryTransaction, discardHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { WallInput } from '../../types/wallTypes';

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

  constructor(private readonly store: StoreApi<ViewAtlasState>) {}

  get active(): boolean {
    return this.drawing;
  }

  start(): void {
    this.finish();
    this.drawing = true;
  }

  add(wall: WallInput): string {
    if (this.drawing && this.wallIds.length === 0) beginHistoryTransaction(this.store);
    const id = this.store.getState().addWall(wall);
    if (this.drawing) this.wallIds.push(id);
    return id;
  }

  /** Takes back the wall placed last; the chain goes on. With its last wall gone the chain has written nothing, and its undo step is not begun. */
  removeLast(): void {
    const id = this.wallIds.pop();
    if (id === undefined) return;
    this.store.getState().deleteWalls([id]);
    if (this.wallIds.length === 0) abandonHistoryTransaction(this.store);
  }

  finish(): void {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.wallIds.length > 0) endHistoryTransaction(this.store);
    this.wallIds = [];
  }

  /** Removes what this chain placed. */
  cancel(): void {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.wallIds.length === 0) return;
    this.store.getState().deleteWalls(this.wallIds);
    this.wallIds = [];
    discardHistoryTransaction(this.store);
  }
}

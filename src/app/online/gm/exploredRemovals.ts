import { exploredMemoryOn } from '../../lighting/sceneLightingOptions';
import { levelExploredMask } from '../../levels/sceneLevels';
import type { SceneState } from './atlasView.ts';

interface Seen {
  readonly edits: number;
  readonly source: string | null;
  readonly memoryOn: boolean;
}

/**
 * Counts the times the GM took explored memory away from one floor (`explored.serial`). Sight only
 * ever adds to the memory; it loses some through an edit by hand of the floor while the GM's view
 * shows it (its undo and redo too: the count of edits moves), counted with the save that holds it;
 * through a load (a snapshot restored, the scene opened again) that ends with another memory than
 * before it; and where the memory went from some to none or was switched off. The serial never goes
 * back, so a player who missed a removal still holds another serial than the newest.
 */
export class ExploredRemovals {
  private count = 0;
  private seen: Seen | null = null;
  /** An edit by hand was counted whose save has not been seen yet. */
  private edited = false;
  /** The memory before the load under way; undefined while none is. */
  private beforeLoad: string | null | undefined = undefined;

  /** `shown`: whether the GM's view shows this floor now. */
  constructor(private readonly shown: () => boolean) {}

  get serial(): number {
    return this.count;
  }

  /**
   * The scene last shared comes back under its id (`refreshAssets`), and players keep what they drew of
   * it. They may have missed a removal meanwhile, since nothing was sent: it counts as one. What was
   * under way stays under way: a save still to come may hold an edit made before.
   */
  sharedAgain(): void {
    this.count++;
  }

  /** Another scene is shared: nothing of the one before compares. */
  reset(): void {
    this.seen = null;
    this.edited = false;
    this.beforeLoad = undefined;
  }

  /** The scene's map is loading; what the load ends with is compared with the memory before it. */
  loading(): void {
    if (this.beforeLoad === undefined && this.seen !== null) this.beforeLoad = this.seen.source;
  }

  /** The scene as it is now, its map loaded. */
  observe(state: SceneState): void {
    const source = levelExploredMask(state);
    const seen = this.seen;
    this.seen = { edits: state.exploredEdits, source, memoryOn: exploredMemoryOn(state.lighting) };
    if (this.beforeLoad !== undefined) {
      // The count of edits starts over with every load.
      if (source !== this.beforeLoad) this.count++;
      this.beforeLoad = undefined;
      this.edited = false;
      return;
    }
    if (seen === null) return;
    if (state.exploredEdits !== seen.edits) {
      // An edit's save comes after it; a count and a memory changed at once are a load nobody saw begin.
      if (source !== seen.source) {
        this.count++;
        this.edited = false;
      } else if (this.shown()) this.edited = true;
    } else if (this.edited && source !== seen.source) {
      this.edited = false;
      this.count++;
    }
    if ((source === null && seen.source !== null) || (seen.memoryOn && !this.seen.memoryOn)) this.count++;
  }
}

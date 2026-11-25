import { exploredMemoryOn } from '../../lighting/sceneLightingOptions';
import { levelExploredMask } from '../../levels/sceneLevels';
import type { SceneState } from './atlasView.ts';

/**
 * What the GM took away from the party's explored memory: what one floor's memory lost from one saved
 * memory to the next (data URLs; null for none), or every floor of the scene (Forget explored areas).
 */
export type Removal = { readonly kind: 'lost'; readonly before: string | null; readonly after: string | null } | { readonly kind: 'forgotten' };

const NO_REMOVALS: readonly Removal[] = Object.freeze([]);

interface Seen {
  readonly edits: number;
  readonly source: string | null;
  readonly memoryOn: boolean;
  readonly forgotten: number;
}

/**
 * Counts the times the GM took explored memory away from one floor (`explored.serial`). Sight only
 * ever adds to the memory; it loses some through an edit by hand of the floor while the GM's view
 * shows it (its undo and redo too: the count of edits moves), counted with the save that holds it;
 * through a load (a snapshot restored, the scene opened again) that ends with another memory than
 * before it; where the memory went from some to none or was switched off; and where the GM forgot
 * every floor's memory (`exploredForgotten`) while the view showed another floor, since players may
 * remember one whose saved memory was none already. The serial never goes
 * back, so a player who missed a removal still holds another serial than the newest.
 */
export class ExploredRemovals {
  private count = 0;
  private seen: Seen | null = null;
  /** An edit by hand was counted whose save has not been seen yet. */
  private edited = false;
  /** The memory before the load under way; undefined while none is. */
  private beforeLoad: string | null | undefined = undefined;
  /** The id of the scene last shared, which stays while none is. */
  private sharedId: string | null = null;

  /** `shown`: whether the GM's view shows this floor now. */
  constructor(private readonly shown: () => boolean) {}

  get serial(): number {
    return this.count;
  }

  /**
   * A scene is shared. The one last shared may come back under its id (`refreshAssets`), and players
   * keep what they drew of it; they may have missed a removal meanwhile, since nothing was sent: it
   * counts as one, and what was under way stays under way (a save still to come may hold an edit made
   * before). Of another scene nothing of the one before compares.
   */
  shared(sceneId: string): void {
    if (sceneId === this.sharedId) this.count++;
    else {
      this.seen = null;
      this.edited = false;
      this.beforeLoad = undefined;
    }
    this.sharedId = sceneId;
  }

  /** The scene's map is loading; what the load ends with is compared with the memory before it. */
  loading(): void {
    if (this.beforeLoad === undefined && this.seen !== null) this.beforeLoad = this.seen.source;
  }

  /**
   * The scene as it is now, its map loaded; what the GM took away since it was last looked at, which each
   * player's own memory of the floor loses too: what the party's memory lost (`lost`, a load or an edit by
   * hand, both saved), and every floor of the scene where Forget explored areas forgot them (`forgotten`).
   */
  observe(state: SceneState): readonly Removal[] {
    const source = levelExploredMask(state);
    const seen = this.seen;
    this.seen = { edits: state.exploredEdits, source, memoryOn: exploredMemoryOn(state.lighting), forgotten: state.exploredForgotten ?? 0 };
    if (this.beforeLoad !== undefined) {
      const before = this.beforeLoad;
      this.beforeLoad = undefined;
      this.edited = false;
      // The count of edits starts over with every load.
      if (source === before) return NO_REMOVALS;
      this.count++;
      return [{ kind: 'lost', before, after: source }];
    }
    if (seen === null) return NO_REMOVALS;
    let saved = false;
    if (state.exploredEdits !== seen.edits) {
      // An edit's save comes after it; a count and a memory changed at once are a load nobody saw begin.
      if (source !== seen.source) {
        this.count++;
        this.edited = false;
        saved = true;
      } else if (this.shown()) this.edited = true;
    } else if (this.edited && source !== seen.source) {
      this.edited = false;
      this.count++;
      saved = true;
    }
    const gone = source === null && seen.source !== null;
    // The floor the GM's view shows is counted by its edit, with the save that holds it.
    const forgotten = seen.forgotten !== this.seen.forgotten;
    if (gone || (seen.memoryOn && !this.seen.memoryOn) || (forgotten && !this.shown())) this.count++;
    const removals: Removal[] = [];
    if (saved || gone) removals.push({ kind: 'lost', before: seen.source, after: source });
    if (this.seen.forgotten > seen.forgotten) removals.push({ kind: 'forgotten' });
    return removals;
  }
}

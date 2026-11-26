import { ExploredEditStack } from '../../lighting/exploredEdits';
import { HISTORY_LIMIT } from '../../stores/history';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { MapBounds } from '../../vision/visibility';

/** What forgetting the other floors' memories calls of the view's state. */
export interface FloorMemoryState {
  forgetOtherLevelsExplored(): Record<string, string>;
  restoreLevelsExplored(masks: Readonly<Record<string, string>>): void;
}

type TakenMasks = Readonly<Record<string, string>>;

/** What an edit of the floor shown took from the party's memory: its shapes, on a map of `bounds`. */
export interface ErasedArea {
  readonly shapes: ExploredShapes;
  readonly bounds: MapBounds;
}

/**
 * What players remember of the scene apart from the party (each player's own memory, which the GM's Atlas
 * keeps), as the GM's edits by hand reach it, each with the undo step of the edit that made it.
 */
export interface PlayersMemoryEdits {
  /** Edit `step` of the floor shown was made, taking `erased` from the party's memory (null for an edit that takes nothing). */
  edited(step: number, erased: ErasedArea | null): void;
  /** Forget explored areas forgot every floor; `step` is the edit that takes it back, null where there is none. */
  forgot(step: number | null): void;
  /** Undo (`to < from`) or redo between those counts of edits. */
  travel(from: number, to: number): void;
  /** The steps went. */
  clear(): void;
}

const NONE: TakenMasks = {};

/**
 * Forget explored areas forgets the whole scene: the floor the view shows as an edit of its memory
 * (`ExploredMemory.reset`), every other floor by its saved memory. Those are no texture, so the
 * memories taken are kept under the undo step of the shown floor's forget, numbered as its texels
 * are (every edit records a step here, most of them taking none), and undo and redo of that step
 * take them along (`travel`). They go with the steps (`clear`). Each player's own memory (`players`) follows
 * the same edits and steps.
 */
export class ForgottenFloors {
  private readonly steps = new ExploredEditStack<TakenMasks>(HISTORY_LIMIT);

  constructor(private readonly store: { getState(): FloorMemoryState }, private readonly players?: PlayersMemoryEdits) {}

  /** Edit `step` of the floor shown was made, taking `erased` (null: nothing); the steps after it were undone and are gone. */
  edited(step: number, erased: ErasedArea | null = null): void {
    this.steps.record(step, NONE);
    this.players?.edited(step, erased);
  }

  /** Forgets every other floor's memory; `step` is the edit that takes it back, null where there is none. */
  forget(step: number | null): void {
    const taken = this.store.getState().forgetOtherLevelsExplored();
    if (step !== null) this.steps.record(step, taken);
    this.players?.forgot(step);
  }

  /**
   * Undo (`to < from`) puts back what the steps between took, the oldest step's where several took
   * a floor's, and only where nothing was saved of it since; redo forgets the other floors again.
   */
  travel(from: number, to: number): void {
    this.players?.travel(from, to);
    // Newest first on undo, so the oldest is assigned last.
    const taken = this.steps.path(from, to).filter((masks) => masks !== NONE);
    if (taken.length === 0) return;
    if (to > from) this.store.getState().forgetOtherLevelsExplored();
    else this.store.getState().restoreLevelsExplored(Object.assign({}, ...taken) as TakenMasks);
  }

  clear(): void {
    this.steps.clear();
    this.players?.clear();
  }
}

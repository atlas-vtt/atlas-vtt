import { ExploredEditStack } from '../../lighting/exploredEdits';
import { HISTORY_LIMIT } from '../../stores/history';

/** What forgetting the other floors' memories calls of the view's state. */
export interface FloorMemoryState {
  forgetOtherLevelsExplored(): Record<string, string>;
  restoreLevelsExplored(masks: Readonly<Record<string, string>>): void;
}

type TakenMasks = Readonly<Record<string, string>>;

const NONE: TakenMasks = {};

/**
 * Forget explored areas forgets the whole scene: the floor the view shows as an edit of its memory
 * (`ExploredMemory.reset`), every other floor by its saved memory. Those are no texture, so the
 * memories taken are kept under the undo step of the shown floor's forget, numbered as its texels
 * are (every edit records a step here, most of them taking none), and undo and redo of that step
 * take them along (`travel`). They go with the steps (`clear`).
 */
export class ForgottenFloors {
  private readonly steps = new ExploredEditStack<TakenMasks>(HISTORY_LIMIT);

  constructor(private readonly store: { getState(): FloorMemoryState }) {}

  /** Edit `step` of the floor shown was made: the steps after it were undone and are gone. */
  edited(step: number): void {
    this.steps.record(step, NONE);
  }

  /** Forgets every other floor's memory; `step` is the edit that takes it back, null where there is none. */
  forget(step: number | null): void {
    const taken = this.store.getState().forgetOtherLevelsExplored();
    if (step !== null) this.steps.record(step, taken);
  }

  /**
   * Undo (`to < from`) puts back what the steps between took, the oldest step's where several took
   * a floor's, and only where nothing was saved of it since; redo forgets the other floors again.
   */
  travel(from: number, to: number): void {
    // Newest first on undo, so the oldest is assigned last.
    const taken = this.steps.path(from, to).filter((masks) => masks !== NONE);
    if (taken.length === 0) return;
    if (to > from) this.store.getState().forgetOtherLevelsExplored();
    else this.store.getState().restoreLevelsExplored(Object.assign({}, ...taken) as TakenMasks);
  }

  clear(): void {
    this.steps.clear();
  }
}

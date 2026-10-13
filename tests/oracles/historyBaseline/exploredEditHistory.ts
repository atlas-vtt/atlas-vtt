// Frozen from e8b9b280c326ef15d62b4b55651727ac56a449ad src/app/stores/exploredEditHistory.ts.
import { getHistoryStore, type HistorySnapshot, type HistoryState } from './history';

type Timeline = Pick<HistoryState, 'pastStates' | 'futureStates'>;
type Tracked = Partial<HistorySnapshot>;

const OTHER_FIELDS = ['objects', 'grid', 'background', 'widgetValues'] as const;

function sameButForEdits(a: Tracked, b: Tracked): boolean {
  return OTHER_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * A history without its edits of the explored memory. Those steps can be taken back only while
 * the memory holds what they changed, which it does until its scene is left, so a history that
 * outlives that (a tab's, kept for the return to it) must not keep them: undo would reach a
 * step that does nothing. Every state counts `count` edits, and a step that then changes nothing
 * is left out. `current` is the state the history belongs to; `count` is 0 for a scene that will
 * be loaded anew, as a load starts the count over.
 */
export function withoutExploredEdits({ pastStates, futureStates }: Timeline, current: Tracked, count = 0): Timeline {
  // Both lists end with the state next to the current one in time.
  const kept = (states: Tracked[]): Tracked[] => {
    const result: Tracked[] = [];
    let next = current;
    for (let i = states.length - 1; i >= 0; i--) {
      const state = states[i]!;
      if (sameButForEdits(state, next)) continue;
      result.unshift({ ...state, exploredEdits: count });
      next = state;
    }
    return result;
  };
  return { pastStates: kept(pastStates), futureStates: kept(futureStates) };
}

/**
 * The scene's memory no longer holds what its edits changed (another texture took its place, or
 * the view that kept it is gone): the edits leave the store's history. The count stays where it
 * is, so the store itself is not written: this may run inside one of its notifications, whose
 * own step would record the write.
 */
export function forgetExploredEdits(store: { getState: () => HistorySnapshot & { exploredEdits: number } }): void {
  const history = getHistoryStore(store);
  if (!history) return;
  const state = store.getState();
  history.setState(withoutExploredEdits(history.getState(), state, state.exploredEdits));
}

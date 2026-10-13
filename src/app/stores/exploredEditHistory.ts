import { getHistoryStore, type HistorySnapshot, type HistoryState, type HistoryStep } from './history';

type Timeline = Pick<HistoryState, 'pastStates' | 'futureStates'>;

const OTHER_BRANCHES = ['objects', 'grid', 'background', 'widgetValues'] as const;

const sameButForEdits = (a: HistorySnapshot, b: HistorySnapshot): boolean => OTHER_BRANCHES.every((branch) => a[branch] === b[branch]);

const counting = (side: HistorySnapshot, count: number): HistorySnapshot => ({ ...side, exploredEdits: count });

/**
 * A history without its edits of the explored memory. Those steps can be taken back only while
 * the memory holds what they changed, which it does until its scene is left, so a history that
 * outlives that (a tab's, kept for the return to it) must not keep them: undo would reach a
 * step that does nothing. A step that only edited the memory is left out, and every step kept
 * counts `count` edits on both sides, so undo and redo no longer move the count. `count` is 0
 * for a scene that will be loaded anew, as a load starts the count over.
 */
export function withoutExploredEdits({ pastStates, futureStates }: Timeline, count = 0): Timeline {
  const kept = (steps: readonly HistoryStep[]): HistoryStep[] => steps
    .filter(({ before, after }) => !sameButForEdits(before, after))
    .map(({ before, after }) => ({ before: counting(before, count), after: counting(after, count) }));
  return { pastStates: kept(pastStates), futureStates: kept(futureStates) };
}

/**
 * The past without the steps that only edited the memory, compared as undo meets them from the
 * store's state `present`: a step goes when what undo would write is that state but for the
 * count, and its after side passes to the step before it, so the steps kept still meet.
 */
function pastWithoutEdits(steps: readonly HistoryStep[], present: HistorySnapshot): HistoryStep[] {
  const kept: HistoryStep[] = [];
  let next = present;
  let after: HistorySnapshot | null = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (sameButForEdits(step.before, next)) {
      after ??= step.after;
      continue;
    }
    kept.unshift(after ? { before: step.before, after } : step);
    after = null;
    next = step.before;
  }
  return kept;
}

/** The redo stack the same way, as redo meets its steps from `present`. */
function futureWithoutEdits(steps: readonly HistoryStep[], present: HistorySnapshot): HistoryStep[] {
  const kept: HistoryStep[] = [];
  let next = present;
  let before: HistorySnapshot | null = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (sameButForEdits(step.after, next)) {
      before ??= step.before;
      continue;
    }
    kept.unshift(before ? { before, after: step.after } : step);
    before = null;
    next = step.after;
  }
  return kept;
}

/**
 * The scene's memory no longer holds what its edits changed (another texture took its place, or
 * the view that kept it is gone): the edits leave the store's history. The count stays where it
 * is, so the store itself is not written: this may run inside one of its notifications, whose
 * own step would record the write. The steps are compared with the store as it is now, which
 * may lie ahead of them (a transaction under way, an undo being announced); their sides next
 * to the present keep what they hold, so they still meet the store.
 */
export function forgetExploredEdits(store: { getState: () => HistorySnapshot & { exploredEdits: number } }): void {
  const history = getHistoryStore(store);
  if (!history) return;
  const present = store.getState();
  const count = present.exploredEdits;
  const pastStates = pastWithoutEdits(history.getState().pastStates, present).map((step, i, steps) => ({
    before: counting(step.before, count),
    after: i === steps.length - 1 ? step.after : counting(step.after, count),
  }));
  const futureStates = futureWithoutEdits(history.getState().futureStates, present).map((step, i, steps) => ({
    before: i === steps.length - 1 ? step.before : counting(step.before, count),
    after: counting(step.after, count),
  }));
  history.setState({ pastStates, futureStates });
}

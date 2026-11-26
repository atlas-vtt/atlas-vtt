import { abandonHistoryTransaction, endHistoryTransaction, type HistoryHost } from '../../stores/history';

/**
 * Closes the undo step of a drag that wrote to `store` while it ran: recorded on a `commit`; on a
 * cancel `restore` puts back what it changed and no step is left. `later` says the cancel comes
 * from inside a store write: the history looks at a write once its listeners are done, and closed
 * inside one, the step would be left for the write that cancelled the drag, with the drag's state
 * as its past.
 */
export function settleDragStep(store: HistoryHost, commit: boolean, later: boolean, restore: () => void): void {
  if (commit) {
    endHistoryTransaction(store);
    return;
  }
  restore();
  if (later) queueMicrotask(() => abandonHistoryTransaction(store));
  else abandonHistoryTransaction(store);
}

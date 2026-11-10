import type { SceneStore } from '../atlasView.ts';

/** What the takeover reads of an Atlas map tab's store. */
interface DiceLogState {
  readonly isDiceLogOpen?: boolean;
  readonly setDiceLogOpen?: (open: boolean) => void;
}

/**
 * Takes the place of Atlas's dice log on one map tab: whenever Atlas opens it (Enter, the command
 * palette), it is closed again in the same store write's notification, before Atlas draws, and
 * `toggle` runs instead. Atlas's own log therefore never shows there, its key and command open and
 * close the table's log, and Atlas goes on recording the scene's rolls as before. An Atlas log that
 * is open when the takeover begins is taken the same way. Returns what ends it.
 */
export function takeOverDiceLog(store: SceneStore, toggle: () => void): () => void {
  const take = (state: DiceLogState): void => {
    if (state.isDiceLogOpen !== true || state.setDiceLogOpen === undefined) return;
    state.setDiceLogOpen(false);
    toggle();
  };
  take(store.getState() as DiceLogState);
  return store.subscribe((state) => take(state as DiceLogState));
}

/** Asks Atlas to open its dice log on the tab, which the takeover turns into the table's log; false when the store has no such switch. */
export function openThroughAtlas(store: SceneStore): boolean {
  const state = store.getState() as DiceLogState;
  if (state.setDiceLogOpen === undefined) return false;
  state.setDiceLogOpen(true);
  return true;
}

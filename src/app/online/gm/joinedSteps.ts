import { getHistoryStore, type HistoryStep } from '../../stores/history';
import { sameTrackedSlice } from '../../stores/history/trackedSlice';
import type { SceneStore } from './atlasView.ts';

/** How long after a player's change to some drawings or texts their next change to the same ones still joins its undo step, in ms. */
export const JOIN_MS = 2_000;

interface Joined {
  readonly player: string;
  /** The annotations the step changed, as one key. */
  readonly key: string;
  readonly at: number;
  readonly step: HistoryStep;
}

/**
 * One undo step for a player's changes to the same drawings and texts that follow each other
 * closely: a player trying colours, or nudging a drawing into place, sends a request for each,
 * and each would be a step of the GM's history, which holds fifty.
 *
 * A step is joined to the one before only where the GM's history shows that nothing came between
 * them: the step before is still the last but one, the very object this class last saw, and it
 * ended in the state the new one began in. The joined step is then exactly what one write of both
 * changes would have left. Anything else (a write of the GM's, an undo, a write of Atlas itself,
 * another player's request, a transaction of the GM's under way, which records no step for the
 * player at all) leaves the steps as they are.
 */
export class JoinedSteps {
  private last: Joined | null = null;

  constructor(private readonly store: SceneStore) {}

  /** Runs `write`, a change by `player` to the annotations `ids` at `now`, and joins the step it records to the player's last where that is the same change going on. */
  write(player: string, ids: readonly string[], now: number, write: () => void): void {
    const history = getHistoryStore(this.store);
    const before = history?.getState().pastStates ?? [];
    const top = before[before.length - 1];
    write();
    const last = this.last;
    this.last = null;
    if (!history) return;
    const past = history.getState().pastStates;
    const step = past[past.length - 1];
    // No step of its own: nothing changed, or the write went into a transaction of the GM's.
    if (step === undefined || step === top) return;
    const key = [...ids].sort().join(' ');
    const follows = last !== null && last.player === player && last.key === key && now - last.at <= JOIN_MS
      && past[past.length - 2] === last.step && sameTrackedSlice(last.step.after, step.before);
    if (!follows) {
      this.last = { player, key, at: now, step };
      return;
    }
    const joined: HistoryStep = { before: last.step.before, after: step.after };
    history.setState({ pastStates: [...past.slice(0, -2), joined] });
    this.last = { player, key, at: now, step: joined };
  }

  clear(): void {
    this.last = null;
  }
}

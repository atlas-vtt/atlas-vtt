/**
 * A combatant lives as long as its token: whatever takes a token away takes its entry out of the
 * tracker. A removal (`removeObjects`) does it in its own write; writes that take tokens away
 * otherwise (an undo or redo, a level deleted with what stands on it, a map switch) are followed at
 * once by the store's first listener (`followTokensInTracker`). Party members have no token.
 */

import { removeCombatant } from '../initiative/turnOrder';
import { sceneTokens } from '../tokens/offMap';
import type { TokenEntity } from '../types';
import type { InitiativeState } from '../types/initiativeTypes';
import { runUntracked, type HistoryHost } from './history';
import { orderTurns, readFight, type FightBinding, type FightReading } from './initiativeFightStart';

/** A store's fight and the tokens its combatants stand for. */
export interface TrackerState {
  initiative: InitiativeState;
  objects: { tokens: Record<string, TokenEntity> };
  /** The map the fight is on, whose rules say who is defeated. */
  mapPath?: string | null | undefined;
}

/** The entries of combatants whose token the scene does not hold, or will not once `goneTokens` are gone, in the order they stand. */
function withoutToken(state: TrackerState, goneTokens: ReadonlySet<string>): string[] {
  const tokens = sceneTokens(state.objects);
  return state.initiative.entries
    .filter(({ tokenId }) => tokenId !== undefined && (goneTokens.has(tokenId) || tokens[tokenId] === undefined))
    .map(({ id }) => id);
}

/**
 * How the fight is read for a write that takes the tokens `goneTokens` away: their combatants count
 * as not defeated, as none whose token is gone does. Null where no combatant leaves, so that no
 * chance is drawn.
 */
export function fightWithoutTokens(state: TrackerState, goneTokens: Iterable<string>, binding: FightBinding): FightReading | null {
  const leaving = new Set(withoutToken(state, new Set(goneTokens)));
  if (leaving.size === 0) return null;
  const reading = readFight(state, binding);
  return { ...reading, defeated: new Set([...reading.defeated].filter((id) => !leaving.has(id))) };
}

/**
 * In a write that took tokens away, takes every combatant whose token the scene no longer holds out
 * of the tracker, one after another in the order they stand: had one the turn, it passes on as
 * `removeFromInitiative` passes it, by `reading` (`fightWithoutTokens`).
 */
export function dropCombatantsWithoutToken(draft: TrackerState, reading: FightReading): void {
  for (const id of withoutToken(draft, new Set())) removeCombatant(draft.initiative, id, orderTurns(draft, reading));
}

/** A view store as far as the tracker follows its tokens. */
export interface TrackerStore extends HistoryHost {
  getState(): TrackerState;
  setState(recipe: (draft: TrackerState) => void): void;
  subscribe(listener: (state: TrackerState, previous: TrackerState) => void): () => void;
}

/**
 * Follows every write that takes tokens away without `removeObjects`: their combatants leave the
 * tracker at once, as Atlas's own write (no undo step; initiative is none). Subscribe it first, so
 * that no other listener hears of a combatant without its token.
 */
export function followTokensInTracker(store: TrackerStore, binding: FightBinding): () => void {
  return store.subscribe((state, previous) => {
    if (sceneTokens(state.objects) === sceneTokens(previous.objects)) return;
    const reading = fightWithoutTokens(state, [], binding);
    if (reading) runUntracked(store, () => store.setState((draft) => dropCombatantsWithoutToken(draft, reading)));
  });
}

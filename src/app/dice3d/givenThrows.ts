/**
 * Rolls decided elsewhere that a map view throws with its own 3D dice
 * (`dice.throw`): which roll ids a view threw already, so each is thrown once, and the channel
 * that hands a roll to a GM map view's dice display. Kept per view store, so a closed view's
 * memory goes with its store and no map file can ever carry it.
 */
import type { DiceRollResult } from '../types/diceTypes';
import type { DiceDisplay } from './diceDisplay';
import type { DiceScene } from './diceScene';
import { diceSceneToShow } from './rollPresentation';

/** How many thrown roll ids a view remembers, so a roll handed again is not thrown again. */
export const THROWN_IDS = 100;

type GivenThrowListener = (roll: DiceRollResult) => void;

interface ViewThrows { readonly ids: string[]; readonly listeners: Set<GivenThrowListener> }

const byStore = new WeakMap<object, ViewThrows>();

function throwsOf(store: object): ViewThrows {
  let entry = byStore.get(store);
  if (!entry) {
    entry = { ids: [], listeners: new Set() };
    byStore.set(store, entry);
  }
  return entry;
}

/** Whether the view of `store` threw roll `id` already (of its last 100). */
export function thrownBefore(store: object, id: string): boolean {
  return throwsOf(store).ids.includes(id);
}

/** Notes that the view of `store` threw roll `id`, so it is not thrown there again. */
export function noteThrown(store: object, id: string): void {
  const { ids } = throwsOf(store);
  if (ids.includes(id)) return;
  ids.push(id);
  if (ids.length > THROWN_IDS) ids.shift();
}

/** Hands `roll` to the dice display of the GM map view of `store`; false when no display listens (none mounted, or it failed). */
export function sendGivenThrow(store: object, roll: DiceRollResult): boolean {
  const listeners = [...throwsOf(store).listeners];
  for (const listener of listeners) listener(roll);
  return listeners.length > 0;
}

/** Hears the rolls `sendGivenThrow` hands to the view of `store`; returns the unsubscribe. */
export function onGivenThrow(store: object, listener: GivenThrowListener): () => void {
  const { listeners } = throwsOf(store);
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The stage a given roll is thrown on, or null for a result card: cards are chosen, or the roll does not list all its dice. */
export function givenRollScene(roll: DiceRollResult, display: DiceDisplay): DiceScene | null {
  return roll.unlistedDice ? null : diceSceneToShow(roll, display);
}

import type { StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../storeFactory';
import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';
import type { TokenInput } from '../types/viewState';
import { initiativeEntryForToken } from '../stores/initiativeEntries';
import { isOffMap, offMapPlaces, placedByOlderVersion, sceneTokens, type MapArea } from '../tokens/offMap';
import { runUntracked } from '../stores/history';

type CombatStore = Pick<StoreApi<ViewAtlasState>, 'getState'>;

/**
 * Combatants kept beside the map (`tokens/offMap.ts`) live as long as their initiative entry: added
 * to the tracker with their token, removed from it with their token. Adding and removing the tokens
 * is the undo step; initiative itself is none, so a token an undo brings back finds its entry again
 * through `offMapWithoutEntry`.
 */

/** Puts the tokens of `ids` in the tracker (those not in it yet) and opens it. */
export function joinInitiative(store: CombatStore, ids: readonly string[]): void {
  const { initiative, objects, addToInitiative, setInitiativeTrackerOpen } = store.getState();
  const listed = new Set(initiative.entries.map((entry) => entry.tokenId));
  const tokens = sceneTokens(objects);
  for (const id of ids) {
    const token = tokens[id];
    if (token && !listed.has(id)) addToInitiative(initiativeEntryForToken(token));
  }
  if (ids.length > 0) setInitiativeTrackerOpen(true);
}

/**
 * Adds `inputs` as combatants kept beside the map, in one store write (one undo step), each with its
 * initiative entry, and opens the tracker. They wait in a column left of the map image (`offMapPlaces`).
 */
export function addOffMapCombatants(store: CombatStore, inputs: readonly TokenInput[]): string[] {
  const { objects, grid, addTokens } = store.getState();
  const places = offMapPlaces(sceneTokens(objects), grid?.size ?? 70, inputs.length);
  const ids = addTokens(inputs.map((input, i): TokenInput => ({ ...input, ...places[i]!, offMap: true })));
  joinInitiative(store, ids);
  return ids;
}

/** Takes a combatant out of the tracker; one kept beside the map goes with its token (an undo step), since nothing else shows it. */
export function removeCombatant(store: CombatStore, entry: Pick<InitiativeEntry, 'id' | 'tokenId'>, defeated: ReadonlySet<string>): void {
  const { objects, removeFromInitiative, removeMapObjects } = store.getState();
  removeFromInitiative(entry.id, defeated);
  if (isOffMap(sceneTokens(objects)[entry.tokenId])) removeMapObjects([entry.tokenId]);
}

/** Empties the tracker and ends the fight; the combatants kept beside the map go with it, in one undo step. */
export function clearCombatants(store: CombatStore): void {
  const { objects, resetInitiative, removeMapObjects } = store.getState();
  const beside = Object.values(sceneTokens(objects)).filter(isOffMap).map((token) => token.id);
  resetInitiative();
  if (beside.length > 0) removeMapObjects(beside);
}

/** The combatants kept beside the map that have no entry: brought back by an undo, or left by an older version. */
export function offMapWithoutEntry(tokens: Readonly<Record<string, TokenEntity>>, entries: readonly Pick<InitiativeEntry, 'tokenId'>[]): TokenEntity[] {
  const listed = new Set(entries.map((entry) => entry.tokenId));
  return Object.values(tokens).filter((token) => isOffMap(token) && !listed.has(token.id));
}

/**
 * Clears the flag of every combatant beside the map whose centre an older version moved onto the
 * map image (`placedByOlderVersion`), in one write that is no undo step: the scene is as it was
 * saved, only read right.
 */
export function takePlacedCombatants(store: CombatStore, map: MapArea): void {
  const { objects, updateTokens } = store.getState();
  const placed = placedByOlderVersion(sceneTokens(objects), map);
  if (placed.length > 0) runUntracked(store, () => updateTokens(placed.map((id) => ({ id, changes: { offMap: undefined } }))));
}

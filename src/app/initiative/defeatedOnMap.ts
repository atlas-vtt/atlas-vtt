import type { App } from 'obsidian';
import { mapResources } from '../resources/collectionResources';
import { rulesLookup } from '../services/mapRules';
import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { defeatedCombatants } from './defeated';

/** The defeated combatants of a view's fight, by the resources of the rules its map plays by now. */
export function defeatedOnMap(
  app: App,
  state: { mapPath?: string | null; initiative: { entries: readonly InitiativeEntry[] }; objects: { tokens: Readonly<Record<string, TokenEntity>> } },
): ReadonlySet<string> {
  return defeatedCombatants(state.initiative.entries, state.objects.tokens, mapResources(rulesLookup(app), state.mapPath));
}

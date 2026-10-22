/**
 * One change to a resource of every selected token at once: an area's damage, a healing spell
 * over the party. Pure: the store writes the updates in one action, so it is one undo step.
 */

import type { TokenEntity } from '../types';
import type { TokenUpdates } from '../types/viewState';
import { visibleResources } from './visibleResources';
import type { ResourceDefinition, ResourceValue } from './resourceTypes';
import { resourceUpdate, withCurrent } from './resourceValues';

/** A resource the selection can change together, with how many of its tokens hold it. */
export interface SelectionResource {
  definition: ResourceDefinition;
  count: number;
}

/** The value of a token's resource that the GM sees and can change; static values (an armour class) never change in play. */
function changeableValue(token: TokenEntity | undefined, definitions: readonly ResourceDefinition[], key: string): ResourceValue | undefined {
  if (token?.kind !== 'character') return undefined;
  const shown = visibleResources(token, definitions, 'dm').find(({ definition }) => definition.key === key);
  return shown && shown.definition.direction !== 'static' ? shown.value : undefined;
}

/** The resources at least one of `ids` holds, in the collection's order, each with how many hold it. */
export function selectionResources(
  tokens: Readonly<Record<string, TokenEntity>>,
  ids: readonly string[],
  definitions: readonly ResourceDefinition[],
): SelectionResource[] {
  return definitions.flatMap((definition) => {
    const count = ids.filter((id) => changeableValue(tokens[id], definitions, definition.key) !== undefined).length;
    return count > 0 ? [{ definition, count }] : [];
  });
}

/**
 * The updates that add `amount` (negative: take it away) to resource `key` of every token of
 * `ids` that holds it, each from its value as `tokens` hold it now and clamped to 0..max; tokens
 * whose value does not change are left out.
 */
export function selectionResourceUpdates(
  tokens: Readonly<Record<string, TokenEntity>>,
  ids: readonly string[],
  definitions: readonly ResourceDefinition[],
  key: string,
  amount: number,
): Array<{ id: string; changes: TokenUpdates }> {
  return ids.flatMap((id) => {
    const token = tokens[id];
    const value = changeableValue(token, definitions, key);
    if (!token || !value) return [];
    const next = withCurrent(value, value.current + amount);
    return next.current === value.current ? [] : [{ id, changes: resourceUpdate(token, key, next, false) }];
  });
}

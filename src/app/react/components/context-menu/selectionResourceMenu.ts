/**
 * "Change HP of 4 tokens…" in the token menu of a selection: one change typed once for every
 * selected token that holds the resource (an area's damage, a healing spell over the party).
 */

import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../../storeFactory';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { selectionResources, selectionResourceUpdates } from '../../../resources/selectionResourceChange';
import { t } from '../../../i18n';
import type { ContextMenuEntry } from './AtlasContextMenu';

/** Opens the popover for one resource; it calls back with the amount typed. */
export type OpenSelectionEditor = (definition: ResourceDefinition, count: number, apply: (amount: number) => void) => void;

/**
 * The entry for a selection of `targets`; null for a single token (its bar takes the same input) or
 * where no target holds a resource that changes in play. One resource is one item; several are a
 * submenu, one item each. A change is one store action, so one undo step, written from the tokens
 * as the store holds them when it is applied; a player character's other tokens and the played
 * campaign follow through the party's reconciler as for any other change of a value.
 */
export function selectionResourceEntry(
  store: StoreApi<ViewAtlasState>,
  targets: readonly string[],
  definitions: readonly ResourceDefinition[],
  openEditor: OpenSelectionEditor,
): ContextMenuEntry | null {
  if (targets.length < 2) return null;
  const offered = selectionResources(store.getState().objects.tokens, targets, definitions);
  if (offered.length === 0) return null;

  const item = (definition: ResourceDefinition, count: number, label: string): ContextMenuEntry => ({
    type: 'item',
    label,
    icon: 'heart-pulse',
    onClick: () => openEditor(definition, count, (amount) => {
      const { objects, updateTokens } = store.getState();
      const updates = selectionResourceUpdates(objects.tokens, targets, definitions, definition.key, amount);
      if (updates.length > 0) updateTokens(updates);
    }),
  });

  if (offered.length === 1) {
    const [{ definition, count }] = offered as [typeof offered[number]];
    return item(definition, count, t('resource.changeSelectionEntry', { label: definition.name, count }));
  }
  return {
    type: 'submenu',
    label: t('resource.changeSelectionMenu', { count: targets.length }),
    icon: 'heart-pulse',
    children: offered.map(({ definition, count }) => item(definition, count, t('resource.changeSelection', { label: definition.name, count }))),
  };
}

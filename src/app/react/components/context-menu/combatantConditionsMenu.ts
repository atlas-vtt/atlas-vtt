import { createElement } from 'react';
import type { StoreApi } from 'zustand';
import type { ContextMenuEntry } from './AtlasContextMenu';
import type { ViewAtlasState } from '../../../storeFactory';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import { conditionHolder } from '../../../initiative/combatantConditions';
import { ConditionBadgePreview } from '../collection-settings/ConditionBadgePreview';
import { t } from '../../../i18n';

const BADGE_SIZE = 16;

/**
 * "Conditions" submenu of a combatant's card in the tracker: the map's conditions, each ticked while the combatant
 * has it. It stays open and follows the store, so several can be set in a row.
 */
export function combatantConditionsMenu(store: StoreApi<ViewAtlasState>, definitions: readonly ConditionDefinition[], entryId: string): ContextMenuEntry {
  const children = (): ContextMenuEntry[] => {
    const state = store.getState();
    const entry = state.initiative.entries.find((candidate) => candidate.id === entryId);
    if (!entry) return [];
    const holder = conditionHolder(entry, state.objects.tokens);
    return definitions.map((condition): ContextMenuEntry => {
      const has = holder.conditions?.includes(condition.id) === true;
      const name = condition.name.trim() || t('menu.unnamedCondition');
      return {
        type: 'item',
        label: name,
        checked: has,
        keepOpen: true,
        leading: createElement(ConditionBadgePreview, { condition, size: BADGE_SIZE }),
        onClick: () => store.getState().setCombatantCondition(entryId, condition.id, !has),
      };
    });
  };
  const subscribe = (onChange: () => void): (() => void) =>
    store.subscribe((state, previous) => {
      if (state.objects.tokens !== previous.objects.tokens || state.initiative !== previous.initiative) onChange();
    });
  return { type: 'submenu', label: t('menu.conditions'), icon: 'palette', children, subscribe };
}

import { createElement } from 'react';
import type { StoreApi } from 'zustand';
import type { ContextMenuEntry, MenuStepper } from './AtlasContextMenu';
import type { ViewAtlasState } from '../../../storeFactory';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import { conditionValue } from '../../../utils/conditionValues';
import { ConditionBadgePreview } from '../collection-settings/ConditionBadgePreview';
import { t } from '../../../i18n';

const BADGE_SIZE = 16;

/**
 * "Conditions" submenu for one or several tokens. A condition is ticked when every token
 * has it; one that only some have shows how many ("Poisoned (2/3)"). Choosing a condition
 * removes it when every token has it and adds it to all of them otherwise. A valued
 * condition also gets − value + controls that step every token. The submenu stays
 * open and follows the tokens, so several conditions can be set in a row.
 */
export function conditionsSubmenu(
  store: StoreApi<ViewAtlasState>,
  definitions: readonly ConditionDefinition[],
  tokenIds: readonly string[],
): ContextMenuEntry {
  const children = (): ContextMenuEntry[] => {
    const tokens = store.getState().objects.tokens;
    return definitions.map((condition) => {
      const holders = tokenIds.filter((id) => tokens[id]?.conditions?.includes(condition.id));
      const count = holders.length;
      const hasAll = count === tokenIds.length;
      const name = condition.name.trim() || t('menu.unnamedCondition');
      return {
        type: 'item',
        label: count > 0 && !hasAll ? `${name} (${count}/${tokenIds.length})` : name,
        checked: hasAll,
        keepOpen: true,
        leading: createElement(ConditionBadgePreview, { condition, size: BADGE_SIZE }),
        onClick: () => store.getState().setTokensCondition([...tokenIds], condition.id, !hasAll),
        ...(condition.valued && {
          stepper: valueStepper(name, holders.map((id) => conditionValue(tokens[id]!, condition.id)), (delta) =>
            store.getState().changeTokensConditionValue([...tokenIds], condition.id, delta)),
        }),
      };
    });
  };
  const subscribe = (onChange: () => void): (() => void) =>
    store.subscribe((state, previous) => {
      if (state.objects.tokens !== previous.objects.tokens) onChange();
    });
  const label = tokenIds.length > 1 ? t('menu.conditionsFor', { count: tokenIds.length }) : t('menu.conditions');
  return { type: 'submenu', label, icon: 'palette', children, subscribe };
}

/** The shared value, or its range when the tokens differ ("1–3"); 0 when no token has the condition. */
function valueStepper(name: string, values: readonly number[], step: (delta: number) => void): MenuStepper {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return {
    value: values.length === 0 ? '0' : low === high ? String(low) : `${low}–${high}`,
    label: name,
    canDecrement: values.length > 0,
    onDecrement: () => step(-1),
    onIncrement: () => step(1),
  };
}

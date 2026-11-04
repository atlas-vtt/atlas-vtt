import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import { t } from '../i18n';

/** The token fields that hold its conditions. */
export interface TokenConditionState {
  conditions?: string[] | undefined;
  conditionValues?: Record<string, number> | undefined;
}

/** The number of an active valued condition; 1 when none was set. */
export function conditionValue(token: TokenConditionState, conditionId: string): number {
  return token.conditionValues?.[conditionId] ?? 1;
}

/** "Frightened 2" for a valued condition, the plain name otherwise. */
export function conditionLabel(definition: Pick<ConditionDefinition, 'name' | 'valued'>, value: number): string {
  const name = definition.name.trim() || t('menu.unnamedCondition');
  return definition.valued ? `${name} ${value}` : name;
}

/**
 * Sets a token's condition to `value` in place: a value of 0 or less removes it,
 * any other value makes it active with that number. `valued` false keeps no number.
 */
export function setConditionValue(token: TokenConditionState, conditionId: string, value: number, valued: boolean): void {
  const active = token.conditions ?? [];
  if (value <= 0) {
    removeCondition(token, conditionId);
    return;
  }
  if (!active.includes(conditionId)) token.conditions = [...active, conditionId];
  if (!valued) return;
  token.conditionValues = { ...token.conditionValues, [conditionId]: value };
}

/** Takes a condition and its number off the token in place. */
export function removeCondition(token: TokenConditionState, conditionId: string): void {
  const remaining = (token.conditions ?? []).filter((id) => id !== conditionId);
  if (remaining.length > 0) token.conditions = remaining;
  else delete token.conditions;
  if (!token.conditionValues || !(conditionId in token.conditionValues)) return;
  const { [conditionId]: _removed, ...values } = token.conditionValues;
  if (Object.keys(values).length > 0) token.conditionValues = values;
  else delete token.conditionValues;
}

import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { BUILT_IN_ID_PREFIX } from '../../types/systemPresetTypes';
import { withDeadCondition } from '../deadCondition';

/** A condition as a built-in preset defines it; the id is derived from the preset and the name. */
export type BuiltInCondition = Omit<ConditionDefinition, 'id'>;

/** The id of a built-in preset. Never change it: collections record it. */
export function builtInPresetId(presetKey: string): string {
  return `${BUILT_IN_ID_PREFIX}${presetKey}`;
}

/** Conditions with ids derived from the preset and their name. Never change them: tokens record them. */
export function conditionsOf(presetKey: string, conditions: readonly BuiltInCondition[]): ConditionDefinition[] {
  return withDeadCondition(conditions.map((condition) => ({
    id: `${presetKey}-${condition.name.toLowerCase().replace(/\s+/g, '-')}`,
    ...condition,
  })), `${presetKey}-dead`);
}

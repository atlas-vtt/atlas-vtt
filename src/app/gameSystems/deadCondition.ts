import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import { BUILT_IN_ID_PREFIX } from '../types/systemPresetTypes';

/** The condition used by Kill when no system defines its own. */
export const DEAD_CONDITION: Readonly<ConditionDefinition> = {
  id: 'atlas-dead', name: 'Dead', color: '#1f2937', icon: 'skull', effect: 'no-vision',
};

/** Stable across upgrades, including collections that copied a preset before Dead existed. */
export function deadConditionId(systemPresetId?: string): string {
  return systemPresetId?.startsWith(BUILT_IN_ID_PREFIX)
    ? `${systemPresetId.slice(BUILT_IN_ID_PREFIX.length)}-dead`
    : DEAD_CONDITION.id;
}

/** Reuse the system's definition, including custom ids, rather than adding another Dead. */
export function deadConditionOf(conditions: readonly ConditionDefinition[], id = DEAD_CONDITION.id): ConditionDefinition | undefined {
  return conditions.find((condition) => condition.id === id)
    ?? conditions.find((condition) => condition.name.trim().toLowerCase() === 'dead');
}

/** Give every system Dead, retaining existing ids and explicit effect overrides. */
export function withDeadCondition(conditions: ConditionDefinition[], id = DEAD_CONDITION.id): ConditionDefinition[] {
  const existing = deadConditionOf(conditions, id);
  if (existing) {
    return existing.effect === undefined
      ? conditions.map((condition) => condition === existing ? { ...condition, effect: 'no-vision' } : condition)
      : conditions;
  }
  return [...conditions, { ...DEAD_CONDITION, id }];
}

interface ConditionSettings {
  conditions: ConditionDefinition[];
  systemPresetId?: string | undefined;
}

const upgradedSettings = new WeakMap<ConditionSettings, ConditionSettings>();

/** Upgrade old collection/campaign settings without changing references on every sight update. */
export function withDeadConditionSettings<T extends ConditionSettings>(settings: T): T {
  const cached = upgradedSettings.get(settings);
  if (cached) return cached as T;
  const conditions = withDeadCondition(settings.conditions, deadConditionId(settings.systemPresetId));
  if (conditions === settings.conditions) return settings;
  const next = { ...settings, conditions };
  upgradedSettings.set(settings, next);
  return next;
}

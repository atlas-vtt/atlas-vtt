import type { ConditionDefinition, ConditionEffect } from '../types/collectionSettingsTypes';
import { BUILT_IN_SYSTEM_PRESETS } from './builtInPresets';

/** The effects of the built-in conditions, by their ids, which never change. */
const BUILT_IN_EFFECTS: ReadonlyMap<string, ConditionEffect> = new Map(
  BUILT_IN_SYSTEM_PRESETS.flatMap((preset) => preset.rules.conditions)
    .flatMap((condition) => (condition.effect && condition.effect !== 'none' ? [[condition.id, condition.effect] as const] : [])),
);

/**
 * What a condition does to sight: the effect it sets (`none` is no effect), else that of the
 * built-in condition whose id it has. Collections hold copies of their system's conditions, and
 * those copied before effects existed carry none. Everything that reads an effect reads it here.
 */
export function conditionEffect(condition: Pick<ConditionDefinition, 'id' | 'effect'>): ConditionEffect | undefined {
  if (condition.effect === 'none') return undefined;
  return condition.effect ?? BUILT_IN_EFFECTS.get(condition.id);
}

/**
 * `condition` with `effect` as what it does to sight (`none` for nothing), storing only what
 * `conditionEffect` would not read anyway: nothing where the condition's built-in effect is the
 * one chosen. An explicit `none` also prevents older Dead definitions gaining their default effect.
 */
export function withConditionEffect<T extends Pick<ConditionDefinition, 'id' | 'effect'>>(condition: T, effect: ConditionEffect | 'none'): T {
  const { effect: _effect, ...rest } = condition;
  const builtIn = BUILT_IN_EFFECTS.get(condition.id);
  return (effect === builtIn ? rest : { ...rest, effect }) as T;
}

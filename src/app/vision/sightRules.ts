import { conditionEffect } from '../gameSystems/conditionEffects';
import { DEAD_CONDITION } from '../gameSystems/deadCondition';
import { sameSenses } from '../gameSystems/senseRules';
import { GENERIC_SENSES } from '../gameSystems/senses/generic';
import type { TokenEntity } from '../types';
import type { ConditionDefinition, ConditionEffect } from '../types/collectionSettingsTypes';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';

/** What a scene's collection decides about sight. */
export interface SightRules {
  /** The senses tokens of the collection can have (`collectionSenses`). */
  definitions: readonly SenseDefinition[];
  /** Its conditions, for those that change sight. */
  conditions: readonly ConditionDefinition[];
  /**
   * How a token perceives. Unset, that is read from its vision alone (`tokenSenses`, its
   * `range`); set, this is the one place sight gets it from, for tokens that follow a linked
   * statblock (`tokenSensesResolver`).
   */
  visionOf?: (token: TokenEntity) => TokenSight;
}

/** How one token perceives, as sight reads it. */
export interface TokenSight {
  senses: readonly TokenSense[];
  /** How far its normal sight reaches, in game units: unset is unlimited, 0 is no normal sight at all. */
  sightRange?: number;
  /** Not known yet (its statblock is still being read): the token sees and senses nothing until it is. */
  pending?: boolean;
}

/** The conditions that change sight, as a comparable key: what they are called or look like does not matter. */
function effectsKey(conditions: readonly ConditionDefinition[]): string {
  return conditions.flatMap((condition) => {
    const effect = conditionEffect(condition);
    return effect ? [`${condition.id}=${effect}`] : [];
  }).sort().join('\n');
}

/** Whether sight works out the same by two sets of rules: the same senses, the same conditions that change sight, the same way of asking how a token perceives. */
export function sameSightRules(a: SightRules, b: SightRules): boolean {
  return (a.definitions === b.definitions || sameSenses(a.definitions, b.definitions))
    && effectsKey(a.conditions) === effectsKey(b.conditions)
    && a.visionOf === b.visionOf;
}

/** A scene without a collection: the generic senses and the universal Dead condition. */
export const GENERIC_SIGHT_RULES: SightRules = { definitions: GENERIC_SENSES, conditions: [DEAD_CONDITION] };

/** What the conditions a token has do to sight. */
export function tokenEffects(token: Pick<TokenEntity, 'conditions'>, conditions: readonly ConditionDefinition[]): ReadonlySet<ConditionEffect> {
  const effects = new Set<ConditionEffect>();
  for (const id of token.conditions ?? []) {
    const condition = conditions.find((candidate) => candidate.id === id);
    const effect = condition && conditionEffect(condition);
    if (effect) effects.add(effect);
  }
  return effects;
}

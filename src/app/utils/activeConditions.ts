import type { TokenEntity } from '../types';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import { conditionGlyph, type ConditionGlyph } from './conditionGlyph';
import { conditionLabel, conditionValue, type TokenConditionState } from './conditionValues';

const UNKNOWN_COLOR = 0x808080;

/** A condition active on a token, resolved from its collection's definitions, as its badge shows it. */
export interface ActiveCondition {
  id: string;
  /** "Frightened 2" for a valued condition, the plain name otherwise. */
  name: string;
  /** Badge colour as 0xRRGGBB. */
  color: number;
  glyph: ConditionGlyph;
  /** Number of a valued condition, shown in a pip on the badge. */
  value?: number;
}

/**
 * The token's conditions in the order it gained them, skipping any its collection no
 * longer defines. Valued conditions carry their number ("Frightened 2").
 */
export function resolveActiveConditions(
  token: TokenConditionState,
  definitions: readonly ConditionDefinition[],
): ActiveCondition[] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return (token.conditions ?? []).flatMap((id) => {
    const definition = byId.get(id);
    if (!definition) return [];
    const color = Number.parseInt(definition.color.replace('#', ''), 16);
    const value = conditionValue(token, id);
    return [{
      id,
      name: conditionLabel(definition, value),
      color: Number.isNaN(color) ? UNKNOWN_COLOR : color,
      glyph: conditionGlyph(definition),
      ...(definition.valued && { value }),
    }];
  });
}

/**
 * The badges a combatant's card shows: those the map draws on its token. The map draws
 * conditions on creature tokens only (`UIManager`), for the GM and the players alike.
 */
export function combatantConditions(token: TokenEntity | undefined, definitions: readonly ConditionDefinition[]): ActiveCondition[] {
  return token?.kind === 'character' ? resolveActiveConditions(token, definitions) : [];
}

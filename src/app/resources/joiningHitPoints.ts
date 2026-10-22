/**
 * Hit points rolled when a creature joins a scene (`InitiativeRules.rollHitPoints`): its statblock's
 * hit dice, rolled once per token, set as both current and maximum of the hit point resource.
 */

import type { FieldMeanings } from '../statblocks/resolve/fieldMeanings';
import { parseFormula } from '../tools/parseFormula';
import { rollFormula } from '../tools/diceFormula';
import { isHitPointsKey, resolveField } from './resourceFields';
import { resourceUpdate } from './resourceValues';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';

/** Where conventions keep hit dice beside the hit points (Fantasy Statblocks' 5e layouts, the d20 built-ins). */
const HIT_DICE_FIELD = 'hit_dice';

/** The resource that holds hit points: the one whose statblock field names them, never a fixed value. */
export function hitPointResource(definitions: readonly ResourceDefinition[]): ResourceDefinition | undefined {
  return definitions.find((definition) => definition.direction !== 'static' && isHitPointsKey(definition.field));
}

/** `text` as dice that can be rolled: a valid formula with at least one die; null otherwise. */
function diceFormula(text: unknown): string | null {
  if (typeof text !== 'string' || !/\d*d\d/i.test(text)) return null;
  const formula = text.trim();
  const parsed = parseFormula(formula);
  return parsed.ok && parsed.terms.some((term) => term.kind === 'dice') ? formula : null;
}

/**
 * The hit dice of a statblock: the dice written beside the hit points ("7 (2d6)", "45 (6d10 + 12)"),
 * the hit points written as dice ("2d6+2"), else the conventional hit dice field. Null where none
 * reads as dice, so the statblock's own hit points stand.
 */
export function statblockHitDice(fields: Readonly<Record<string, unknown>>, meanings: FieldMeanings, hitPoints: ResourceDefinition): string | null {
  const value = resolveField(fields, hitPoints.field, meanings);
  if (typeof value === 'string') {
    const beside = value.match(/\(([^()]+)\)/);
    const written = diceFormula(beside?.[1]) ?? diceFormula(value);
    if (written) return written;
  }
  return diceFormula(resolveField(fields, HIT_DICE_FIELD, meanings));
}

/** `formula` rolled with `random` (the dice tool's own stream); never below 1, as a creature with no hit points has not joined. */
export function rollHitDice(formula: string, random: () => number): number | null {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return null;
  return Math.max(1, rollFormula(parsed, random).total);
}

/**
 * The resources of a joining token with `hp` as both current and maximum of `key`. The maximum is
 * marked as set by hand, as a statblock's hit dice rolled on the map are, so a later statblock sync
 * keeps the rolled number.
 */
export function withRolledHitPoints(token: ResourceHolder, key: string, hp: number): { resources: Record<string, ResourceValue>; overriddenMax?: string[] } {
  return resourceUpdate(token, key, { current: hp, max: hp }, true);
}

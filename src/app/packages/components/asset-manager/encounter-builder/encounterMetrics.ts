import { factsOf, type CreatureLookupFn } from '../../../../creatures/creatureFacts';
import { RATING_FILTERS } from '../../../../creatures/creatureFieldCatalog';
import { statblockResourceValue } from '../../../../resources/statblockResourceValues';
import type { ResourceDefinition } from '../../../../resources/resourceTypes';
import { quantityRange, type QuantityRange } from '../../../../encounters/encounterQuantity';
import { totalCount, type EncounterPick } from './encounterPicks';

/** The span of the creatures' ratings, on the one scale they all share. */
export interface RatingSpan {
  label: string;
  min: number;
  max: number;
}

/**
 * The sum of a resource over every creature, a whole pool the party has to wear down: from the
 * fewest creatures their dice can bring to the most (`min` = `max` where no number is rolled).
 */
export interface ResourceTotal extends QuantityRange {
  key: string;
  name: string;
}

export interface EncounterMetrics {
  /** The fewest and most creatures, since a creature's number may be dice. */
  count: QuantityRange;
  rating: RatingSpan | null;
  totals: ResourceTotal[];
}

/**
 * What can be said of an encounter in any game system. No system's budget is applied: a sum of
 * ratings means something in some systems and nothing in others, so ratings are only spanned, and
 * only where every creature is rated on one scale. The resources that defeat a creature (hit
 * points, whatever the collection calls them) add up in every system, so they are summed, but only
 * where every creature's statblock gives a number: a total that leaves creatures out misleads.
 */
export function encounterMetrics(
  picks: readonly EncounterPick[],
  lookup: CreatureLookupFn,
  resources: readonly ResourceDefinition[],
): EncounterMetrics {
  return { count: totalCount(picks), rating: ratingSpan(picks, lookup), totals: resourceTotals(picks, lookup, resources) };
}

function ratingSpan(picks: readonly EncounterPick[], lookup: CreatureLookupFn): RatingSpan | null {
  const ratings = picks.map((pick) => factsOf(pick.token, lookup, []).rating);
  const first = ratings[0];
  if (!first || ratings.some((rating) => rating === null || rating.scale !== first.scale)) return null;
  const values = ratings.map((rating) => rating?.value ?? 0);
  const label = RATING_FILTERS[first.scale]?.label;
  return label ? { label, min: Math.min(...values), max: Math.max(...values) } : null;
}

function resourceTotals(
  picks: readonly EncounterPick[],
  lookup: CreatureLookupFn,
  resources: readonly ResourceDefinition[],
): ResourceTotal[] {
  if (picks.length === 0) return [];
  const creatures = picks.map((pick) => (pick.token.statblockPath ? lookup(pick.token.statblockPath) : null));
  return resources.flatMap((definition): ResourceTotal[] => {
    if (!definition.defeatedWhenSpent || definition.direction === 'static') return [];
    const total = { min: 0, max: 0 };
    for (const [index, pick] of picks.entries()) {
      const creature = creatures[index];
      const max = creature ? statblockResourceValue(creature.fields, definition, creature.meanings)?.max : undefined;
      if (max === undefined) return [];
      const copies = quantityRange(pick.count);
      total.min += max * copies.min;
      total.max += max * copies.max;
    }
    return [{ key: definition.key, name: definition.name, ...total }];
  });
}

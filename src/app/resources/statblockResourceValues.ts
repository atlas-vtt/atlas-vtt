import { parseResourceValue, resolveField } from './resourceFields';
import { holdsValue } from './resourceValues';
import type { ResourceDefinition, ResourceValue } from './resourceTypes';
import { NO_MEANINGS, type FieldMeanings } from '../statblocks/resolve/fieldMeanings';

/**
 * The starting value a statblock gives one resource, or null when its field holds no quantity.
 * `meanings` are those of the statblock's template: hit points under another key are found by them.
 */
export function statblockResourceValue(
  record: Readonly<Record<string, unknown>>,
  definition: ResourceDefinition,
  meanings: FieldMeanings = NO_MEANINGS,
): ResourceValue | null {
  // A bare maximum starts full or empty by direction; a stated current ("12/27") is kept.
  const parsed = parseResourceValue(resolveField(record, definition.field, meanings), definition.direction === 'fills');
  return parsed && holdsValue(definition, parsed) ? parsed : null;
}

export function startingResources(
  record: Readonly<Record<string, unknown>>,
  definitions: readonly ResourceDefinition[],
  meanings: FieldMeanings = NO_MEANINGS,
): Record<string, ResourceValue> {
  const values: Record<string, ResourceValue> = {};
  for (const definition of definitions) {
    const value = statblockResourceValue(record, definition, meanings);
    if (value) values[definition.key] = value;
  }
  return values;
}

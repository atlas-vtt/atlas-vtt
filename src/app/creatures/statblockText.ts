import type { IndexedCreature } from './CreatureIndex';
import { plainText } from './creatureValues';
import { boundedValue } from './statblockValues';

const texts = new WeakMap<IndexedCreature, string>();

function collect(value: unknown, into: string[]): void {
  if (typeof value === 'string') into.push(value);
  else if (typeof value === 'number' || typeof value === 'boolean') into.push(String(value));
  else if (Array.isArray(value)) for (const item of value) collect(item, into);
  else if (value !== null && typeof value === 'object') for (const item of Object.values(value)) collect(item, into);
}

/**
 * Everything a statblock says, as one lowercase text the `text:` filter searches: every value of
 * every field (names of abilities and their descriptions alike), links and dice notation read as
 * text, field names left out. Read within `STATBLOCK_LIMITS`, once per creature the index holds.
 */
export function statblockText(creature: IndexedCreature): string {
  const cached = texts.get(creature);
  if (cached !== undefined) return cached;
  const parts: string[] = [];
  collect(boundedValue(creature.fields), parts);
  const text = plainText(parts.join(' ')).toLowerCase();
  texts.set(creature, text);
  return text;
}

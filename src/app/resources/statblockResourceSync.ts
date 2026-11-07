import { statblockResourceValue } from './statblockResourceValues';
import { clampValue, holdsValue } from './resourceValues';
import { parseResourceValue, resolveField } from './resourceFields';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';
import { shownFieldsOf } from '../statblocks/model/resolvedTypes';
import { NO_MEANINGS, type FieldMeanings } from '../statblocks/resolve/fieldMeanings';

/** A statblock's fields with the meanings of its template, as the resolver gives them. */
export interface StatblockFields {
  fields: Readonly<Record<string, unknown>>;
  meanings?: FieldMeanings;
  /** Fields the statblock holds empty though its record lacks them (`StatblockRecord.emptyFields`). */
  emptyFields?: readonly string[];
}

/**
 * Whether the statblock says the creature has none of a resource: its field is there but
 * empty, or holds a quantity too small to show (0 hit points). An absent field, or text that is
 * no quantity yet, says nothing: a read without a base statblock or a value being typed.
 */
function statesNone(record: Readonly<Record<string, unknown>>, definition: ResourceDefinition, meanings: FieldMeanings): boolean {
  const value = resolveField(record, definition.field, meanings);
  if (value === undefined) return false;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return true;
  const parsed = parseResourceValue(value, definition.direction === 'fills');
  return parsed !== null && !holdsValue(definition, parsed);
}

/**
 * A linked token's resources after its statblock changed: each defined
 * resource takes the statblock's maximum unless it was set by hand; the
 * current value is kept and clamped. A resource new to the token starts fresh,
 * and one whose field the statblock empties leaves the token.
 */
export function syncedResources(
  token: ResourceHolder,
  record: Readonly<Record<string, unknown>>,
  definitions: readonly ResourceDefinition[],
  meanings: FieldMeanings = NO_MEANINGS,
  emptyFields: readonly string[] = [],
): Record<string, ResourceValue> {
  const next: Record<string, ResourceValue> = { ...token.resources };
  const stated = emptyFields.length > 0 ? { ...Object.fromEntries(emptyFields.map((key) => [key, null])), ...record } : record;
  for (const definition of definitions) {
    if (token.overriddenMax?.includes(definition.key)) continue;
    const fromStatblock = statblockResourceValue(record, definition, meanings);
    if (!fromStatblock) {
      if (statesNone(stated, definition, meanings)) delete next[definition.key];
      continue;
    }
    const current = next[definition.key];
    next[definition.key] = current ? clampValue({ current: current.current, max: fromStatblock.max }) : fromStatblock;
  }
  return next;
}

interface LinkedToken extends ResourceHolder {
  statblockPath?: string | undefined;
}

/** Where linked tokens are read and changed: the map's store. */
export interface ResourceTokens {
  tokens(): Readonly<Record<string, LinkedToken>>;
  apply(entries: Array<{ id: string; changes: { resources: Record<string, ResourceValue> } }>): void;
}

/**
 * Gives linked tokens a starting value for every defined resource they do not
 * hold yet and their statblock has: a resource added to the collection after
 * they were placed, or a map from before resources. Values they hold stay.
 */
export async function fillMissingResources(
  host: ResourceTokens,
  definitions: readonly ResourceDefinition[],
  readStatblock: (path: string) => Promise<StatblockFields | null>,
): Promise<void> {
  const incomplete = (): Array<[string, LinkedToken & { statblockPath: string }]> =>
    Object.entries(host.tokens()).filter((entry): entry is [string, LinkedToken & { statblockPath: string }] =>
      Boolean(entry[1].statblockPath) && definitions.some((definition) => !entry[1].resources?.[definition.key]));

  // ponytail: reads the statblock of every incomplete token on each call; remember
  // statblocks with nothing to add if maps with hundreds of them load slowly.
  const paths = [...new Set(incomplete().map(([, token]) => token.statblockPath))];
  if (paths.length === 0) return;
  const records = new Map(await Promise.all(paths.map(async (path) => [path, await readStatblock(path)] as const)));

  // Read the tokens again: they may have changed while the statblocks were read.
  const entries: Parameters<ResourceTokens['apply']>[0] = [];
  for (const [id, token] of incomplete()) {
    const statblock = records.get(token.statblockPath);
    if (!statblock) continue;
    const resources = { ...token.resources };
    for (const definition of definitions) {
      const value = resources[definition.key] ? null : statblockResourceValue(shownFieldsOf(statblock), definition, statblock.meanings);
      if (value) resources[definition.key] = value;
    }
    if (Object.keys(resources).length > Object.keys(token.resources ?? {}).length) entries.push({ id, changes: { resources } });
  }
  if (entries.length > 0) host.apply(entries);
}

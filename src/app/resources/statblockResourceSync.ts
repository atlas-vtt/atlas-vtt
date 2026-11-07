import { statblockResourceValue } from './statblockResourceValues';
import { holdsValue, startingValue, withCurrent } from './resourceValues';
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

/** The record with the fields the statblock holds empty though the record lacks them, as `null`. */
function statedRecord(record: Readonly<Record<string, unknown>>, emptyFields: readonly string[]): Readonly<Record<string, unknown>> {
  return emptyFields.length > 0 ? { ...Object.fromEntries(emptyFields.map((key) => [key, null])), ...record } : record;
}

/** How a held value takes the maximum its statblock now gives. */
type TakeMax = (definition: ResourceDefinition, held: ResourceValue, fromStatblock: ResourceValue) => ResourceValue;

/** The current value is kept, within the new maximum. */
const keepCurrent: TakeMax = (_definition, held, fromStatblock) => withCurrent(fromStatblock, held.current);

/**
 * A held value of a resource that now reads another field: where it starts (full when draining,
 * empty when filling) it starts again from the new field, any other keeps its current value.
 */
const restartAtStart: TakeMax = (definition, held, fromStatblock) =>
  held.current === startingValue(definition, held.max).current ? fromStatblock : keepCurrent(definition, held, fromStatblock);

/**
 * A linked token's resources after its statblock changed: each defined
 * resource takes the statblock's maximum unless it was set by hand; the
 * current value is kept and clamped (`takeMax`). A resource new to the token
 * starts fresh, and one whose field the statblock empties leaves the token.
 */
export function syncedResources(
  token: ResourceHolder,
  record: Readonly<Record<string, unknown>>,
  definitions: readonly ResourceDefinition[],
  meanings: FieldMeanings = NO_MEANINGS,
  emptyFields: readonly string[] = [],
  takeMax: TakeMax = keepCurrent,
): Record<string, ResourceValue> {
  const next: Record<string, ResourceValue> = { ...token.resources };
  const stated = statedRecord(record, emptyFields);
  for (const definition of definitions) {
    if (token.overriddenMax?.includes(definition.key)) continue;
    const fromStatblock = statblockResourceValue(record, definition, meanings);
    if (!fromStatblock) {
      if (statesNone(stated, definition, meanings)) delete next[definition.key];
      continue;
    }
    const current = next[definition.key];
    next[definition.key] = current ? takeMax(definition, current, fromStatblock) : fromStatblock;
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

/** The definitions of `next` that read another statblock field than the definition of their key in `previous`. */
export function refieldedResources(previous: readonly ResourceDefinition[], next: readonly ResourceDefinition[]): ResourceDefinition[] {
  const fields = new Map(previous.map((definition) => [definition.key, definition.field]));
  return next.filter((definition) => fields.has(definition.key) && fields.get(definition.key) !== definition.field);
}

/**
 * Linked tokens follow their statblock for the resources of `definitions`: each starts those it
 * does not hold yet and its statblock has (a resource added to the collection after it was
 * placed, or a map from before resources), and re-reads those of `refielded` it holds, which now
 * read another statblock field: unless set by hand (`overriddenMax`), such a value takes the new
 * field's maximum, a value where it starts restarting, and leaves the token where the statblock
 * empties the field. Other values stay, as does a value whose new field the statblock lacks.
 */
export async function followStatblockResources(
  host: ResourceTokens,
  definitions: readonly ResourceDefinition[],
  refielded: readonly ResourceDefinition[],
  readStatblock: (path: string) => Promise<StatblockFields | null>,
): Promise<void> {
  const missing = (token: LinkedToken): ResourceDefinition[] => definitions.filter((definition) => !token.resources?.[definition.key]);
  const following = (token: LinkedToken): ResourceDefinition[] =>
    refielded.filter((definition) => token.resources?.[definition.key] && !token.overriddenMax?.includes(definition.key));
  const concerned = (): Array<[string, LinkedToken & { statblockPath: string }]> => Object.entries(host.tokens())
    .filter((entry): entry is [string, LinkedToken & { statblockPath: string }] => Boolean(entry[1].statblockPath))
    .filter(([, token]) => missing(token).length > 0 || following(token).length > 0);

  // ponytail: reads the statblock of every token missing a resource on each call; remember
  // statblocks with nothing to add if maps with hundreds of them load slowly.
  const paths = [...new Set(concerned().map(([, token]) => token.statblockPath))];
  if (paths.length === 0) return;
  const records = new Map(await Promise.all(paths.map(async (path) => [path, await readStatblock(path)] as const)));

  // Read the tokens again: they may have changed while the statblocks were read.
  const entries: Parameters<ResourceTokens['apply']>[0] = [];
  for (const [id, token] of concerned()) {
    const statblock = records.get(token.statblockPath);
    if (!statblock) continue;
    const fields = shownFieldsOf(statblock);
    const resources = syncedResources(token, fields, following(token), statblock.meanings, statblock.emptyFields, restartAtStart);
    for (const definition of missing(token)) {
      const value = statblockResourceValue(fields, definition, statblock.meanings);
      if (value) resources[definition.key] = value;
    }
    if (JSON.stringify(resources) !== JSON.stringify(token.resources ?? {})) entries.push({ id, changes: { resources } });
  }
  if (entries.length > 0) host.apply(entries);
}

/** Linked tokens start every resource of `definitions` they do not hold yet and their statblock has. Values they hold stay. */
export function fillMissingResources(
  host: ResourceTokens,
  definitions: readonly ResourceDefinition[],
  readStatblock: (path: string) => Promise<StatblockFields | null>,
): Promise<void> {
  return followStatblockResources(host, definitions, [], readStatblock);
}

import { statblockResourceValue } from './statblockResourceValues';
import { clampValue } from './resourceValues';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';
import { shownFieldsOf } from '../statblocks/model/resolvedTypes';
import { NO_MEANINGS, type FieldMeanings } from '../statblocks/resolve/fieldMeanings';

/** A statblock's fields with the meanings of its template, as the resolver gives them. */
export interface StatblockFields {
  fields: Readonly<Record<string, unknown>>;
  meanings?: FieldMeanings;
}

/**
 * A linked token's resources after its statblock changed: each defined
 * resource takes the statblock's maximum unless it was set by hand; the
 * current value is kept and clamped. A resource new to the token starts fresh.
 */
export function syncedResources(
  token: ResourceHolder,
  record: Readonly<Record<string, unknown>>,
  definitions: readonly ResourceDefinition[],
  meanings: FieldMeanings = NO_MEANINGS,
): Record<string, ResourceValue> {
  const next: Record<string, ResourceValue> = { ...token.resources };
  for (const definition of definitions) {
    if (token.overriddenMax?.includes(definition.key)) continue;
    const fromStatblock = statblockResourceValue(record, definition, meanings);
    if (!fromStatblock) continue;
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

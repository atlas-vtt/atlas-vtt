/**
 * What a token takes from its statblock when it is linked or unlinked. The statblock is read
 * through the resolver (`TokenStatblockLinkService.readStatblockRecord`), so renamed keys and
 * a template's meanings count, as on closed maps.
 */

import { difficultyLabel, statblockDisplayName } from '../../creatures/statblockRating';
import type { ResourceDefinition, ResourceHolder } from '../../resources/resourceTypes';
import type { StatblockFields } from '../../resources/statblockResourceSync';
import { startingResources } from '../../resources/statblockResourceValues';
import { NO_MEANINGS } from '../../statblocks/resolve/fieldMeanings';
import type { Character } from '../../types';

/**
 * Fields a token takes over when it is first linked to a statblock. Display
 * preferences such as `showNameplate` belong to the user and are not touched.
 */
export type StatblockLinkUpdates =
  Partial<Pick<Character, 'name' | 'difficulty' | 'resources'>>;

/** Clears every statblock-derived field when a token is unlinked; user preferences stay. */
export const STATBLOCK_UNLINK_UPDATES = {
  statblockPath: undefined,
  name: undefined,
  statblockName: undefined,
  resources: undefined,
  overriddenMax: undefined,
  difficulty: undefined,
} as const;

/**
 * A freshly linked token starts every resource its statblock supplies. What it holds of
 * the others (`held`: hand-set hit points, the DM screen's quantities) stays.
 */
export function buildStatblockLinkUpdates(
  statblock: StatblockFields,
  currentName: string | undefined,
  definitions: readonly ResourceDefinition[],
  held: ResourceHolder['resources'],
): StatblockLinkUpdates {
  const { fields } = statblock;
  const meanings = statblock.meanings ?? NO_MEANINGS;
  const updates: StatblockLinkUpdates = { resources: { ...held, ...startingResources(fields, definitions, meanings) } };

  const name = statblockDisplayName(fields, meanings) ?? currentName;
  if (name !== undefined) {
    updates.name = name;
  }

  const difficulty = difficultyLabel(fields, meanings);
  if (difficulty !== undefined) {
    updates.difficulty = difficulty;
  }

  return updates;
}

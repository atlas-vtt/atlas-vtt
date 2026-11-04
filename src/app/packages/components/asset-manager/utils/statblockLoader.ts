import type { App as ObsidianApp } from 'obsidian';
import { difficultyLabel, statblockDisplayName } from '../../../../creatures/statblockRating';
import type { ResourceDefinition, ResourceValue } from '../../../../resources/resourceTypes';
import { startingResources } from '../../../../resources/statblockResourceValues';
import { shownFieldsOf } from '../../../../statblocks/model/resolvedTypes';
import { readStatblock } from '../../../../statblocks/resolve/readStatblock';
import { hitPointResource, statblockHitDice } from '../../../../resources/joiningHitPoints';

export interface StatblockOverrides {
  name?: string;
  difficulty?: string;
  /** Starting values of the collection's resources the statblock has a field for. */
  resources?: Record<string, ResourceValue>;
  /** The statblock's hit dice, where the collection tracks hit points and they read as dice (`statblockHitDice`). */
  hitDice?: string;
}

/**
 * Resolves what a token takes from the statblock of a linked note: its name,
 * difficulty and the starting values of the collection's resources. A native
 * statblock's template says which fields hold its hit points and rating.
 */
export async function loadStatblockOverrides(
  app: ObsidianApp,
  statblockPath: string,
  definitions: readonly ResourceDefinition[],
): Promise<StatblockOverrides> {
  const overrides: StatblockOverrides = {};

  try {
    const statblock = await readStatblock(app, statblockPath);
    if (!statblock) return overrides;
    const { meanings } = statblock;
    const fields = shownFieldsOf(statblock);

    const resources = startingResources(fields, definitions, meanings);
    if (Object.keys(resources).length > 0) overrides.resources = resources;

    const difficulty = difficultyLabel(fields, meanings);
    if (difficulty !== undefined) overrides.difficulty = difficulty;

    const name = statblockDisplayName(fields, meanings);
    if (name !== null) overrides.name = name;

    const hitPoints = hitPointResource(definitions);
    const hitDice = hitPoints ? statblockHitDice(fields, meanings, hitPoints) : null;
    if (hitDice !== null) overrides.hitDice = hitDice;
  } catch (error) {
    console.error('[statblockLoader] Failed to load statblock data:', error);
  }

  return overrides;
}

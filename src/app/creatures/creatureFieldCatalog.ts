import type { CreatureFilterDefinition, CreatureRangeFilter } from '../types/creatureFilterTypes';
import { t } from '../i18n';

/**
 * The statblock fields Atlas filters by in every collection. Fantasy
 * Statblocks' layouts share these names across game systems, so a filter shows
 * wherever the statblocks in view have its field and stays hidden elsewhere.
 * Labels name what the field holds in any system. Never change an id: the
 * collection settings hide filters by id.
 */
export const CATALOG_CREATURE_FILTERS: readonly CreatureFilterDefinition[] = [
  { id: 'cr', label: t('creatureFilter.cr'), kind: 'range', field: 'cr' },
  { id: 'level', label: t('creatureFilter.level'), kind: 'range', field: 'level' },
  { id: 'tier', label: t('creatureFilter.tier'), kind: 'range', field: 'tier' },
  // "humanoid (goblinoid)" is humanoid, Daggerheart's "Horde (10/HP)" is Horde.
  { id: 'type', label: t('creatureFilter.type'), kind: 'options', fields: ['type'], values: 'category' },
  // Pathfinder's creature layout keeps traits in one list, its basic layout (and importers) in numbered fields.
  { id: 'traits', label: t('creatureFilter.traits'), kind: 'options', fields: ['traits', 'trait_01', 'trait_02', 'trait_03', 'trait_04', 'trait_05', 'trait_06', 'trait_07'] },
  { id: 'rarity', label: t('creatureFilter.rarity'), kind: 'options', fields: ['rarity', 'rare_01', 'rare_02', 'rare_03', 'rare_04'] },
  // Parts, not phrases: "chaotic evil" is Chaotic and Evil, and picking both finds exactly that.
  { id: 'alignment', label: t('creatureFilter.alignment'), kind: 'options', fields: ['alignment'], values: 'alignment', match: 'all' },
  { id: 'source', label: t('creatureFilter.source'), kind: 'options', fields: ['source'] },
];

/** The scales a creature is rated on, in the order the Rating sort prefers them. */
export const RATING_FILTERS: readonly CreatureRangeFilter[] = CATALOG_CREATURE_FILTERS
  .filter((filter): filter is CreatureRangeFilter => filter.kind === 'range');

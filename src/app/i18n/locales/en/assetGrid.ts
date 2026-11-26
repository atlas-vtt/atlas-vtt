import type { Message } from '../../types';

/** The asset manager's grid, its keys and what they announce. */
export const assetGrid = {
  'assetGrid.selected': { one: '{count} item selected', other: '{count} items selected' },
  'assetGrid.menuOf': 'Options of {name}',
  'assetGrid.statblockMissing': 'Statblock note not found',
  'assetGrid.openStatblock': 'Open statblock',
  'assetGrid.collections': 'Collections',
  'assetGrid.tokenCount': { one: '{count} token', other: '{count} tokens' },
  'assetGrid.filtersActive': { one: 'Filters, {count} active', other: 'Filters, {count} active' },
  'assetGrid.tagsOf': 'Tags of {name}',
  'assetGrid.results.scenes': { one: '{count} scene', other: '{count} scenes' },
  'assetGrid.results.maps': { one: '{count} map', other: '{count} maps' },
  'assetGrid.results.encounters': { one: '{count} encounter', other: '{count} encounters' },
  'assetGrid.results.tokens': { one: '{count} token', other: '{count} tokens' },
  'assetGrid.results.party': { one: '{count} player character', other: '{count} player characters' },
  'assetGrid.noResults.scenes': 'No scenes match',
  'assetGrid.noResults.maps': 'No maps match',
  'assetGrid.noResults.encounters': 'No encounters match',
  'assetGrid.noResults.tokens': 'No tokens match',
  'assetGrid.noResults.party': 'No player characters match',
} as const satisfies Record<string, Message>;

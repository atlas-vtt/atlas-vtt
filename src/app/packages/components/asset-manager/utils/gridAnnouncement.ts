import type { Tab } from '../types';
import { t, type MessageKey } from '../../../../i18n';

/** What the grid shows of its tab, for the announcer. */
export interface GridResults {
  tab: Tab;
  /** The assets the grid lists. */
  shown: number;
  /** A search, tags or filters narrow the list. */
  narrowed: boolean;
}

const RESULTS_OF: Record<Tab, MessageKey> = {
  scenes: 'assetGrid.results.scenes',
  maps: 'assetGrid.results.maps',
  encounters: 'assetGrid.results.encounters',
  tokens: 'assetGrid.results.tokens',
  party: 'assetGrid.results.party',
};

const NO_RESULTS_OF: Record<Tab, MessageKey> = {
  scenes: 'assetGrid.noResults.scenes',
  maps: 'assetGrid.noResults.maps',
  encounters: 'assetGrid.noResults.encounters',
  tokens: 'assetGrid.noResults.tokens',
  party: 'assetGrid.noResults.party',
};

/** "2 items selected", or nothing once the selection is empty. */
export function selectionMessage(count: number): string {
  return count > 0 ? t('assetGrid.selected', { count }) : '';
}

/**
 * "33 tokens" or "No tokens match" while a search or filters narrow the list (WCAG 4.1.3, search results), nothing
 * otherwise: the number the section header shows.
 */
export function resultsMessage({ tab, shown, narrowed }: GridResults): string {
  if (!narrowed) return '';
  if (shown === 0) return t(NO_RESULTS_OF[tab]);
  return t(RESULTS_OF[tab], { count: shown });
}

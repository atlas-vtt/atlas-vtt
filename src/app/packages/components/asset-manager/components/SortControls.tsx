import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { SortOption } from '../types';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import { SORT_LABELS } from '../utils/assetSort';
import { t } from '../../../../i18n';

const ALL_SORT_OPTIONS = Object.keys(SORT_LABELS) as SortOption[];

export type SortControlsProps = Pick<SelectionState, 'sortBy' | 'sortOptions' | 'setSortBy' | 'sortOrder' | 'setSortOrder'>;

/**
 * Sort field and order, at the end of the row that names the open folder: the
 * field is a button that cycles through the options, next to an order button.
 */
export function SortControls({ sortBy, sortOptions, setSortBy, sortOrder, setSortOrder }: SortControlsProps): React.JSX.Element {
  const cycleSort = (): void => {
    setSortBy(sortOptions[(sortOptions.indexOf(sortBy) + 1) % sortOptions.length]!);
  };

  return (
    <div className="atlas-am-sort">
      <LabelTooltip label={t('sort.current', { field: SORT_LABELS[sortBy] })}>
        <Button variant="ghost" className="atlas-am-sort-field" onClick={cycleSort}>
          {/* Every label is rendered in the same cell so the button is always as wide as the longest one */}
          <span className="atlas-am-sort-stack">
            {ALL_SORT_OPTIONS.map((option) => (
              <span key={option} aria-hidden={option !== sortBy} className={option === sortBy ? 'atlas-current' : ''}>
                {SORT_LABELS[option]}
              </span>
            ))}
          </span>
        </Button>
      </LabelTooltip>
      <LabelTooltip label={sortOrder === 'asc' ? t('am.menu.ascending') : t('am.menu.descending')}>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-icon-btn"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        >
          {sortOrder === 'asc' ? <ArrowUp /> : <ArrowDown />}
        </Button>
      </LabelTooltip>
    </div>
  );
}

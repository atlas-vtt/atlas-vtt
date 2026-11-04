import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../primitives/button';
import type { FilterChipGroup } from '../../search/activeFilterChips';
import { t } from '../../../../../i18n';

/** How long the pointer may leave a grouped chip before it folds, so moving into its list does not close it. */
const CLOSE_DELAY_MS = 120;

function SingleChip({ group }: { group: FilterChipGroup }): React.JSX.Element {
  const item = group.items[0]!;
  return (
    <Button variant="ghost" className="atlas-active-filter" onClick={item.remove} aria-label={t('filters.removeChip', { category: group.category, label: item.label })}>
      <span className="atlas-active-filter__category">{group.category}</span>
      <span className={`atlas-active-filter__value${item.excluded ? ' atlas-excluded' : ''}`}>{item.label}</span>
      <X />
    </Button>
  );
}

/** A filter with several values: its name and count, listing the values on hover or focus. */
function GroupedChip({ group }: { group: FilterChipGroup }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const cancelClose = (): void => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = (): void => { cancelClose(); setOpen(true); };
  const hide = (): void => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);

  return (
    <div
      className={`atlas-active-filter-group${open ? ' atlas-open' : ''}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}
    >
      <Button variant="ghost" className="atlas-active-filter" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="atlas-active-filter__category">{group.category}</span>
        <span className="atlas-active-filter__value">{group.items.length}</span>
      </Button>
      {open && (
        <div className="atlas-active-filter-group__list" role="group" aria-label={group.category}>
          <div className="atlas-active-filter-group__heading">
            <span>{group.category}</span>
            <Button variant="ghost" className="atlas-active-filter-group__clear" onClick={group.removeAll}>{t('filters.removeAll')}</Button>
          </div>
          {group.items.map((item) => (
            <Button key={item.key} variant="ghost" className="atlas-active-filter-group__item" onClick={item.remove} aria-label={t('filters.removeChip', { category: group.category, label: item.label })}>
              <span className={item.excluded ? 'atlas-active-filter__value atlas-excluded' : undefined}>{item.label}</span>
              <X />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ActiveFilterBarProps {
  groups: readonly FilterChipGroup[];
  onReset: () => void;
}

/** Every active filter under the header as a chip that removes it, and Reset for all of them. */
export function ActiveFilterBar({ groups, onReset }: ActiveFilterBarProps): React.JSX.Element | null {
  if (groups.length === 0) return null;
  return (
    <div className="atlas-active-filters" role="region" aria-label={t('filters.active')}>
      {groups.map((group) => (group.items.length === 1
        ? <SingleChip key={group.key} group={group} />
        : <GroupedChip key={group.key} group={group} />))}
      <Button variant="ghost" className="atlas-active-filters__reset" onClick={onReset}>{t('common.reset')}</Button>
    </div>
  );
}

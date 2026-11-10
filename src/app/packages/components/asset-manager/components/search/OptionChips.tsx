import React, { useRef } from 'react';
import type { FacetOption } from '../../../../../creatures/creatureFilterEngine';
import type { OptionState } from '../../../../../types/creatureFilterTypes';
import { Button } from '../../../primitives/button';

interface OptionChipsProps {
  options: readonly FacetOption[];
  /** Names the group for assistive technology. */
  label: string;
  onChange: (key: string, state: OptionState) => void;
}


const excluding = (state: OptionState): OptionState => (state === 'exclude' ? null : 'exclude');

/**
 * The options of a filter as chips with counts. A click requires an option or
 * clears it; a double-click (or Alt-click) excludes it or clears the exclusion.
 * Options no asset in view has are dimmed but stay pickable. The chips shown
 * are chosen by whoever holds the list (`OptionFilter`: the most common, or a search's matches).
 */
export function OptionChips({ options, label, onChange }: OptionChipsProps): React.JSX.Element {
  // A double-click's first click has already toggled the chip; it decides from the state before.
  const beforeFirstClick = useRef(new Map<string, OptionState>());

  const click = (option: FacetOption, event: React.MouseEvent): void => {
    if (event.detail > 1) return;
    beforeFirstClick.current.set(option.key, option.state);
    onChange(option.key, event.altKey ? excluding(option.state) : option.state === null ? 'include' : null);
  };

  const doubleClick = (option: FacetOption): void => {
    onChange(option.key, excluding(beforeFirstClick.current.get(option.key) ?? option.state));
  };

  return (
    <div className="atlas-filter-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.key}
          variant="ghost"
          className={`atlas-filter-chip${option.state === 'include' ? ' atlas-active' : ''}${option.state === 'exclude' ? ' atlas-excluded' : ''}${option.count === 0 ? ' atlas-empty' : ''}`}
          aria-pressed={option.state === 'include'}
          aria-label={`${option.label}, ${option.count}${option.state === 'exclude' ? ', excluded' : ''}`}
          onClick={(event) => click(option, event)}
          onDoubleClick={() => doubleClick(option)}
        >
          <span className="atlas-filter-chip__label">{option.label}</span>
          <span className="atlas-filter-chip__count">{option.count}</span>
        </Button>
      ))}
    </div>
  );
}

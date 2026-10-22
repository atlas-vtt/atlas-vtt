import React from 'react';
import { cn } from '../../../../utils/cn';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

interface ScopeChipProps {
  name: string;
  /** How many rules it holds; none shows no count. */
  count: number;
  selected: boolean;
  onSelect: () => void;
  chipRef?: (element: HTMLElement | null) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  /** Says what it stands for, where its name does not. */
  tip?: string;
}

/** What the card's spots can edit of a button, as a capsule of the rail's look: Always, or one action of a step. */
export function ScopeChip({ name, count, selected, onSelect, chipRef, onKeyDown, tip }: ScopeChipProps): React.ReactElement {
  const chip = (
    <button
      ref={chipRef}
      type="button"
      className={cn('atlas-rc-capsule atlas-rc-capsule--scope', selected && 'atlas-selected')}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span className="atlas-rc-capsule__name">{name}</span>
      {count > 0 && <span className="atlas-rc-capsule__count" aria-hidden="true">{count}</span>}
    </button>
  );
  return tip ? <LabelTooltip label={tip} describe>{chip}</LabelTooltip> : chip;
}

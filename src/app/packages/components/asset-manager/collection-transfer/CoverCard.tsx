import React from 'react';
import { Check } from 'lucide-react';
import { LabelTooltip } from '../../primitives/tooltip';

interface CoverCardProps {
  label: string;
  /** Tooltip, when it should say more than the label; otherwise it shows the full, possibly truncated, label. */
  hint?: string;
  selected?: boolean;
  /** Plain action cards (upload) are buttons, not options. */
  isOption?: boolean;
  variant?: 'art' | 'action';
  /** The side the tooltip opens on: away from the cards beside this one. */
  tooltipSide?: React.ComponentProps<typeof LabelTooltip>['side'];
  onSelect: () => void;
  children: React.ReactNode;
}

/** One choice of artwork: the picture with its name over it, ticked while it is the chosen one. Lives in a `radiogroup`. */
export function CoverCard({ label, hint, selected = false, isOption = true, variant = 'art', tooltipSide = 'left', onSelect, children }: CoverCardProps): React.JSX.Element {
  return (
    <LabelTooltip label={hint ?? label} side={tooltipSide} describe>
      <button
        type="button"
        className="atlas-transfer-cover-card"
        data-variant={variant}
        {...(isOption ? { role: 'radio', 'aria-checked': selected } : {})}
        onClick={onSelect}
      >
        <span className="atlas-transfer-cover-card__art">{children}</span>
        <span className="atlas-transfer-cover-card__label">{label}</span>
        {selected && <span className="atlas-transfer-cover-card__badge" aria-hidden="true"><Check /></span>}
      </button>
    </LabelTooltip>
  );
}

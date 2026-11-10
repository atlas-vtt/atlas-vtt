import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

export interface SelectionInfoProps {
  /** Selected assets and folders together. */
  count: number;
  onClear: () => void;
}

/** How many assets and folders are selected, with a button that clears the selection. Nothing while none is. */
export function SelectionInfo({ count, onClear }: SelectionInfoProps): React.JSX.Element | null {
  if (count === 0) return null;
  return (
    <div className="atlas-selection-info">
      <span>{count} {t('am.header.selected')}</span>
      <LabelTooltip label={t('dice.clearSelection')}>
        <Button variant="ghost" size="icon" className="atlas-clear-selection-btn" onClick={onClear}>
          <X />
        </Button>
      </LabelTooltip>
    </div>
  );
}

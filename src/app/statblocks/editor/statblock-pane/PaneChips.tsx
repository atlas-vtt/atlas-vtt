import React from 'react';
import { X } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';

/** A chip's remove button. A press keeps focus where it is, so removing never blurs (and commits) what is being typed. */
export function ChipRemove({ label, onRemove }: { label: string; onRemove: () => void }): React.JSX.Element {
  return (
    <LabelTooltip label={label}>
      <button
        type="button"
        className="atlas-sb-pane-chip__remove"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </button>
    </LabelTooltip>
  );
}

/** A part of a choice's line that names no option: kept as it is written until it is removed. */
export function UnreadChip({ part, onRemove }: { part: string; onRemove: () => void }): React.JSX.Element {
  return (
    <span className={cn('atlas-sb-pane-chip', 'atlas-sb-pane-pick--unread')}>
      <LabelTooltip label={t('statblockEditor.notAnOption')}>
        <span className="atlas-sb-pane-chip__text" tabIndex={0}>{part}</span>
      </LabelTooltip>
      <ChipRemove label={t('statblockEditor.removeNamed', { name: part })} onRemove={onRemove} />
    </span>
  );
}

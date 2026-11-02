import React from 'react';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';

interface IconActionProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  /** Left out of going round with the arrow keys: a mood's menu opens from the mood's own keys. */
  focusSkip?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** A small icon button, named by its tooltip. */
export function IconAction({ label, icon: Icon, pressed, disabled = false, className, focusSkip = false, onClick }: IconActionProps): React.JSX.Element {
  return (
    <LabelTooltip label={label}>
      <button type="button" disabled={disabled} aria-pressed={pressed} data-focus-skip={focusSkip || undefined} className={`atlas-sound-icon${className ? ` ${className}` : ''}`} onClick={onClick}>
        <Icon />
      </button>
    </LabelTooltip>
  );
}

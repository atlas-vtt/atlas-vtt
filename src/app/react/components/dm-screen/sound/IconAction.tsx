import React from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';

interface IconActionProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** A small icon button of a row, named by its tooltip. */
export function IconAction({ label, icon: Icon, pressed, disabled = false, className, onClick }: IconActionProps): React.JSX.Element {
  return (
    <LabelTooltip label={label}>
      <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-pressed={pressed} className={`atlas-sound-action${className ? ` ${className}` : ''}`} onClick={onClick}>
        <Icon />
      </Button>
    </LabelTooltip>
  );
}

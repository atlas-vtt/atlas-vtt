import * as React from 'react';
import { X } from 'lucide-react';
import { Button, type ButtonProps } from './button';
import { LabelTooltip } from './tooltip';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';

export type CloseButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'children'> & {
  /**
   * `panel` (default) closes the panel it sits in: it belongs at the end of a header
   * styled with `atlas-close-header`, or floats with `atlas-close-corner`, in a panel
   * whose radius is set with `atlas-panel-radius`. `inline` clears a field instead.
   */
  placement?: 'panel' | 'inline';
};

/**
 * The one close control for panels, modals and popovers: the same size, icon and
 * hover treatment everywhere, a fixed gap from the panel's border, and a corner
 * concentric with the panel's.
 */
export const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  ({ className, placement = 'panel', 'aria-label': ariaLabel = t('common.close'), title, ...props }, ref) => (
    <LabelTooltip label={title ?? ariaLabel}>
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="icon"
        className={cn(placement === 'inline' ? 'atlas-clear-btn' : 'atlas-close-btn', className)}
        {...props}
      >
        <X />
      </Button>
    </LabelTooltip>
  ),
);

CloseButton.displayName = 'CloseButton';

import { Pin, PinOff, Trash2 } from 'lucide-react';
import { useEffect, useRef, type ReactElement } from 'react';
import { Button } from '../../packages/components/primitives/button';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { classes } from './classes.ts';

export interface LogHeaderProps {
  readonly titleId: string;
  readonly pinned: boolean;
  /** The header asks whether to clear the log, in place of its title. */
  readonly asking: boolean;
  /** Clears the log for everyone; absent for a viewer who may not. */
  readonly onClear: (() => void) | undefined;
  readonly onAsk: (asking: boolean) => void;
  readonly onPin: (pinned: boolean) => void;
  readonly onClose: () => void;
}

/** The floating panel's header: its title, Clear (the GM), Pin and Close. Clear asks first, in place. */
export function LogHeader({ titleId, pinned, asking, onClear, onAsk, onPin, onClose }: LogHeaderProps): ReactElement {
  const clear = useRef<HTMLButtonElement>(null);
  const asked = useRef(asking);
  // The question's answer gives the focus back to the button that asked.
  useEffect(() => {
    if (asked.current && !asking) clear.current?.focus({ preventScroll: true });
    asked.current = asking;
  }, [asking]);

  return (
    <div className="atlas-online-log__header">
      <span id={titleId} className={classes('atlas-online-log__title', asking && 'atlas-online-log__sr')}>Table log</span>
      {asking && onClear !== undefined ? (
        <div className="atlas-online-log__ask">
          <span className="atlas-online-log__ask-text">Clear the log for everyone?</span>
          <Button variant="ghost" size="sm" className="atlas-online-log__ask-button atlas-online-log__ask-button--danger" onClick={onClear}>Clear</Button>
          <Button variant="ghost" size="sm" className="atlas-online-log__ask-button" autoFocus onClick={() => onAsk(false)}>Keep</Button>
        </div>
      ) : (
        <div className="atlas-online-log__actions">
          {onClear !== undefined && (
            <LabelTooltip label="Clear the log">
              <Button ref={clear} variant="ghost" size="icon" className="atlas-online-log__action" onClick={() => onAsk(true)}><Trash2 /></Button>
            </LabelTooltip>
          )}
          <LabelTooltip label={pinned ? 'Unpin' : 'Pin'}>
            <Button variant="ghost" size="icon" className={classes('atlas-online-log__action', pinned && 'is-pinned')} aria-pressed={pinned} onClick={() => onPin(!pinned)}>
              {pinned ? <PinOff /> : <Pin />}
            </Button>
          </LabelTooltip>
        </div>
      )}
      <CloseButton onClick={onClose} />
    </div>
  );
}

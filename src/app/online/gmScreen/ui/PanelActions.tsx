import React, { useEffect, useId, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { useEscapeUndo } from './panelEscape.ts';
import { useArmed } from './useArmed.ts';

const NAME = t('gmScreen.name');

interface PanelActionsProps {
  /** Devices allowed under the link now: a new link ends them all, so it asks first while there are any. */
  readonly devices: number;
  /** The panel opened itself for a device that asks to join: the buttons wait before they take a press. */
  readonly openedForKnock: boolean;
  readonly newLink: () => void;
  readonly stop: () => void;
}

/**
 * New link and Stop. Stop ends nothing for good (Start comes back with the same link and devices), so it
 * asks nothing; a new link ends every device, so it says so in place and waits for a second press. Where the
 * panel opened itself under the pointer for a device that asks to join, neither takes a press for a moment, once:
 * a click meant for what stood there before would land on them. Nothing else locks them; the line under the
 * code is one line in every language, so a connection that comes and goes moves nothing.
 */
export function PanelActions({ devices, openedForKnock, newLink, stop }: PanelActionsProps): React.JSX.Element {
  const id = useId();
  const [asking, setAsking] = useState(false);
  // The confirm's New link waits too, as its own second press: a double-click on New link never makes a new link.
  const armed = useArmed(asking ? 'asking' : 'opened', !openedForKnock);
  const cancel = useRef<HTMLButtonElement>(null);
  const pressNewLink = (): void => {
    if (devices > 0) setAsking(true);
    else newLink();
  };
  useEscapeUndo(asking, () => setAsking(false));
  useEffect(() => {
    if (asking) cancel.current?.focus();
  }, [asking]);
  if (asking) {
    return (
      <div className="atlas-gm-screen-confirm" role="group" aria-labelledby={`${id}-ask`}>
        <p id={`${id}-ask`} className="atlas-gm-screen-confirm__text">{t('gmScreen.newLinkConfirm')}</p>
        <div className="atlas-gm-screen-panel__actions">
          <Button ref={cancel} type="button" variant="secondary" onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
          <Button
            type="button"
            variant="destructive"
            aria-disabled={!armed || undefined}
            onClick={() => {
              if (!armed) return;
              setAsking(false);
              newLink();
            }}
          >
            {t('gmScreen.newLink')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="atlas-gm-screen-panel__actions">
      <Button type="button" variant="secondary" aria-disabled={!armed || undefined} onClick={() => armed && pressNewLink()}>{t('gmScreen.newLink')}</Button>
      <Button type="button" variant="secondary" className="atlas-gm-screen-stop" aria-disabled={!armed || undefined} onClick={() => armed && stop()}>{t('gmScreen.stop', { name: NAME })}</Button>
    </div>
  );
}

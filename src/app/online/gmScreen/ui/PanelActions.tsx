import React, { useEffect, useId, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { useEscapeUndo } from './panelEscape.ts';

const NAME = t('gmScreen.name');

interface PanelActionsProps {
  /** Devices allowed under the link now: a new link ends them all, so it asks first while there are any. */
  readonly devices: number;
  readonly newLink: () => void;
  readonly stop: () => void;
}

/**
 * New link and Stop. Stop ends nothing for good (Start comes back with the same link and devices), so it
 * asks nothing; a new link ends every device, so it says so in place and waits for a second press.
 */
export function PanelActions({ devices, newLink, stop }: PanelActionsProps): React.JSX.Element {
  const id = useId();
  const [asking, setAsking] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
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
            onClick={() => {
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
      <Button type="button" variant="secondary" onClick={() => (devices > 0 ? setAsking(true) : newLink())}>{t('gmScreen.newLink')}</Button>
      <Button type="button" variant="secondary" className="atlas-gm-screen-stop" onClick={stop}>{t('gmScreen.stop', { name: NAME })}</Button>
    </div>
  );
}

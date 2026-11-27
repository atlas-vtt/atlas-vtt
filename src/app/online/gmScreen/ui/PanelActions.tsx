import React, { useEffect, useId, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { useEscapeUndo } from './panelEscape.ts';
import { useArmed } from './useArmed.ts';

const NAME = t('gmScreen.name');

interface PanelActionsProps {
  /** Devices allowed under the link now: a new link ends them all, so it asks first while there are any. */
  readonly devices: number;
  /** The panel opened itself for a device that asks to join, a moment ago: the buttons take no press yet. */
  readonly locked: boolean;
  readonly newLink: () => void;
  readonly stop: () => void;
}

/** The New link question in place of the buttons; its New link waits from each asking, as its own second press: a double-click on New link never makes a new link. */
function NewLinkConfirm({ cancel, confirm }: { readonly cancel: () => void; readonly confirm: () => void }): React.JSX.Element {
  const id = useId();
  const armed = useArmed('asking', false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);
  return (
    <div className="atlas-gm-screen-confirm" role="group" aria-labelledby={`${id}-ask`}>
      <p id={`${id}-ask`} className="atlas-gm-screen-confirm__text">{t('gmScreen.newLinkConfirm')}</p>
      <div className="atlas-gm-screen-panel__actions">
        <Button ref={cancelButton} type="button" variant="secondary" onClick={cancel}>{t('common.cancel')}</Button>
        <Button type="button" variant="destructive" aria-disabled={!armed || undefined} onClick={() => armed && confirm()}>
          {t('gmScreen.newLink')}
        </Button>
      </div>
    </div>
  );
}

/**
 * New link and Stop. Stop ends nothing for good (Start comes back with the same link and devices), so it
 * asks nothing; a new link ends every device, so it says so in place and waits for a second press. Where the
 * panel opened itself under the pointer for a device that asks to join, neither takes a press for a moment, once
 * (`locked`): a click meant for what stood there before would land on them. Nothing else locks them; the line under
 * the code is one line in every language, so a connection that comes and goes moves nothing.
 */
export function PanelActions({ devices, locked, newLink, stop }: PanelActionsProps): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  const pressNewLink = (): void => {
    if (devices > 0) setAsking(true);
    else newLink();
  };
  useEscapeUndo(asking, () => setAsking(false));
  if (asking) {
    return <NewLinkConfirm cancel={() => setAsking(false)} confirm={() => {
      setAsking(false);
      newLink();
    }} />;
  }
  return (
    <div className="atlas-gm-screen-panel__actions">
      <Button type="button" variant="secondary" aria-disabled={locked || undefined} onClick={() => !locked && pressNewLink()}>{t('gmScreen.newLink')}</Button>
      <Button type="button" variant="secondary" className="atlas-gm-screen-stop" aria-disabled={locked || undefined} onClick={() => !locked && stop()}>{t('gmScreen.stop', { name: NAME })}</Button>
    </div>
  );
}

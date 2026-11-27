import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { showingGmScreenControl } from '../gmScreenSlot.ts';
import { GmScreenPanel } from './GmScreenPanel';
import { SidekickIcon } from './SidekickIcon';
import { useGmScreen } from './useGmScreen';
import type { CloseReason } from './useLightDismiss.ts';

const NAME = t('gmScreen.name');

/**
 * The DM screen's control for Sidekick on a phone or tablet: a button that says whether it runs and how
 * many devices are connected, and its panel. A device that asks to join opens the panel. Shown only
 * while online play is loaded.
 */
export function GmScreenControl(): React.JSX.Element | null {
  const handle = useGmScreen();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const knock = handle?.view.knock?.id ?? null;
  // A device that asks to join opens the panel, once per knock: closed again, it stays closed, and the
  // button's dot says a device still waits.
  const [asked, setAsked] = useState<string | null>(null);
  // While it shows, a knock needs no notice: the panel opens itself.
  useEffect(() => showingGmScreenControl(), []);
  if (knock !== asked) {
    setAsked(knock);
    if (knock !== null) setOpen(true);
  }
  if (handle === null) return null;
  const { view, session, account } = handle;
  const running = view.status === 'connecting' || view.status === 'online';
  const connected = view.devices.filter((device) => device.connected).length;
  const label = running ? t('gmScreen.controlRunning', { name: NAME, devices: t('gmScreen.deviceCount', { count: connected }) }) : t('gmScreen.start', { name: NAME });
  const close = (reason: CloseReason): void => {
    setOpen(false);
    // A press outside leaves the focus where it landed; closed from the keyboard or its own Close, it comes back here.
    if (reason !== 'outside') button.current?.focus();
  };
  return (
    <div className="atlas-gm-screen-control" data-status={view.status}>
      <LabelTooltip label={label}>
        <Button ref={button} type="button" variant="ghost" className="atlas-gm-screen-control__button" aria-expanded={open} onClick={() => setOpen(!open)}>
          <SidekickIcon className="atlas-gm-screen-control__icon" />
          <span>{NAME}</span>
          {running && <span className="atlas-gm-screen-control__count" aria-hidden="true">{connected}</span>}
          {view.waiting > 0 && <span className="atlas-gm-screen-control__waiting" aria-hidden="true" />}
        </Button>
      </LabelTooltip>
      <AnimatePresence>{open && <GmScreenPanel key="panel" session={session} view={view} account={account} onClose={close} />}</AnimatePresence>
    </div>
  );
}

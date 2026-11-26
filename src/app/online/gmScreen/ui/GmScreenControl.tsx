import React, { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { GmScreenPanel } from './GmScreenPanel';
import { useGmScreen } from './useGmScreen';

const NAME = t('gmScreen.name');

/**
 * The DM screen's control for the GM screen on a phone or tablet: a button that says whether it runs
 * and how many devices are connected, and its panel. A device that asks to join opens the panel. Shown
 * only while online play is loaded.
 */
export function GmScreenControl(): React.JSX.Element | null {
  const handle = useGmScreen();
  const [open, setOpen] = useState(false);
  const knock = handle?.view.knock?.id ?? null;
  // A device that asks to join opens the panel, once per knock: closed again, it stays closed.
  const [asked, setAsked] = useState<string | null>(null);
  if (knock !== asked) {
    setAsked(knock);
    if (knock !== null) setOpen(true);
  }
  if (handle === null) return null;
  const { view, session } = handle;
  const running = view.status === 'connecting' || view.status === 'online';
  const connected = view.devices.filter((device) => device.connected).length;
  const label = running ? t('gmScreen.controlRunning', { name: NAME, devices: t('gmScreen.deviceCount', { count: connected }) }) : t('gmScreen.start', { name: NAME });
  return (
    <div className="atlas-gm-screen-control" data-status={view.status}>
      <LabelTooltip label={label}>
        <Button variant="ghost" className="atlas-gm-screen-control__button" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Smartphone />
          <span>{NAME}</span>
          {running && <span className="atlas-gm-screen-control__count" aria-hidden="true">{connected}</span>}
          {view.waiting > 0 && <span className="atlas-gm-screen-control__waiting" aria-hidden="true" />}
        </Button>
      </LabelTooltip>
      {open && <GmScreenPanel session={session} view={view} onClose={() => setOpen(false)} />}
    </div>
  );
}

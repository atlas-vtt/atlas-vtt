import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { formatRelativeTime, type RelativeTimePhrases } from '../../../react/components/dashboard/relativeTime';
import type { GmScreenDeviceView } from '../gmScreenView.ts';
import { useEscapeUndo } from './panelEscape.ts';

/** How long Remove waits for its second press on a connected device before it is a plain Remove again. */
export const CONFIRM_MS = 3000;

const SEEN: RelativeTimePhrases = { justNow: 'gmScreen.seenJustNow', minutes: 'gmScreen.seenMinutes', hours: 'gmScreen.seenHours', days: 'gmScreen.seenDays' };

/** What a device's row says of it: connected, or when it was last seen (a record without the time says away). */
export const deviceState = (device: GmScreenDeviceView, now = Date.now()): string =>
  device.connected ? t('gmScreen.connected') : device.lastSeen > 0 ? formatRelativeTime(device.lastSeen, SEEN, now) : t('gmScreen.away');

interface DeviceRowProps {
  readonly device: GmScreenDeviceView;
  /** It came while the panel was open: it fades in. */
  readonly arrived: boolean;
  readonly remove: (id: string) => void;
}

/**
 * A device, live or away, and its Remove. A device that is away goes on one press; a connected one asks
 * lightly first: the button turns into Remove for a moment, and a second press removes it.
 */
export function DeviceRow({ device, arrived, remove }: DeviceRowProps): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  const confirming = asking && device.connected;
  useEffect(() => {
    if (!confirming) return undefined;
    const timer = window.setTimeout(() => setAsking(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);
  useEscapeUndo(confirming, () => setAsking(false));
  const label = confirming ? t('gmScreen.confirmRemoveLabel', { device: device.name }) : t('gmScreen.removeDevice', { device: device.name });
  return (
    <li className="atlas-gm-screen-device" data-connected={device.connected} data-arrived={arrived || undefined}>
      <span className="atlas-gm-screen-device__dot" aria-hidden="true" />
      <span className="atlas-gm-screen-device__text">
        <span className="atlas-gm-screen-device__name">{device.name}</span>
        <span className="atlas-gm-screen-device__state">{deviceState(device)}</span>
      </span>
      <LabelTooltip label={label}>
        <Button
          type="button"
          variant="ghost"
          size={confirming ? 'sm' : 'icon'}
          className="atlas-gm-screen-device__remove"
          data-confirming={confirming || undefined}
          onClick={() => (device.connected && !confirming ? setAsking(true) : remove(device.id))}
          onBlur={() => setAsking(false)}
        >
          {confirming ? t('gmScreen.confirmRemove') : <X />}
        </Button>
      </LabelTooltip>
    </li>
  );
}

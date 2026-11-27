import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { formatRelativeTime, type RelativeTimePhrases } from '../../../react/components/dashboard/relativeTime';
import type { GmScreenDeviceView } from '../gmScreenView.ts';
import { useEscapeUndo } from './panelEscape.ts';
import { useArmed } from './useArmed.ts';

/** How long Remove waits for its second press before it is a plain Remove again. */
export const CONFIRM_MS = 3000;

const SEEN: RelativeTimePhrases = { justNow: 'gmScreen.seenJustNow', minutes: 'gmScreen.seenMinutes', hours: 'gmScreen.seenHours', days: 'gmScreen.seenDays' };

/** What a device's row says of it: connected, or when it was last seen (a record without the time says away). */
export const deviceState = (device: GmScreenDeviceView, now = Date.now()): string =>
  device.connected ? t('gmScreen.connected') : device.lastSeen > 0 ? formatRelativeTime(device.lastSeen, SEEN, now) : t('gmScreen.away');

interface DeviceRowProps {
  readonly device: GmScreenDeviceView;
  /** It came while the panel was open: it fades in. */
  readonly arrived: boolean;
  /** Changes whenever the panel's rows may have moved on screen (a device asks, one comes or goes). */
  readonly layout?: string;
  readonly remove: (id: string) => void;
}

/**
 * A device, live or away, and its Remove, which always takes two presses: the first turns the button into
 * Remove, which takes the second once it has stood a moment (as Allow does) and for `CONFIRM_MS`. The
 * confirm ends when the row says something else (the device connected or left) or the rows may have
 * moved, since it would then stand under a pointer or a focus meant for something else; it never comes
 * back by itself.
 */
export function DeviceRow({ device, arrived, layout = '', remove }: DeviceRowProps): React.JSX.Element {
  const shown = `${String(device.connected)} ${layout}`;
  const [asking, setAsking] = useState<string | null>(null);
  if (asking !== null && asking !== shown) setAsking(null);
  const confirming = asking === shown;
  const armed = useArmed(confirming ? shown : '', false);
  useEffect(() => {
    if (!confirming) return undefined;
    const timer = window.setTimeout(() => setAsking(null), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);
  useEscapeUndo(confirming, () => setAsking(null));
  const label = confirming ? t('gmScreen.confirmRemoveLabel', { device: device.name }) : t('gmScreen.removeDevice', { device: device.name });
  const press = (): void => {
    if (!confirming) setAsking(shown);
    else if (armed) remove(device.id);
  };
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
          aria-disabled={(confirming && !armed) || undefined}
          onClick={press}
          onBlur={() => setAsking(null)}
        >
          {confirming ? t('gmScreen.confirmRemove') : <X />}
        </Button>
      </LabelTooltip>
    </li>
  );
}

import React from 'react';
import { X } from 'lucide-react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { formatRelativeTime } from '../../../react/components/dashboard/relativeTime';
import type { GmScreenDeviceView } from '../gmScreenView.ts';

interface DeviceListProps {
  readonly devices: readonly GmScreenDeviceView[];
  readonly remove: (id: string) => void;
}

/** The devices allowed under this link: whether each is connected or when it was last seen, and Remove. */
export function DeviceList({ devices, remove }: DeviceListProps): React.JSX.Element {
  return (
    <section className="atlas-gm-screen-devices" aria-labelledby="atlas-gm-screen-devices-title">
      <h3 id="atlas-gm-screen-devices-title" className="atlas-gm-screen-section-label">{t('gmScreen.devices')}</h3>
      {devices.length === 0 ? (
        <p className="atlas-gm-screen-help">{t('gmScreen.noDevices')}</p>
      ) : (
        <ul className="atlas-gm-screen-devices__list">
          {devices.map((device) => (
            <li key={device.id} className="atlas-gm-screen-device" data-connected={device.connected}>
              <span className="atlas-gm-screen-device__dot" aria-hidden="true" />
              <span className="atlas-gm-screen-device__text">
                <span className="atlas-gm-screen-device__name">{device.name}</span>
                <span className="atlas-gm-screen-device__state">{device.connected ? t('gmScreen.connected') : t('gmScreen.lastSeen', { when: formatRelativeTime(device.lastSeen) })}</span>
              </span>
              <LabelTooltip label={t('gmScreen.removeDevice', { device: device.name })}>
                <Button variant="ghost" size="icon" className="atlas-gm-screen-device__remove" onClick={() => remove(device.id)}>
                  <X />
                </Button>
              </LabelTooltip>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import React, { useId, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import type { GmScreenDeviceView } from '../gmScreenView.ts';
import type { DeviceFoldState } from './deviceFold.ts';
import { DeviceRow } from './DeviceRow';

interface DeviceListProps {
  readonly devices: readonly GmScreenDeviceView[];
  /** Whether the section is open (`useDeviceFold`). */
  readonly fold: DeviceFoldState;
  /** Changes whenever the panel's rows may have moved on screen (`DeviceRow`). */
  readonly layout?: string;
  readonly remove: (id: string) => void;
}

/**
 * The devices allowed under this link, as a section that folds, its count in its heading. It rests open
 * while a device is connected and folded while all are away, and opens for a device that arrives. A device
 * that asks to join is never in here: the Allow prompt stands above, whatever the fold.
 */
export function DeviceList({ devices, fold, layout = '', remove }: DeviceListProps): React.JSX.Element {
  const id = useId();
  // Rows already there as the panel opened stand still; only one that arrives fades in.
  const first = useRef(new Set(devices.map((device) => device.id)));
  if (devices.length === 0) {
    return (
      <section className="atlas-gm-screen-devices" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="atlas-gm-screen-devices__title atlas-gm-screen-section-label">{t('gmScreen.devices')}</h3>
        <p className="atlas-gm-screen-help">{t('gmScreen.noDevices')}</p>
      </section>
    );
  }
  return (
    <section className="atlas-gm-screen-devices" aria-labelledby={`${id}-title`}>
      <h3 className="atlas-gm-screen-devices__heading">
        <Button type="button" variant="ghost" id={`${id}-title`} className="atlas-gm-screen-devices__toggle" aria-expanded={fold.open} aria-controls={`${id}-list`} onClick={fold.toggle}>
          <span className="atlas-gm-screen-section-label">{t('gmScreen.devices')}</span>
          <span className="atlas-gm-screen-devices__count">{devices.length}</span>
          <ChevronDown className="atlas-gm-screen-devices__chevron" aria-hidden="true" />
        </Button>
      </h3>
      <div id={`${id}-list`} className="atlas-gm-screen-devices__fold" data-open={fold.open} inert={!fold.open}>
        <ul className="atlas-gm-screen-devices__list">
          {devices.map((device) => (
            <DeviceRow key={device.id} device={device} arrived={!first.current.has(device.id)} layout={layout} remove={remove} />
          ))}
        </ul>
      </div>
    </section>
  );
}

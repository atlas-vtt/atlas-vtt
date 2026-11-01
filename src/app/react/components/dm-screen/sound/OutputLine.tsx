import React from 'react';
import { Speaker } from 'lucide-react';
import { listOutputDevices } from '../../../../sound/engine/outputDevice';
import { t } from '../../../../i18n';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { useContextMenu } from '../../../root/ContextMenuContext';
import { useSoundValue } from './useSound';

/** One line for who hears it: online, the table; offline, the output of this device, chosen right here. */
export function OutputLine({ director }: { director: SoundDirector }): React.JSX.Element {
  const output = useSoundValue(director, (snapshot) => snapshot.output);
  const audience = useSoundValue(director, (snapshot) => snapshot.audience);
  const menu = useContextMenu();
  const open = async (anchor: HTMLElement): Promise<void> => {
    const devices = await listOutputDevices();
    const box = anchor.getBoundingClientRect();
    menu.open([
      { type: 'item', label: t('audio.outputDefault'), checked: output === null, onClick: () => director.setOutput(null) },
      ...devices.map((device, index) => {
        const label = device.label || t('audio.outputNumbered', { n: index + 1 });
        return { type: 'item' as const, label, checked: output?.id === device.id, onClick: () => director.setOutput({ id: device.id, label }) };
      }),
    ], { x: box.left, y: box.top }, { returnFocus: anchor });
  };
  return (
    <button type="button" className="atlas-sound-output" aria-label={t('audio.output')} onClick={(event) => void open(event.currentTarget)}>
      <Speaker aria-hidden="true" />
      <span>{audience ?? (output ? output.label || t('audio.outputUnnamed') : t('audio.outputDefault'))}</span>
    </button>
  );
}

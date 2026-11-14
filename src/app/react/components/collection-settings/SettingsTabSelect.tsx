import React, { useId } from 'react';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { t } from '../../../i18n';

interface SettingsTabSelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (tab: T) => void;
}

/**
 * A settings dialog's tabs as one select, in the sidebar's place where the dialog is too narrow for it (400 % zoom,
 * a phone-sized window): the stylesheet shows one or the other (`collection-settings-modal.scss`).
 */
export function SettingsTabSelect<T extends string>({ value, options, onChange }: SettingsTabSelectProps<T>): React.JSX.Element {
  const labelId = useId();
  return (
    <div className="atlas-collection-settings-tab-select">
      <span id={labelId} hidden>{t('csm.nav.label')}</span>
      <Select value={value} options={options} onChange={onChange} labelledBy={labelId} />
    </div>
  );
}

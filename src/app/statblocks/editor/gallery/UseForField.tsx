import React, { useId } from 'react';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import type { StatblockRole } from '../../model/roleTypes';
import { t } from '../../../i18n';

/** The Select's value for "give it to no role". */
const NO_ROLE = '';

export interface UseForFieldProps {
  /** The roles without a template of their own. */
  roles: readonly StatblockRole[];
  value: string | null;
  onChange: (roleId: string | null) => void;
  /** The gallery's overlay, where the list opens over the dialog, which clips its content. */
  layer: HTMLElement | null;
}

/** "Starts new statblocks for: [Monster ▾]" in the gallery's footer (§7.9): the kind of statblock the new template starts. */
export function UseForField({ roles, value, onChange, layer }: UseForFieldProps): React.JSX.Element {
  const labelId = useId();
  const options: SelectOption<string>[] = [
    { value: NO_ROLE, label: t('statblockEditor.nothingYet') },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ];
  return (
    <div className="atlas-te-gallery__use-for">
      <span id={labelId} className="atlas-te-gallery__use-for-label">{t('statblockEditor.startsFor')}</span>
      <Select value={value ?? NO_ROLE} options={options} labelledBy={labelId} onChange={(next) => onChange(next === NO_ROLE ? null : next)} layer={layer} />
    </div>
  );
}

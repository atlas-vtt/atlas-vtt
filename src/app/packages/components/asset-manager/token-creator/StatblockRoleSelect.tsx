import React, { useId } from 'react';
import { Select, type SelectOption } from '../../primitives/Select';
import type { StatblockRow } from './useStatblockRow';

/** The Select's value for tokens without a statblock. */
const NONE = '';

/**
 * The rail's Statblocks row (§7.3): the role every new token's statblock
 * gets, or none. Tokens staged from a statblock keep the one they link.
 */
export function StatblockRoleSelect({ row }: { row: StatblockRow }): React.JSX.Element {
  const labelId = useId();
  const options: SelectOption<string>[] = [
    { value: NONE, label: 'None' },
    ...row.choices.map((choice) => ({
      value: choice.roleId,
      label: choice.name,
      ...(choice.templateName && choice.templateName !== choice.name ? { detail: choice.templateName } : {}),
    })),
  ];
  return (
    <section className="atlas-token-creator__section">
      <div id={labelId} className="atlas-token-creator__section-title">Statblocks</div>
      <Select value={row.roleId ?? NONE} options={options} onChange={(value) => row.setRoleId(value === NONE ? null : value)} labelledBy={labelId} />
      <p className="atlas-token-creator__empty-note">
        {row.roleId === null ? 'New tokens get no statblock.' : 'Each new token gets a statblock of this role, linked to it.'}
      </p>
    </section>
  );
}

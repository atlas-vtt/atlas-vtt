import React from 'react';
import { RotateCcw } from 'lucide-react';
import { t } from '../../../i18n';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import type { RecoveryButton } from '../../../recovery/recoveryTypes';
import type { CounterRow } from '../../values/counterValues';
import { CardMenuButton } from './CardMenuButton';

interface CounterResetPickerProps {
  row: CounterRow;
  /** The recovery buttons of the statblock's template, in their order. */
  buttons: readonly RecoveryButton[];
  disabled: boolean;
  /** Names the button whose rest gives the row's uses back; null for none. */
  onPick: (reset: string | null) => void;
}

/**
 * Under a row of counters beside a player character's note: which rest gives its uses back (a
 * recovery button's rows rule names the rows set to it). Shows the rest's name, or only its glyph
 * while none is chosen; a press opens the template's buttons and None as a menu with a tick.
 */
export function CounterResetPicker({ row, buttons, disabled, onPick }: CounterResetPickerProps): React.JSX.Element {
  const chosen = buttons.find((button) => button.id === row.reset);
  const entries = (): ContextMenuEntry[] => [
    ...buttons.map((button): ContextMenuEntry => ({ type: 'item', label: button.name, checked: button.id === row.reset, onClick: () => onPick(button.id) })),
    MENU_SEPARATOR,
    { type: 'item', label: t('rest.resetNone'), checked: chosen === undefined, onClick: () => onPick(null) },
  ];
  return (
    <CardMenuButton className={`atlas-sb-counter__reset${chosen ? ' is-set' : ''}`} label={t('rest.resetLabel', { name: row.name })} disabled={disabled} entries={entries}>
      <RotateCcw aria-hidden="true" />
      {chosen && <span className="atlas-sb-counter__reset-name">{chosen.name}</span>}
    </CardMenuButton>
  );
}

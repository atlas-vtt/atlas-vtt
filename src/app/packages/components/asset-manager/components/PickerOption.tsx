import React from 'react';
import { Check } from 'lucide-react';
import { t } from '../../../../i18n';

/** What the picker's list hands each row: its option attributes (id, role, selection, highlight) and its classes. */
export interface PickerRow extends React.HTMLAttributes<HTMLDivElement> {
  selected: boolean;
}

interface PickerOptionProps {
  row: PickerRow;
  icon: React.ReactNode;
  name: string;
  nameRef?: React.Ref<HTMLSpanElement>;
  /** Said after the name and giving way first (the folders a found folder lies in). */
  detail?: React.ReactNode;
  /** Where the items lie now: marked, and the dialog's action waits for another row. */
  current: boolean;
  onSelect: () => void;
  style?: React.CSSProperties;
  /** A tooltip around the row (the whole name, a folder's path), which takes the row as its trigger. */
  wrap?: (row: React.JSX.Element) => React.JSX.Element;
}

/**
 * One row of a picker dialog's list (Move to folder, Move or Copy to collection): its glyph, its name cut with an
 * ellipsis, "(current)" said whole however long the name, and a tick on the chosen row.
 */
export function PickerOption({ row, icon, name, nameRef, detail, current, onSelect, style, wrap }: PickerOptionProps): React.JSX.Element {
  const { selected, ...optionProps } = row;
  const element = (
    <div {...optionProps} style={style} onClick={onSelect}>
      {icon}
      <span ref={nameRef} className="atlas-move-folder-name">{name}</span>
      {detail}
      {current && <span className="atlas-move-folder-current">{t('am.move.current')}</span>}
      {selected && <Check size={14} className="atlas-move-folder-check" />}
    </div>
  );
  return wrap ? wrap(element) : element;
}

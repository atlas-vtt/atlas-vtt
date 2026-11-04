import React from 'react';
import { EditableValue } from './EditableValue';
import { useStatblockEdit, type StatblockEditPath } from './statblockEditContext';

export interface EditableFieldProps {
  path: StatblockEditPath;
  value: string;
  /** Whether this value maps onto one frontmatter entry that can be written back. */
  editable: boolean;
  label?: string | undefined;
  multiline?: boolean | undefined;
  children: React.ReactNode;
}

/**
 * Wraps a value in an inline editor when the surrounding statblock is editable
 * and the underlying frontmatter value is a simple scalar.
 */
export function EditableField({ path, value, editable, label, multiline, children }: EditableFieldProps): React.JSX.Element {
  const edit = useStatblockEdit();

  if (!edit.editable || !editable || !path.length || path[0] === '') {
    return <>{children}</>;
  }

  return (
    <EditableValue
      value={value}
      multiline={multiline}
      ariaLabel={label}
      onCommit={(next) => edit.commit(path, next)}
    >
      {children}
    </EditableValue>
  );
}

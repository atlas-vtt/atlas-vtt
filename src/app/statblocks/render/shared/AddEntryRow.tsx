import React from 'react';
import { Plus } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

export interface AddEntryRowProps {
  /** "Add ability". */
  label: string;
  /** Starts a new entry at the end of the list; unset where the card is only shown (the template editor). */
  onAdd?: (() => void) | undefined;
  /** Only the plus, for the end of the list's heading; the label is its name and tooltip. */
  iconOnly?: boolean | undefined;
}

/**
 * What starts a new ability at the end of its list: a plus at the end of the
 * list's heading, or under a list without heading a line as quiet as an empty
 * value's prompt. The note view's is a button; the template editor draws the
 * same control inert, so its card stays the note view's.
 */
export function AddEntryRow({ label, onAdd, iconOnly = false }: AddEntryRowProps): React.JSX.Element {
  const attributes = { type: 'button', disabled: !onAdd, tabIndex: onAdd ? undefined : -1, onClick: onAdd } as const;
  if (!iconOnly) {
    return (
      <button {...attributes} className="atlas-sb-add-entry">
        <Plus aria-hidden="true" />
        {label}
      </button>
    );
  }
  return (
    <LabelTooltip label={label}>
      <button {...attributes} className="atlas-sb-add-entry atlas-sb-add-entry--icon">
        <Plus aria-hidden="true" />
      </button>
    </LabelTooltip>
  );
}

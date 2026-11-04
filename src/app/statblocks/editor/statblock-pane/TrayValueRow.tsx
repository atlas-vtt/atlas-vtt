import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../../packages/components/primitives/button';
import type { FieldValue, TemplateField } from '../../model/templateTypes';
import type { FieldRead } from '../../values/fieldValues';
import { parseNumberText } from '../../values/numberText';
import { valueText } from '../../values/valueText';
import { removedMessage } from './announcements';
import { ConflictChip } from './ConflictChip';
import { usePaneEdit } from './paneEditContext';
import { fieldPatches } from './valuePatches';
import { t } from '../../../i18n';

/** Typed text as the value it stands for: a number stays a number, a switch a switch; anything else is text. */
export function rawValue(text: string, old: FieldValue | undefined): FieldValue | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (typeof old === 'number') return parseNumberText(trimmed) ?? trimmed;
  if (typeof old === 'boolean' && (trimmed === 'true' || trimmed === 'false')) return trimmed === 'true';
  return trimmed;
}

const isScalar = (value: FieldValue | undefined): boolean => value === undefined || value === null || typeof value !== 'object';

interface TrayValueRowProps {
  field: TemplateField;
}

/**
 * A value the template hides from the card, by the name the template gives
 * it: its value as raw text (a list or a map shows read-only) and Remove from
 * note, a `delete` patch
 * that the note's own undo takes back. A commit is based on the value typing
 * started from, so a change in the note meanwhile is a conflict (§8.1).
 */
export function TrayValueRow({ field }: TrayValueRowProps): React.JSX.Element {
  const pane = usePaneEdit();
  const read = pane.read(field);
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? valueText(read.value);
  const conflict = pane.conflicts.get(field.key);

  // What is typed, and the value shown when typing started.
  const typed = useRef<{ text: string; from: FieldRead } | null>(null);
  const type = (text: string | null): void => {
    typed.current = text === null ? null : { text, from: typed.current?.from ?? read };
    setDraft(text);
  };
  const commit = (): void => {
    const edit = typed.current;
    if (edit === null) return;
    type(null);
    const next = rawValue(edit.text, edit.from.value);
    void pane.write(field, fieldPatches(field.key, edit.from, next), { base: edit.from.value, mine: next });
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

  return (
    <div className="atlas-sb-pane-tray__row">
      <span className="atlas-sb-pane-tray__key">{field.label}</span>
      {isScalar(read.value) ? (
        <input
          type="text"
          className="atlas-sb-pane-input atlas-sb-pane-tray__value"
          value={shown}
          aria-label={field.label}
          onChange={(event) => type(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            commit();
          }}
        />
      ) : (
        <span className="atlas-sb-pane-tray__value atlas-sb-pane-tray__value--read-only">{valueText(read.value)}</span>
      )}
      {conflict && <ConflictChip field={field} conflict={conflict} />}
      <span className="atlas-sb-pane-tray__actions">
        {read.value !== undefined && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void pane.write(field, fieldPatches(field.key, read, undefined));
              pane.announce(removedMessage(field.key, 'Removed'));
            }}
          >
            {t('statblockEditor.removeFromNote')}
          </Button>
        )}
      </span>
    </div>
  );
}

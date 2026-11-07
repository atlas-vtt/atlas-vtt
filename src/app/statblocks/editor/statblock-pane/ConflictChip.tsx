import React, { useRef } from 'react';
import { Button } from '../../../packages/components/primitives/button';
import type { FieldValue, TemplateField } from '../../model/templateTypes';
import { valueText } from '../../values/valueText';
import { usePaneEdit, type FieldConflict } from './paneEditContext';
import { t } from '../../../i18n';

/** A value as the chip writes it; an empty one as a dash. */
function shown(value: FieldValue | undefined): string {
  const text = valueText(value).trim();
  return text === '' ? '–' : text;
}

/**
 * Where focus goes once the chip is answered and leaves: the value it is about, its block in the card or its row's
 * input in the tray (else a control of the row that is not the chip's).
 */
function valueOf(chip: HTMLElement | null): HTMLElement | null {
  const holder = chip?.closest<HTMLElement>('[data-block-id], .atlas-sb-pane-tray__row');
  if (!chip || !holder) return null;
  if (holder.hasAttribute('data-block-id')) return holder;
  const controls = [...holder.querySelectorAll<HTMLElement>('input, button')].filter((control) => !chip.contains(control));
  return controls.find((control) => control.tagName === 'INPUT') ?? controls[0] ?? null;
}

/**
 * A commit the note refused because the value changed there meanwhile
 * (§8.6): "Changed in the note: 14 → 18", with Keep mine (written again over
 * the note's value) and Use the note's (the note's value stays).
 */
export function ConflictChip({ field, conflict }: { field: TemplateField; conflict: FieldConflict }): React.JSX.Element {
  const pane = usePaneEdit();
  const ref = useRef<HTMLSpanElement>(null);
  const now = pane.read(field).value;
  const answer = (choose: (field: TemplateField) => void): void => {
    valueOf(ref.current)?.focus({ preventScroll: true });
    choose(field);
  };
  const text = conflict.canKeepMine ? t('statblockEditor.changedInNoteFrom', { from: shown(conflict.base), to: shown(now) }) : t('statblockEditor.changedInNote');

  return (
    <span ref={ref} className="atlas-sb-pane-conflict" role="group" aria-label={`${field.label} conflict`}>
      <span className="atlas-sb-pane-conflict__text">{text}</span>
      {conflict.canKeepMine && (
        <Button type="button" variant="ghost" size="sm" onClick={() => answer(pane.keepMine)}>{t('statblockEditor.keepMine')}</Button>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => answer(pane.keepNotes)}>{t('statblockEditor.useNotes')}</Button>
    </span>
  );
}

import { MAX_CHAT_TEXT } from '../protocol/index.ts';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { isComposing, useGrowingField } from './growField.ts';

export interface EditFieldProps {
  readonly text: string;
  readonly onSave: (text: string) => void;
  readonly onCancel: () => void;
}

/** A message being edited in its place: Enter saves, Escape (the panel's) cancels, and so does a text left empty or as it was. */
export function EditField({ text, onSave, onCancel }: EditFieldProps): ReactElement {
  const field = useRef<HTMLTextAreaElement>(null);
  const name = useId();
  const [draft, setDraft] = useState(text);
  useGrowingField(field, draft);

  useLayoutEffect(() => {
    const element = field.current;
    if (element === null) return;
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  const save = (): void => {
    const next = draft.trim();
    if (next === '' || next === text) onCancel();
    else onSave(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || isComposing(event)) return;
    event.preventDefault();
    save();
  };

  return (
    <div className="atlas-online-log__edit">
      <div className="atlas-online-log__edit-box">
        <label className="atlas-online-log__sr" htmlFor={name}>Edit message</label>
        <textarea ref={field} id={name} className="atlas-online-log__input" rows={1} maxLength={MAX_CHAT_TEXT} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
      </div>
      <div className="atlas-online-log__edit-actions">
        <span className="atlas-online-log__edit-hint">Enter saves, Escape cancels</span>
        <button type="button" className="atlas-online-log__text-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="atlas-online-log__text-button atlas-online-log__text-button--accent" onClick={save}>Save</button>
      </div>
    </div>
  );
}

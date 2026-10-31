import React, { useId, useRef, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import { EditorDialog } from '../inspector/EditorDialog';
import { saveChoice, type NameTaken, type SaveRequest, type SaveSubject } from './saveChoice';
import { t } from '../../../../i18n';

export interface SaveTemplateDialogProps {
  /** An element of the window the dialog opens in. */
  anchor: HTMLElement;
  subject: SaveSubject;
  taken: NameTaken;
  /** Saves as asked; resolves with why it could not, or null once it did. */
  onSave: (request: SaveRequest) => Promise<string | null>;
  onClose: () => void;
  /** Saved: the dialog has nothing left to do. Unset, it closes. */
  onSaved?: (() => void) | undefined;
}

/**
 * Save (the capsule's button, Mod+S, or the question a closed editor asks):
 * the template's name, ready to change. Its own name updates the template,
 * another saves a new one; a built-in is always saved as a new template.
 */
export function SaveTemplateDialog({ anchor, subject, taken, onSave, onClose, onSaved }: SaveTemplateDialogProps): React.JSX.Element {
  const [name, setName] = useState(subject.name);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const inputId = useId();
  const lineId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const choice = saveChoice(subject, name, taken);
  // A built-in opens with its own name, which it cannot be saved under: the hint says so until the name is changed.
  const [edited, setEdited] = useState(false);
  const problem = failed ?? (edited || !subject.builtIn ? choice.problem : null);
  const line = problem ?? choice.hint;
  const ready = !busy && choice.problem === null;

  const save = (): void => {
    if (!ready) return;
    setBusy(true);
    void onSave({ kind: choice.kind, name: name.trim() }).then((problemText) => {
      setBusy(false);
      if (problemText === null) (onSaved ?? onClose)();
      else setFailed(problemText);
    });
  };

  return (
    <EditorDialog
      anchor={anchor}
      title={subject.unsaved ? t('templateEditor.save.title') : t('templateEditor.save.titleNamed', { name: subject.name })}
      onClose={onClose}
      initialFocus={inputRef}
      footer={(
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('templateEditor.cancel')}</Button>
          <Button type="button" variant="default" size="sm" disabled={!ready} onClick={save}>{busy ? t('templateEditor.saving') : choice.label}</Button>
        </>
      )}
    >
      <div className="atlas-te-dialog__field">
        <label htmlFor={inputId} className="atlas-te-dialog__label">{t('templateEditor.name')}</label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className="atlas-te-save__name"
          value={name}
          spellCheck={false}
          aria-invalid={problem ? true : undefined}
          aria-describedby={line ? lineId : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setName(event.target.value);
            setEdited(true);
            setFailed(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            save();
          }}
        />
        {line && <p id={lineId} className={problem ? 'atlas-te-save__problem' : 'atlas-te-dialog__text'}>{line}</p>}
      </div>
    </EditorDialog>
  );
}

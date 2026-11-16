import React, { useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import { EditorDialog } from '../inspector/EditorDialog';
import type { NameTaken, SaveRequest, SaveSubject } from './saveChoice';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { t } from '../../../../i18n';

export interface UnsavedChangesDialogProps {
  anchor: HTMLElement;
  subject: SaveSubject;
  taken: NameTaken;
  onSave: (request: SaveRequest) => Promise<string | null>;
  /** Back to editing: the editor opens again with the changes. */
  onKeepEditing: () => void;
  /** Saved, or Don't save: the question is answered, and the changes not saved go with it. */
  onDone: () => void;
}

/**
 * "Save changes to Marsh creature?", asked once a template editor with unsaved
 * changes has closed: Obsidian cannot keep a tab from closing, so the draft
 * waits here. Save asks for the name as the editor's Save does; Keep editing
 * (or closing the question) opens the editor again with the changes.
 */
export function UnsavedChangesDialog(props: UnsavedChangesDialogProps): React.JSX.Element {
  const { anchor, subject } = props;
  const [saving, setSaving] = useState(false);

  if (saving) {
    return (
      <SaveTemplateDialog anchor={anchor} subject={subject} taken={props.taken} onSave={props.onSave} onClose={() => setSaving(false)} onSaved={props.onDone} />
    );
  }
  return (
    <EditorDialog
      anchor={anchor}
      title={t('templateEditor.save.unsavedTitle', { name: subject.name })}
      onClose={props.onKeepEditing}
      footer={(
        <>
          <Button type="button" variant="outline" size="sm" onClick={props.onDone}>{t('templateEditor.save.dontSave')}</Button>
          <Button type="button" variant="outline" size="sm" onClick={props.onKeepEditing}>{t('templateEditor.save.keepEditing')}</Button>
          <Button type="button" variant="default" size="sm" onClick={() => setSaving(true)}>{t('templateEditor.save.save')}</Button>
        </>
      )}
    >
      <p className="atlas-te-dialog__text">{t('templateEditor.save.closedUnsaved')}</p>
    </EditorDialog>
  );
}
